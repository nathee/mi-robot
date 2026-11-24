import { create } from "zustand";
import { Quaternion, Vector3 } from "three";
import { tcpMatrixFromJointsDeg } from "@/lib/kinematics/fk";
import {
  BOX_COLORS,
  buildPreset,
  CONVEYOR_MAX_SPEED_MM_S,
  conveyorFeedPoint,
  conveyorVelocity,
  DEFAULT_BOX_SIZE,
  findGraspTarget,
  graspBox,
  makeBox,
  releaseBoxes,
  stepConveyor,
  supportHeightAt,
  updateHeldBoxes,
  type TcpPoseMm,
  type WorkcellPresetId,
  type WorkcellSnapshot,
} from "@/lib/sim/workcell";
import { TOOL_DEFS } from "@/lib/tools/toolDefs";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";

interface WorkcellState extends WorkcellSnapshot {
  preset: WorkcellPresetId;
  nextBoxNum: number;
  lastGraspMessage: string;

  loadPreset: (id: WorkcellPresetId) => void;
  addBox: (where: "CONVEYOR" | "TRAY", size?: number) => void;
  removeBox: (id: string) => void;
  clearBoxes: () => void;
  setConveyorSpeedPercent: (percent: number) => void;
  moveConveyor: (distanceMm: number, absolute: boolean, feed?: number) => void;
  stopConveyor: () => void;
  /** Per-frame update: belt motion + held boxes follow the TCP. */
  step: (dtMs: number) => void;
  grab: () => boolean;
  release: () => void;
  snapshot: () => WorkcellSnapshot;
  loadSnapshot: (data: WorkcellSnapshot) => void;
}

export function currentTcpPoseMm(joints?: readonly number[]): TcpPoseMm {
  const T = tcpMatrixFromJointsDeg(joints ?? useRobotStore.getState().joints);
  const p = new Vector3();
  const q = new Quaternion();
  T.decompose(p, q, new Vector3());
  return { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000, quaternion: q };
}

function log(text: string, dir: "sys" | "error" = "sys") {
  useSerialStore.getState().appendLog({ dir, text });
}

const initial = buildPreset("CONVEYOR");

export const useWorkcellStore = create<WorkcellState>((set, get) => ({
  ...initial,
  preset: "CONVEYOR",
  nextBoxNum: initial.boxes.length + 1,
  lastGraspMessage: "",

  loadPreset(id) {
    const snap = buildPreset(id);
    set({ ...snap, preset: id, nextBoxNum: snap.boxes.length + 1, lastGraspMessage: "" });
    log(`Workcell preset loaded: ${id}`);
  },

  addBox(where, size = DEFAULT_BOX_SIZE) {
    const s = get();
    const num = s.nextBoxNum;
    let x: number;
    let y: number;
    if (where === "CONVEYOR") {
      const dir = conveyorVelocity(s.conveyorRuntime) > 0 ? 1 : -1;
      const p = conveyorFeedPoint(s.conveyor, size, dir);
      x = p.x;
      y = p.y;
    } else {
      const tray = s.platforms[0];
      x = tray.x + ((num % 3) - 1) * 40;
      y = tray.y + ((Math.floor(num / 3) % 2) - 0.5) * 40;
    }
    const support = supportHeightAt(x, y, 1e6, { boxes: s.boxes, platforms: s.platforms, conveyor: s.conveyor });
    const box = makeBox({
      id: `box-${num}`,
      x,
      y,
      z: support + size / 2,
      size,
      color: BOX_COLORS[(num - 1) % BOX_COLORS.length],
    });
    set({ boxes: [...s.boxes, box], nextBoxNum: num + 1 });
  },

  removeBox(id) {
    set({ boxes: get().boxes.filter((b) => b.id !== id) });
  },

  clearBoxes() {
    set({ boxes: [] });
  },

  setConveyorSpeedPercent(percent) {
    const p = Math.max(-100, Math.min(100, Number(percent) || 0));
    set({
      conveyorRuntime: {
        ...get().conveyorRuntime,
        speedMmS: (p / 100) * CONVEYOR_MAX_SPEED_MM_S,
        targetMm: null,
      },
    });
  },

  moveConveyor(distanceMm, absolute, feed) {
    const rt = get().conveyorRuntime;
    const target = absolute ? distanceMm : rt.positionMm + distanceMm;
    const moveSpeed =
      feed && feed > 0 ? Math.max(5, Math.min(CONVEYOR_MAX_SPEED_MM_S, feed / 60)) : rt.moveSpeedMmS;
    set({ conveyorRuntime: { ...rt, speedMmS: 0, targetMm: target, moveSpeedMmS: moveSpeed } });
  },

  stopConveyor() {
    set({ conveyorRuntime: { ...get().conveyorRuntime, speedMmS: 0, targetMm: null } });
  },

  step(dtMs) {
    const s = get();
    let boxes = s.boxes;
    let runtime = s.conveyorRuntime;
    let changed = false;

    if (conveyorVelocity(runtime) !== 0) {
      const res = stepConveyor(s.conveyor, runtime, boxes, dtMs);
      runtime = res.runtime;
      boxes = res.boxes;
      changed = true;
    }
    if (boxes.some((b) => b.held)) {
      boxes = updateHeldBoxes(boxes, currentTcpPoseMm());
      changed = true;
    }
    if (changed) set({ boxes, conveyorRuntime: runtime });
  },

  grab() {
    const s = get();
    const tool = TOOL_DEFS[useRobotStore.getState().toolType];
    const tcp = currentTcpPoseMm();
    const res = findGraspTarget(s.boxes, tcp, tool);
    if ("box" in res) {
      set({ boxes: graspBox(s.boxes, res.box.id, tcp), lastGraspMessage: `Holding ${res.box.id}` });
      log(`${tool.label}: picked ${res.box.id}`);
      return true;
    }
    const messages: Record<typeof res.reason, string> = {
      NO_TOOL: "No end-effector mounted",
      NOTHING_IN_REACH: "No box within reach of the TCP",
      TOO_LARGE: `Box is too large for the ${tool.label}`,
      ALREADY_HOLDING: "Already holding a box",
    };
    set({ lastGraspMessage: messages[res.reason] });
    if (res.reason !== "ALREADY_HOLDING" && res.reason !== "NO_TOOL") {
      log(`${tool.label}: ${messages[res.reason]}`);
    }
    return false;
  },

  release() {
    const s = get();
    if (!s.boxes.some((b) => b.held)) return;
    const boxes = releaseBoxes(s.boxes, s.platforms, s.conveyor);
    const dropped = s.boxes.filter((b) => b.held).map((b) => b.id);
    set({ boxes, lastGraspMessage: "" });
    log(`Released ${dropped.join(", ")}`);
  },

  snapshot() {
    const s = get();
    return structuredClone({
      boxes: s.boxes,
      platforms: s.platforms,
      conveyor: s.conveyor,
      conveyorRuntime: { ...s.conveyorRuntime, speedMmS: 0, targetMm: null },
    });
  },

  loadSnapshot(data) {
    if (!data || !Array.isArray(data.boxes) || !data.conveyor) return;
    const boxes = data.boxes.map((b) => ({ ...b, held: false, heldOffset: undefined }));
    const maxNum = boxes.reduce((m, b) => Math.max(m, Number(b.id.replace(/\D/g, "")) || 0), 0);
    set({
      boxes,
      platforms: data.platforms?.length ? data.platforms : get().platforms,
      conveyor: data.conveyor,
      conveyorRuntime: { ...data.conveyorRuntime, speedMmS: 0, targetMm: null },
      nextBoxNum: maxNum + 1,
    });
  },
}));

// Grab / release when the tool closes / opens (from UI, programs, or RS-485 commands).
useRobotStore.subscribe((state, prev) => {
  if (state.toolType !== prev.toolType) {
    useWorkcellStore.getState().release();
    return;
  }
  if (state.gripperState === prev.gripperState) return;
  if (state.gripperState === "CLOSE") useWorkcellStore.getState().grab();
  else useWorkcellStore.getState().release();
});
