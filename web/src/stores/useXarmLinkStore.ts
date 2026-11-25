import { create } from "zustand";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";
import {
  XARM_HID_PRODUCT_ID,
  XARM_HID_REPORT_ID,
  XARM_HID_VENDOR_ID,
  XARM_UART_BAUD,
  buildBatteryPacket,
  buildPoseMovePacket,
  buildReadPositionsPacket,
  buildServoOffPacket,
  extractFrames,
  formatFrameHex,
  jointsFromServoPositions,
  parseReply,
  toHidReport,
} from "@/lib/hardware/hiwonderXarm";
import { useCodeStore } from "./useCodeStore";
import { usePathStore } from "./usePathStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";

/** Minimal WebHID surface (the DOM lib in this TS setup has no WebHID types). */
interface HidInputReportEventLike extends Event {
  data: DataView;
}
interface HidDeviceLike {
  opened: boolean;
  productName: string;
  open: () => Promise<void>;
  close: () => Promise<void>;
  sendReport: (reportId: number, data: Uint8Array) => Promise<void>;
  addEventListener: (type: "inputreport", cb: (e: HidInputReportEventLike) => void) => void;
  removeEventListener: (type: "inputreport", cb: (e: HidInputReportEventLike) => void) => void;
}
interface HidLike {
  requestDevice: (opts: { filters: Array<{ vendorId: number; productId: number }> }) => Promise<HidDeviceLike[]>;
}

export type XarmTransportKind = "NONE" | "HID" | "SERIAL";

/** A connected byte channel to the xArm controller board. */
export interface XarmTransport {
  kind: Exclude<XarmTransportKind, "NONE">;
  label: string;
  send: (frame: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

interface XarmLinkState {
  connected: boolean;
  transport: XarmTransportKind;
  deviceLabel: string;
  /** Stream every simulator pose change to the servos. */
  mirror: boolean;
  /** Torque off + continuous read-back: move the real arm by hand and the simulator follows. */
  teach: boolean;
  /** Speed cap for mirrored moves (deg/s) so a sudden jump in the simulator moves the arm gently. */
  maxSpeedDegPerSec: number;
  batteryVolts: number | null;
  txCount: number;
  rxCount: number;
  lastError: string;

  connectHid: () => Promise<void>;
  connectSerial: () => Promise<void>;
  /** Wires an already-open transport (used by connectHid / connectSerial, and by tests). */
  attachTransport: (transport: XarmTransport) => void;
  disconnect: () => Promise<void>;
  /** Feeds bytes received from the board (one HID input report, or a UART chunk). */
  handleIncomingBytes: (bytes: Uint8Array) => void;
  setMirror: (on: boolean) => void;
  setTeach: (on: boolean) => void;
  setMaxSpeed: (degPerSec: number) => void;
  /** Sends the simulator's current pose now, over `durationMs`. */
  sendCurrentPose: (durationMs?: number) => Promise<void>;
  readPositions: () => Promise<void>;
  readBattery: () => Promise<void>;
  servoOff: () => Promise<void>;
}

const MIRROR_INTERVAL_MS = 50;
const MIN_MOVE_MS = 60;
const SYNC_MOVE_MS = 1500;
const TEACH_POLL_MS = 150;

let transport: XarmTransport | null = null;
let uartRest: Uint8Array = new Uint8Array(0);
let unsubscribeRobot: (() => void) | null = null;
let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let teachTimer: ReturnType<typeof setInterval> | null = null;
let lastSentJoints: number[] | null = null;
let lastSentGripperClosed: boolean | null = null;
/** Apply the next position reply to the simulator (explicit read or teach polling). */
let applyNextPositions = false;

function busServos() {
  const map = getActiveRobotProfile().busServos;
  if (!map) throw new Error("The active robot has no bus-servo map");
  return map;
}

function allServoIds(): number[] {
  const { joints, gripper } = busServos();
  return [...joints.map((j) => j.servoId), gripper.servoId];
}

function log(dir: "sys" | "out" | "in" | "ok" | "error", text: string) {
  useSerialStore.getState().appendLog({ dir, text: `[xArm] ${text}` });
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useXarmLinkStore = create<XarmLinkState>((set, get) => {
  const send = async (frame: Uint8Array, opts: { quiet?: boolean } = {}) => {
    if (!transport) return;
    try {
      await transport.send(frame);
      set((s) => ({ txCount: s.txCount + 1 }));
      if (!opts.quiet) log("out", formatFrameHex(frame));
    } catch (err) {
      const msg = errorMessage(err, "Send failed");
      set({ lastError: msg });
      log("error", msg);
    }
  };

  const movePose = (joints: readonly number[], gripperClosed: boolean, durationMs: number, quiet: boolean) => {
    const { joints: maps, gripper } = busServos();
    lastSentJoints = joints.slice();
    lastSentGripperClosed = gripperClosed;
    return send(
      buildPoseMovePacket(joints, maps, Math.round(durationMs), { map: gripper, closed: gripperClosed }),
      { quiet }
    );
  };

  /** Duration that keeps every joint under the speed cap (and never shorter than the stream tick). */
  const durationFor = (joints: readonly number[]) => {
    if (!lastSentJoints) return SYNC_MOVE_MS;
    const maxDelta = joints.reduce((m, q, i) => Math.max(m, Math.abs(q - (lastSentJoints![i] ?? 0))), 0);
    return Math.max(MIN_MOVE_MS, (maxDelta / Math.max(1, get().maxSpeedDegPerSec)) * 1000);
  };

  const flushMirror = () => {
    mirrorTimer = null;
    const { connected, mirror, teach } = get();
    if (!connected || !mirror || teach) return;
    const robot = useRobotStore.getState();
    const closed = robot.gripperState === "CLOSE";
    const same =
      lastSentJoints &&
      lastSentGripperClosed === closed &&
      robot.joints.every((q, i) => Math.abs(q - (lastSentJoints![i] ?? 0)) < 0.05);
    if (same) return;
    void movePose(robot.joints, closed, durationFor(robot.joints), true);
  };

  const scheduleMirror = () => {
    if (mirrorTimer) return;
    mirrorTimer = setTimeout(flushMirror, MIRROR_INTERVAL_MS);
  };

  const stopTeachPolling = () => {
    if (teachTimer) clearInterval(teachTimer);
    teachTimer = null;
  };

  const resetLinkState = () => {
    stopTeachPolling();
    if (mirrorTimer) clearTimeout(mirrorTimer);
    mirrorTimer = null;
    unsubscribeRobot?.();
    unsubscribeRobot = null;
    transport = null;
    uartRest = new Uint8Array(0);
    lastSentJoints = null;
    lastSentGripperClosed = null;
    applyNextPositions = false;
  };

  return {
    connected: false,
    transport: "NONE",
    deviceLabel: "",
    mirror: false,
    teach: false,
    maxSpeedDegPerSec: 90,
    batteryVolts: null,
    txCount: 0,
    rxCount: 0,
    lastError: "",

    async connectHid() {
      const hid = (navigator as Navigator & { hid?: HidLike }).hid;
      if (!hid) {
        const msg = "WebHID needs Chrome or Edge on desktop (or use USB serial).";
        set({ lastError: msg });
        log("error", msg);
        return;
      }
      try {
        const [device] = await hid.requestDevice({
          filters: [{ vendorId: XARM_HID_VENDOR_ID, productId: XARM_HID_PRODUCT_ID }],
        });
        if (!device) return; // picker cancelled
        if (!device.opened) await device.open();
        const onReport = (e: HidInputReportEventLike) =>
          get().handleIncomingBytes(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
        device.addEventListener("inputreport", onReport);
        get().attachTransport({
          kind: "HID",
          label: device.productName || "xArm (USB HID)",
          send: (frame) => device.sendReport(XARM_HID_REPORT_ID, toHidReport(frame)),
          close: async () => {
            device.removeEventListener("inputreport", onReport);
            await device.close();
          },
        });
      } catch (err) {
        const msg = errorMessage(err, "Could not open the xArm USB device");
        set({ lastError: msg });
        log("error", msg);
      }
    },

    async connectSerial() {
      const serial = (
        navigator as Navigator & {
          serial?: {
            requestPort: () => Promise<{
              open: (o: { baudRate: number }) => Promise<void>;
              close: () => Promise<void>;
              readable: ReadableStream<Uint8Array> | null;
              writable: WritableStream<Uint8Array> | null;
            }>;
          };
        }
      ).serial;
      if (!serial) {
        const msg = "Web Serial needs Chrome, Edge or Opera on desktop.";
        set({ lastError: msg });
        log("error", msg);
        return;
      }
      try {
        const port = await serial.requestPort();
        await port.open({ baudRate: XARM_UART_BAUD });
        const writer = port.writable?.getWriter() ?? null;
        const reader = port.readable?.getReader() ?? null;
        let open = true;
        get().attachTransport({
          kind: "SERIAL",
          label: `USB serial @ ${XARM_UART_BAUD}`,
          send: async (frame) => {
            if (!writer) throw new Error("Serial port is not writable");
            await writer.write(frame);
          },
          close: async () => {
            open = false;
            await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
            writer?.releaseLock();
            await port.close();
          },
        });
        void (async () => {
          while (open && reader) {
            const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
            if (done) break;
            if (value) get().handleIncomingBytes(value);
          }
        })();
      } catch (err) {
        const msg = errorMessage(err, "Could not open the serial port");
        set({ lastError: msg });
        log("error", msg);
      }
    },

    attachTransport(next) {
      resetLinkState();
      transport = next;
      set({
        connected: true,
        transport: next.kind,
        deviceLabel: next.label,
        mirror: false,
        teach: false,
        lastError: "",
        txCount: 0,
        rxCount: 0,
      });
      unsubscribeRobot = useRobotStore.subscribe((s, prev) => {
        if (s.joints !== prev.joints || s.gripperState !== prev.gripperState) scheduleMirror();
      });
      log("ok", `Connected: ${next.label}. Press "Read positions" to check the link, then enable Follow simulator.`);
      void get().readBattery();
    },

    async disconnect() {
      const t = transport;
      resetLinkState();
      set({ connected: false, transport: "NONE", deviceLabel: "", mirror: false, teach: false });
      if (t) {
        await t.close().catch(() => undefined);
        log("sys", "Disconnected");
      }
    },

    handleIncomingBytes(bytes) {
      const frames =
        get().transport === "SERIAL"
          ? (() => {
              const merged = new Uint8Array(uartRest.length + bytes.length);
              merged.set(uartRest);
              merged.set(bytes, uartRest.length);
              const out = extractFrames(merged);
              uartRest = out.rest;
              return out.frames;
            })()
          : [bytes];

      for (const frame of frames) {
        const reply = parseReply(frame);
        if (!reply) continue;
        set((s) => ({ rxCount: s.rxCount + 1 }));
        if (reply.kind === "BATTERY") {
          set({ batteryVolts: reply.volts });
          if (!get().teach) log("in", `Battery ${reply.volts.toFixed(2)} V`);
        } else if (reply.kind === "POSITIONS") {
          if (!applyNextPositions && !get().teach) continue;
          applyNextPositions = false;
          const { joints: maps } = busServos();
          const robot = useRobotStore.getState();
          const q = jointsFromServoPositions(reply.positions, maps, robot.joints);
          usePathStore.getState().cancelForManualControl();
          useCodeStore.getState().stop();
          // What the arm reports is what it already holds: don't echo it back as a move.
          lastSentJoints = q.slice();
          robot.setJoints(q, { syncIk: true });
          if (!get().teach) {
            log("in", `Positions: ${[...reply.positions].map(([id, p]) => `#${id}=${p}`).join(" ")}`);
          }
        }
      }
    },

    setMirror(on) {
      if (on === get().mirror) return;
      set({ mirror: on });
      if (!on || !get().connected) return;
      if (get().teach) get().setTeach(false);
      // First move syncs the real arm slowly to wherever the simulator is.
      const robot = useRobotStore.getState();
      log("sys", `Follow simulator ON: moving the arm to the simulator pose over ${SYNC_MOVE_MS / 1000}s`);
      void movePose(robot.joints, robot.gripperState === "CLOSE", SYNC_MOVE_MS, false);
    },

    setTeach(on) {
      if (on === get().teach) return;
      if (on) {
        if (!get().connected) return;
        set({ teach: true, mirror: false });
        void send(buildServoOffPacket(busServos().joints.map((j) => j.servoId)));
        log("sys", "Teach mode: servos are limp, move the arm by hand. The simulator follows.");
        teachTimer = setInterval(() => {
          void send(buildReadPositionsPacket(busServos().joints.map((j) => j.servoId)), { quiet: true });
        }, TEACH_POLL_MS);
      } else {
        stopTeachPolling();
        set({ teach: false });
        log("sys", "Teach mode off: servos stay limp until the next move is sent.");
      }
    },

    setMaxSpeed(degPerSec) {
      set({ maxSpeedDegPerSec: Math.max(10, Math.min(360, Math.round(degPerSec))) });
    },

    async sendCurrentPose(durationMs = SYNC_MOVE_MS) {
      if (!get().connected) return;
      const robot = useRobotStore.getState();
      await movePose(robot.joints, robot.gripperState === "CLOSE", durationMs, false);
    },

    async readPositions() {
      if (!get().connected) return;
      applyNextPositions = true;
      await send(buildReadPositionsPacket(allServoIds()));
    },

    async readBattery() {
      if (!get().connected) return;
      await send(buildBatteryPacket(), { quiet: true });
    },

    async servoOff() {
      if (!get().connected) return;
      set({ mirror: false });
      await send(buildServoOffPacket(allServoIds()));
      log("sys", "All servos off (torque released)");
    },
  };
});
