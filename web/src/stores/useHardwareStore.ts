import { create } from "zustand";
import { HOME_JOINTS } from "@/lib/kinematics/constants";
import { pose6DToTargetMatrix } from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import { pathTrajectorySample } from "@/lib/path/trajectory";
import {
  formatO103StatusReply,
  formatWlkataStatusReport,
  formatSensorLine,
  formatColorLine,
  parseIncomingHardwareLine,
  type VirtualControllerState,
} from "@/lib/hardware/protocol";
import { boxAtSensor, boxColorName } from "@/lib/sim/workcell";
import { useCodeStore } from "./useCodeStore";
import { useWorkcellStore } from "./useWorkcellStore";
import { usePathStore } from "./usePathStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";
import { useViewerStore } from "./useViewerStore";
import { t } from "@/lib/i18n";

export type HardwareTransport = "NONE" | "SERIAL" | "WEBSOCKET";
export type HardwareMotionMode = "SMOOTH" | "INSTANT";

export interface IdxSortingTelemetry {
  stateId: number;
  stateName: string;
  lightAdc: number;
  currentAdc: number;
  okCount: number;
  ngCount: number;
  out8: boolean;
  out9: boolean;
  out10: boolean;
  updatedAt: number;
}

const IDX_SORTING_STATES = [
  "BOOT",
  "HOMING",
  "IDLE",
  "WAITING PART (GPIO23)",
  "INSPECTING",
  "MOVE ABOVE PICK",
  "PICK DOWN",
  "SUCTION ON",
  "PICK UP",
  "MOVE PLACE",
  "PLACE DOWN",
  "SUCTION OFF",
  "PLACE UP",
  "RETURN STANDBY",
  "MANUAL",
  "PAUSED",
  "ALARM E-STOP",
];

function parseIdxSortingTelemetry(line: string): IdxSortingTelemetry | null {
  if (!line.startsWith("@99o200=")) return null;
  const nums = line
    .slice(8)
    .split(",")
    .map((s) => Number(s.trim()));
  if (nums.length < 8 || nums.slice(0, 8).some((n) => !Number.isFinite(n))) return null;
  const stateId = nums[0];
  return {
    stateId,
    stateName: IDX_SORTING_STATES[stateId] ?? `STATE_${stateId}`,
    lightAdc: nums[1],
    currentAdc: nums[2],
    okCount: nums[3],
    ngCount: nums[4],
    out8: nums[5] !== 0,
    out9: nums[6] !== 0,
    out10: nums[7] !== 0,
    updatedAt: Date.now(),
  };
}

interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SmoothMoveTarget {
  startJoints: number[];
  targetJoints: number[];
  elapsedMs: number;
  durationMs: number;
  kind: "MOVE" | "HOME" | "WAIT";
}

interface HardwareState {
  connected: boolean;
  transport: HardwareTransport;
  baudRate: number;
  wsUrl: string;
  addressFilter: string;
  motionMode: HardwareMotionMode;
  autoReply: boolean;
  /** Push `SENSOR=1/0` to the master whenever the conveyor light sensor changes. */
  reportSensor: boolean;
  controllerState: VirtualControllerState;
  lastMotionSpace: "Angle" | "Cartesian";
  defaultFeed: number;
  pumpPwm: number;
  valvePwm: number;
  rxCount: number;
  txCount: number;
  hmiCount: number;
  idxTelemetry: IdxSortingTelemetry | null;
  lastRx: string;
  lastError: string;
  smoothTarget: SmoothMoveTarget | null;

  setBaudRate: (baud: number) => void;
  setWsUrl: (url: string) => void;
  setAddressFilter: (addr: string) => void;
  setMotionMode: (mode: HardwareMotionMode) => void;
  setAutoReply: (enabled: boolean) => void;

  connectSerial: () => Promise<void>;
  connectWebSocket: (url?: string) => void;
  disconnect: () => Promise<void>;
  sendRawLine: (line: string) => Promise<void>;
  setReportSensor: (on: boolean) => void;
  handleIncomingLine: (line: string) => void;
  advanceHardwareMotion: (dtMs: number) => void;
}

let activeSerialPort: SerialPortLike | null = null;
let activeSerialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let activeSerialWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
let activeWebSocket: WebSocket | null = null;

const textEncoder = new TextEncoder();

export const useHardwareStore = create<HardwareState>((set, get) => ({
  connected: false,
  transport: "NONE",
  baudRate: 115200,
  wsUrl: "ws://192.168.1.50:81",
  addressFilter: "01",
  motionMode: "SMOOTH",
  autoReply: true,
  reportSensor: true,
  controllerState: "Idle",
  lastMotionSpace: "Angle",
  defaultFeed: 2000,
  pumpPwm: 0,
  valvePwm: 0,
  rxCount: 0,
  txCount: 0,
  hmiCount: 0,
  idxTelemetry: null,
  lastRx: "",
  lastError: "",
  smoothTarget: null,

  setBaudRate(baudRate) {
    set({ baudRate });
  },
  setWsUrl(wsUrl) {
    set({ wsUrl });
  },
  setAddressFilter(addressFilter) {
    set({ addressFilter });
  },
  setMotionMode(motionMode) {
    set({ motionMode });
  },
  setAutoReply(autoReply) {
    set({ autoReply });
  },
  setReportSensor(reportSensor) {
    set({ reportSensor });
  },

  async sendRawLine(line) {
    const clean = line.trim();
    if (!clean) return;
    const { transport, connected } = get();
    if (!connected) return;

    try {
      if (transport === "SERIAL" && activeSerialWriter) {
        await activeSerialWriter.write(textEncoder.encode(`${clean}\r\n`));
      } else if (transport === "WEBSOCKET" && activeWebSocket?.readyState === WebSocket.OPEN) {
        activeWebSocket.send(`${clean}\n`);
      } else {
        return;
      }
      set((s) => ({ txCount: s.txCount + 1 }));
      useSerialStore.getState().appendLog({ dir: "out", text: `[RS485 TX] ${clean}` });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "TX failed" });
    }
  },

  handleIncomingLine(rawLine) {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const state = get();
    const robot = useRobotStore.getState();

    const cmd = parseIncomingHardwareLine(trimmed, {
      currentJoints: robot.joints,
      defaultMotionMode: state.lastMotionSpace,
      defaultFeed: state.defaultFeed,
      addressFilter: state.addressFilter,
      toolType: robot.toolType,
    });

    // Shared RS-485 Bus Monitor for HMI-485 (@99...): decode telemetry silently, NEVER reply!
    if (cmd.kind === "HMI_BUS") {
      const parsedIdx = parseIdxSortingTelemetry(trimmed);
      set((s) => ({
        hmiCount: s.hmiCount + 1,
        lastRx: trimmed,
        ...(parsedIdx ? { idxTelemetry: parsedIdx } : {}),
      }));
      // Avoid flooding console with 4Hz @99o200 telemetry; log non-telemetry HMI frames or state changes
      const prevState = state.idxTelemetry?.stateId;
      if (!parsedIdx || parsedIdx.stateId !== prevState) {
        useSerialStore.getState().appendLog({
          dir: "sys",
          text: parsedIdx
            ? `[IDX-485] State -> ${parsedIdx.stateName} (Light:${parsedIdx.lightAdc} A5:${parsedIdx.currentAdc} OK:${parsedIdx.okCount} NG:${parsedIdx.ngCount})`
            : `[HMI @99] ${trimmed}`,
        });
      }
      return;
    }

    if (cmd.kind === "IGNORED") return;

    set((s) => ({ rxCount: s.rxCount + 1, lastRx: trimmed, lastError: "" }));
    useSerialStore.getState().appendLog({ dir: "in", text: `[RS485 RX] ${trimmed}` });

    const replyIfEnabled = (msg: string) => {
      if (!state.autoReply) return;
      if (state.connected) {
        void get().sendRawLine(msg);
      } else {
        useSerialStore.getState().appendLog({ dir: "out", text: `[VIRTUAL TX] ${msg}` });
      }
    };

    if (cmd.kind === "ERROR") {
      set({ lastError: cmd.message });
      useSerialStore.getState().appendLog({ dir: "error", text: `[RS485] ${cmd.message}` });
      replyIfEnabled(`error:${cmd.message}`);
      return;
    }

    // Status queries (`@01?` or `@01O103`)
    if (cmd.kind === "STATUS_QUERY") {
      const effectiveState: VirtualControllerState =
        useCodeStore.getState().status === "RUNNING" || usePathStore.getState().status === "PLAYING"
          ? "Run"
          : get().controllerState;

      const reply =
        cmd.format === "O103"
          ? formatO103StatusReply(effectiveState)
          : formatWlkataStatusReport({
              state: effectiveState,
              joints: robot.joints,
              eePose: robot.eePose,
              pumpPwm: state.pumpPwm,
              valvePwm: state.valvePwm,
              motionMode: state.lastMotionSpace,
            });
      replyIfEnabled(reply);
      return;
    }

    // Feed Hold / Pause (`@01!`)
    if (cmd.kind === "PAUSE") {
      set({ controllerState: "Hold" });
      if (usePathStore.getState().status === "PLAYING") usePathStore.getState().togglePlayback();
      if (useCodeStore.getState().status === "RUNNING") useCodeStore.getState().runOrPause();
      useSerialStore.getState().appendLog({ dir: "sys", text: "[RS485] Feed Hold / PAUSED (@01!)" });
      replyIfEnabled("ok");
      return;
    }

    // Cycle Start / Resume (`@01~`)
    if (cmd.kind === "RESUME") {
      const hasMove = Boolean(get().smoothTarget);
      set({ controllerState: hasMove ? "Run" : "Idle" });
      if (usePathStore.getState().status === "PAUSED") usePathStore.getState().togglePlayback();
      if (useCodeStore.getState().status === "PAUSED") useCodeStore.getState().runOrPause();
      useSerialStore.getState().appendLog({ dir: "ok", text: "[RS485] Resumed (@01~)" });
      replyIfEnabled("ok");
      return;
    }

    // Controller Reset (`@01%`)
    if (cmd.kind === "RESET") {
      usePathStore.getState().stopPlayback();
      useCodeStore.getState().stop();
      set({ controllerState: "Idle", smoothTarget: null });
      useSerialStore.getState().appendLog({ dir: "sys", text: "[RS485] Controller Reset (@01%)" });
      replyIfEnabled("ok");
      return;
    }

    if (cmd.kind === "SET_SPEED") {
      set({ defaultFeed: Math.max(100, Math.min(10000, cmd.feed)) });
      replyIfEnabled("ok");
      return;
    }

    if (cmd.kind === "CONVEYOR_MOVE") {
      useWorkcellStore.getState().moveConveyor(cmd.distanceMm, cmd.absolute, cmd.feed);
      useSerialStore.getState().appendLog({
        dir: "sys",
        text: `[RS485] Conveyor ${cmd.absolute ? "move to" : "move by"} D${cmd.distanceMm} mm`,
      });
      replyIfEnabled("ok");
      return;
    }

    if (cmd.kind === "SENSOR_QUERY") {
      // A query always gets an answer, even with auto-reply off
      const wc = useWorkcellStore.getState();
      if (state.connected) {
        void get().sendRawLine(wc.sensor.enabled ? formatSensorLine(wc.sensorBlocked) : "error:sensor disabled");
      }
      return;
    }

    if (cmd.kind === "COLOR_QUERY") {
      // Colour of the box at the light beam, so a controller can grade parts (always answered)
      const wc = useWorkcellStore.getState();
      if (state.connected) {
        const box = boxAtSensor(wc.conveyor, wc.sensor, wc.boxes);
        void get().sendRawLine(
          wc.sensor.enabled ? formatColorLine(box ? boxColorName(box.color) : null) : "error:sensor disabled"
        );
      }
      return;
    }

    if (cmd.kind === "AUTO_FEED") {
      if (cmd.enabled && !useWorkcellStore.getState().sensor.enabled) {
        replyIfEnabled("error:sensor disabled");
        return;
      }
      useWorkcellStore.getState().setAutoFeed(cmd.enabled, cmd.speedPercent);
      replyIfEnabled("ok");
      return;
    }

    if (cmd.kind === "CONVEYOR_SPEED") {
      useWorkcellStore.getState().setConveyorSpeedPercent(cmd.percent);
      useSerialStore.getState().appendLog({
        dir: "sys",
        text: `[RS485] Conveyor speed ${cmd.percent}% (G6 F${cmd.percent})`,
      });
      replyIfEnabled("ok");
      return;
    }

    if (cmd.kind === "ACK_ONLY") {
      useSerialStore.getState().appendLog({ dir: "sys", text: `[RS485] ${cmd.note}` });
      replyIfEnabled("ok");
      return;
    }

    // Run saved file (`@010111=vec2501` or `@01o111...`)
    if (cmd.kind === "RUN_FILE") {
      useSerialStore.getState().appendLog({
        dir: "ok",
        text: `[RS485] Running virtual saved file "${cmd.fileName}"`,
      });
      const path = usePathStore.getState();
      if (path.targets.length >= 2) {
        path.resetPlayback();
        path.togglePlayback();
      } else {
        // Run the Code tab demo program if Path is empty
        useCodeStore.getState().runOrPause();
      }
      replyIfEnabled("ok");
      return;
    }

    // Cancel local playback when direct hardware motion arrives
    usePathStore.getState().cancelForManualControl();
    useCodeStore.getState().stop();

    const startSmoothJointMove = (
      targetJoints: number[],
      feedDegPerMin: number,
      moveKind: "MOVE" | "HOME" = "MOVE"
    ) => {
      if (state.motionMode === "INSTANT" && moveKind !== "HOME") {
        set({ smoothTarget: null, controllerState: "Idle" });
        useRobotStore.getState().setJoints(targetJoints, { syncIk: true });
        return;
      }

      const startJoints = useRobotStore.getState().joints.slice();
      const maxTravel = targetJoints.reduce(
        (max, q, i) => Math.max(max, Math.abs(q - (startJoints[i] ?? 0))),
        0
      );
      const degPerSec = Math.max(10, feedDegPerMin / 60);
      const durationMs =
        moveKind === "HOME"
          ? Math.max(1200, (maxTravel * 1.6 * 1000) / degPerSec)
          : Math.max(220, (maxTravel * 1.45 * 1000) / degPerSec);

      set({
        controllerState: moveKind === "HOME" ? "Home" : "Run",
        smoothTarget: {
          startJoints,
          targetJoints: targetJoints.slice(),
          elapsedMs: 0,
          durationMs,
          kind: moveKind,
        },
      });
    };

    if (cmd.kind === "HOME") {
      startSmoothJointMove(HOME_JOINTS.slice(), 2400, "HOME");
    } else if (cmd.kind === "WAIT") {
      const curr = robot.joints.slice();
      set({
        controllerState: "Run",
        smoothTarget: {
          startJoints: curr,
          targetJoints: curr,
          elapsedMs: 0,
          durationMs: Math.max(100, cmd.durationMs),
          kind: "WAIT",
        },
      });
    } else if (cmd.kind === "GRIPPER") {
      robot.setGripper(cmd.state, cmd.pwm, { label: `[RS485] ${cmd.label}` });
      const isValve = /M4/i.test(cmd.raw);
      set({
        pumpPwm: isValve ? state.pumpPwm : cmd.pwm,
        valvePwm: isValve ? cmd.pwm : state.valvePwm,
      });
    } else if (cmd.kind === "MOVE_JOINT") {
      if (cmd.gripper) robot.setGripper(cmd.gripper);
      set({ lastMotionSpace: "Angle" });
      startSmoothJointMove(cmd.joints, cmd.feedDegPerMin ?? state.defaultFeed, "MOVE");
    } else if (cmd.kind === "MOVE_CARTESIAN") {
      if (cmd.gripper) robot.setGripper(cmd.gripper);
      set({ lastMotionSpace: "Cartesian" });
      const viewer = useViewerStore.getState();
      const solved = solveIKPoseCandidate(
        robot.joints,
        pose6DToTargetMatrix(cmd.pose),
        viewer.ikSolver,
        { dlsConfig: viewer.dls }
      );
      if (!solved || solved.err.posMm > 5) {
        const msg = `IK failed for (${cmd.pose.x.toFixed(1)}, ${cmd.pose.y.toFixed(1)}, ${cmd.pose.z.toFixed(1)})`;
        set({ lastError: msg });
        useSerialStore.getState().appendLog({ dir: "error", text: `[RS485] ${msg}` });
        replyIfEnabled(`error:${msg}`);
        return;
      }
      startSmoothJointMove(solved.q, cmd.feedMmPerMin ?? state.defaultFeed, "MOVE");
    }

    replyIfEnabled("ok");
  },

  advanceHardwareMotion(dtMs) {
    const state = get();
    if (state.controllerState === "Hold") return; // Paused by @01!
    const target = state.smoothTarget;
    if (!target) return;

    const nextElapsed = Math.min(target.elapsedMs + Math.max(0, dtMs), target.durationMs);
    if (target.kind !== "WAIT") {
      const u = target.durationMs > 0 ? nextElapsed / target.durationMs : 1;
      const ease = pathTrajectorySample(u, "QUINTIC").position;
      const q = target.startJoints.map((q0, i) => q0 + (target.targetJoints[i] - q0) * ease);
      useRobotStore.getState().setJoints(q, { syncIk: true });
    }

    if (nextElapsed >= target.durationMs) {
      set({ smoothTarget: null, controllerState: "Idle" });
      // Proactively emit <Idle,...> on move/homing completion so sketches like
      // idx485-sorting-station.ino (which wait for "Idle" without polling @01?) advance cleanly!
      if (state.autoReply && state.connected) {
        const robot = useRobotStore.getState();
        const report = formatWlkataStatusReport({
          state: "Idle",
          joints: robot.joints,
          eePose: robot.eePose,
          pumpPwm: state.pumpPwm,
          valvePwm: state.valvePwm,
          motionMode: state.lastMotionSpace,
        });
        void get().sendRawLine(report);
      }
    } else {
      set({ smoothTarget: { ...target, elapsedMs: nextElapsed } });
    }
  },

  async connectSerial() {
    const nav = navigator as Navigator & {
      serial?: { requestPort: () => Promise<SerialPortLike> };
    };
    if (!nav.serial) {
      const msg = t("log.hw.needChromium");
      set({ lastError: msg });
      throw new Error(msg);
    }

    await get().disconnect();

    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: get().baudRate });

      activeSerialPort = port;
      activeSerialWriter = port.writable ? port.writable.getWriter() : null;
      activeSerialReader = port.readable ? port.readable.getReader() : null;

      set({
        connected: true,
        transport: "SERIAL",
        controllerState: "Idle",
        lastError: "",
        rxCount: 0,
        txCount: 0,
        hmiCount: 0,
      });
      useSerialStore.getState().appendLog({
        dir: "ok",
        text: t("log.hw.listening", { addr: get().addressFilter, baud: get().baudRate }),
      });

      const reader = activeSerialReader;
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (!value) continue;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (line.trim()) get().handleIncomingLine(line);
              }
            }
          } catch (err) {
            if (get().connected) {
              set({ lastError: err instanceof Error ? err.message : t("log.hw.readClosed") });
            }
          } finally {
            if (get().transport === "SERIAL") {
              void get().disconnect();
            }
          }
        })();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("log.hw.openFailed");
      set({ lastError: msg, connected: false, transport: "NONE" });
      throw err;
    }
  },

  connectWebSocket(url) {
    const targetUrl = (url ?? get().wsUrl).trim();
    if (!targetUrl) return;
    set({ wsUrl: targetUrl, lastError: "" });
    void get().disconnect().then(() => {
      try {
        const ws = new WebSocket(targetUrl);
        activeWebSocket = ws;

        ws.onopen = () => {
          set({
            connected: true,
            transport: "WEBSOCKET",
            controllerState: "Idle",
            lastError: "",
            rxCount: 0,
            txCount: 0,
            hmiCount: 0,
          });
          useSerialStore.getState().appendLog({
            dir: "ok",
            text: t("log.hw.wsConnected", { url: targetUrl }),
          });
        };

        ws.onmessage = (event) => {
          const text = String(event.data ?? "");
          text.split(/\r?\n/).forEach((line) => {
            if (line.trim()) get().handleIncomingLine(line);
          });
        };

        ws.onerror = () => {
          set({ lastError: `WebSocket error connecting to ${targetUrl}` });
        };

        ws.onclose = () => {
          if (activeWebSocket === ws) {
            activeWebSocket = null;
            set({ connected: false, transport: "NONE" });
            useSerialStore.getState().appendLog({ dir: "sys", text: "ESP32 WebSocket disconnected" });
          }
        };
      } catch (err) {
        set({
          lastError: err instanceof Error ? err.message : t("log.hw.badUrl"),
          connected: false,
          transport: "NONE",
        });
      }
    });
  },

  async disconnect() {
    if (activeWebSocket) {
      const ws = activeWebSocket;
      activeWebSocket = null;
      ws.close();
    }
    if (activeSerialReader) {
      const r = activeSerialReader;
      activeSerialReader = null;
      try {
        await r.cancel();
        r.releaseLock();
      } catch {
        // ignore
      }
    }
    if (activeSerialWriter) {
      const w = activeSerialWriter;
      activeSerialWriter = null;
      try {
        w.releaseLock();
      } catch {
        // ignore
      }
    }
    if (activeSerialPort) {
      const p = activeSerialPort;
      activeSerialPort = null;
      try {
        await p.close();
      } catch {
        // ignore
      }
    }
    if (get().connected) {
      useSerialStore.getState().appendLog({ dir: "sys", text: t("log.hw.disconnected") });
    }
    set({ connected: false, transport: "NONE", smoothTarget: null, controllerState: "Idle" });
  },
}));

// Push conveyor light-sensor changes to the RS-485 master (ESP32 / IDX-485).
useWorkcellStore.subscribe((state, prev) => {
  if (state.sensorBlocked === prev.sensorBlocked) return;
  const hw = useHardwareStore.getState();
  if (hw.connected && hw.reportSensor) void hw.sendRawLine(formatSensorLine(state.sensorBlocked));
});
