import { create } from "zustand";
import { HOME_JOINTS } from "@/lib/kinematics/constants";
import { pose6DToTargetMatrix } from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import { pathTrajectorySample } from "@/lib/path/trajectory";
import {
  formatWlkataStatusReport,
  parseIncomingHardwareLine,
} from "@/lib/hardware/protocol";
import { useCodeStore } from "./useCodeStore";
import { usePathStore } from "./usePathStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";
import { useViewerStore } from "./useViewerStore";

export type HardwareTransport = "NONE" | "SERIAL" | "WEBSOCKET";
export type HardwareMotionMode = "SMOOTH" | "INSTANT";

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
}

interface HardwareState {
  connected: boolean;
  transport: HardwareTransport;
  baudRate: number;
  wsUrl: string;
  addressFilter: string;
  motionMode: HardwareMotionMode;
  autoReply: boolean;
  rxCount: number;
  txCount: number;
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
  addressFilter: "ANY",
  motionMode: "SMOOTH",
  autoReply: true,
  rxCount: 0,
  txCount: 0,
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
      useSerialStore.getState().appendLog({ dir: "out", text: `[RS485] ${clean}` });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "TX failed" });
    }
  },

  handleIncomingLine(rawLine) {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const state = get();
    const robot = useRobotStore.getState();
    set((s) => ({ rxCount: s.rxCount + 1, lastRx: trimmed, lastError: "" }));
    useSerialStore.getState().appendLog({ dir: "in", text: `[RS485] ${trimmed}` });

    const cmd = parseIncomingHardwareLine(trimmed, {
      currentJoints: robot.joints,
      addressFilter: state.addressFilter,
    });

    if (cmd.kind === "IGNORED") return;

    if (cmd.kind === "ERROR") {
      set({ lastError: cmd.message });
      useSerialStore.getState().appendLog({ dir: "error", text: `[RS485] ${cmd.message}` });
      if (state.autoReply && state.connected) {
        void get().sendRawLine(`error:${cmd.message}`);
      }
      return;
    }

    if (cmd.kind === "STATUS_QUERY") {
      const report = formatWlkataStatusReport({
        state: state.smoothTarget ? "Run" : "Idle",
        joints: robot.joints,
        eePose: robot.eePose,
        gripperPwm: robot.gripperPwm,
      });
      if (state.connected) {
        void get().sendRawLine(report);
      } else {
        useSerialStore.getState().appendLog({ dir: "out", text: `[VIRTUAL] ${report}` });
      }
      return;
    }

    // Cancel local playback so hardware commands take priority
    usePathStore.getState().cancelForManualControl();
    useCodeStore.getState().stop();

    const applyJointTarget = (targetJoints: number[], feedDegPerMin = 3000) => {
      if (state.motionMode === "INSTANT") {
        set({ smoothTarget: null });
        useRobotStore.getState().setJoints(targetJoints, { syncIk: true });
      } else {
        const startJoints = useRobotStore.getState().joints.slice();
        const maxTravel = targetJoints.reduce(
          (max, q, i) => Math.max(max, Math.abs(q - (startJoints[i] ?? 0))),
          0
        );
        const degPerSec = Math.max(10, feedDegPerMin / 60);
        const durationMs = Math.max(120, (maxTravel * 1.45 * 1000) / degPerSec);
        set({
          smoothTarget: {
            startJoints,
            targetJoints: targetJoints.slice(),
            elapsedMs: 0,
            durationMs,
          },
        });
      }
    };

    if (cmd.kind === "HOME") {
      applyJointTarget(HOME_JOINTS.slice(), 3200);
    } else if (cmd.kind === "GRIPPER") {
      robot.setGripper(cmd.state, cmd.pwm);
    } else if (cmd.kind === "MOVE_JOINT") {
      if (cmd.gripper) robot.setGripper(cmd.gripper);
      applyJointTarget(cmd.joints, cmd.feedDegPerMin ?? 3000);
    } else if (cmd.kind === "MOVE_CARTESIAN") {
      if (cmd.gripper) robot.setGripper(cmd.gripper);
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
        if (state.autoReply && state.connected) void get().sendRawLine(`error:${msg}`);
        return;
      }
      applyJointTarget(solved.q, 3200);
    }

    if (state.autoReply && state.connected) {
      void get().sendRawLine("ok");
    }
  },

  advanceHardwareMotion(dtMs) {
    const target = get().smoothTarget;
    if (!target) return;

    const nextElapsed = Math.min(target.elapsedMs + Math.max(0, dtMs), target.durationMs);
    const u = target.durationMs > 0 ? nextElapsed / target.durationMs : 1;
    const ease = pathTrajectorySample(u, "QUINTIC").position;
    const q = target.startJoints.map((q0, i) => q0 + (target.targetJoints[i] - q0) * ease);

    useRobotStore.getState().setJoints(q, { syncIk: true });

    if (nextElapsed >= target.durationMs) {
      set({ smoothTarget: null });
    } else {
      set({ smoothTarget: { ...target, elapsedMs: nextElapsed } });
    }
  },

  async connectSerial() {
    const nav = navigator as Navigator & {
      serial?: { requestPort: () => Promise<SerialPortLike> };
    };
    if (!nav.serial) {
      const msg = "Web Serial API requires Chrome, Edge, or Opera on desktop.";
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
        lastError: "",
        rxCount: 0,
        txCount: 0,
      });
      useSerialStore.getState().appendLog({
        dir: "ok",
        text: `Connected USB/RS485 Serial @ ${get().baudRate} baud`,
      });

      // Background RX line reader
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
              set({ lastError: err instanceof Error ? err.message : "Serial read closed" });
            }
          } finally {
            if (get().transport === "SERIAL") {
              void get().disconnect();
            }
          }
        })();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open serial port";
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
          set({ connected: true, transport: "WEBSOCKET", lastError: "", rxCount: 0, txCount: 0 });
          useSerialStore.getState().appendLog({
            dir: "ok",
            text: `Connected ESP32 WebSocket: ${targetUrl}`,
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
          lastError: err instanceof Error ? err.message : "Invalid WebSocket URL",
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
        // ignore cancel errors
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
      useSerialStore.getState().appendLog({ dir: "sys", text: "Disconnected hardware link" });
    }
    set({ connected: false, transport: "NONE", smoothTarget: null });
  },
}));
