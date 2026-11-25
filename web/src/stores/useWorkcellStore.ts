import { create } from "zustand";
import { Quaternion, Vector3 } from "three";
import { tcpMatrixFromJointsDeg } from "@/lib/kinematics/fk";
import {
  autoFeedSpeedMmS,
  DEFAULT_AUTO_FEED,
  DEFAULT_SENSOR,
  isSensorBlocked,
  normalizeSensor,
  type AutoFeedConfig,
  type LightSensorConfig,
  applyConveyorLayout,
  applyPlatformLayout,
  BOX_COLORS,
  DEFAULT_CONVEYOR,
  DEFAULT_PLATFORMS,
  PLATFORM_COLORS,
  type ConveyorConfig,
  type Platform,
  buildPreset,
  CONVEYOR_MAX_SPEED_MM_S,
  conveyorVelocity,
  DEFAULT_BOX_SIZE,
  findFreeBeltSpot,
  findGraspTarget,
  graspBox,
  heldBoxPushers,
  pushBoxes,
  settleUnsupported,
  toolPusher,
  type Pusher,
  makeBox,
  findHeldCollision,
  findToolCollision,
  releaseBoxesDetailed,
  settleBoxes,
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
  sensor: LightSensorConfig;
  autoFeed: AutoFeedConfig;
  /** Live light-sensor state: true while a box on the belt breaks the beam. */
  sensorBlocked: boolean;
  /** Number of clear -> blocked transitions (boxes counted). */
  sensorCount: number;
  preset: WorkcellPresetId;
  nextBoxNum: number;
  lastGraspMessage: string;
  /** Set while a box carried by the tool is pushed into something (e.g. "box-2 hit box-1"). */
  collision: string | null;

  loadPreset: (id: WorkcellPresetId) => void;
  addBox: (where: "CONVEYOR" | "TRAY", size?: number) => void;
  removeBox: (id: string) => void;
  clearBoxes: () => void;
  updateConveyorLayout: (partial: Partial<ConveyorConfig>) => void;
  updatePlatform: (id: string, partial: Partial<Platform>) => void;
  addPlatform: () => void;
  removePlatform: (id: string) => void;
  resetLayout: () => void;
  setSensorOffset: (offsetMm: number) => void;
  setSensorEnabled: (enabled: boolean) => void;
  setAutoFeed: (enabled: boolean, speedPercent?: number) => void;
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
/** Boxes pushed in the previous frame, so a continuing push is logged once. */
let lastPushKey = "";
let lastPushLogAt = 0;
/** Pusher positions in the previous frame, to know which way the tool is moving. */
let lastPusherPos = new Map<string, { x: number; y: number }>();

export const useWorkcellStore = create<WorkcellState>((set, get) => ({
  ...initial,
  sensor: { ...DEFAULT_SENSOR },
  autoFeed: { ...DEFAULT_AUTO_FEED },
  sensorBlocked: false,
  sensorCount: 0,
  preset: "CONVEYOR",
  nextBoxNum: initial.boxes.length + 1,
  lastGraspMessage: "",
  collision: null,

  loadPreset(id) {
    const snap = buildPreset(id);
    set({ ...snap, autoFeed: { ...get().autoFeed, enabled: false }, preset: id, nextBoxNum: snap.boxes.length + 1, lastGraspMessage: "" });
    log(`Workcell preset loaded: ${id}`);
  },

  addBox(where, size = DEFAULT_BOX_SIZE) {
    const s = get();
    const num = s.nextBoxNum;
    let x: number;
    let y: number;
    if (where === "CONVEYOR") {
      const dir = conveyorVelocity(s.conveyorRuntime) > 0 ? 1 : -1;
      // Never stack a new box on one still waiting at the feed point: use the next free spot.
      const p = findFreeBeltSpot(s.conveyor, s.boxes, size, dir);
      if (!p) {
        log("Conveyor is full at the feed end: move the belt before adding another box", "error");
        return;
      }
      x = p.x;
      y = p.y;
    } else {
      const tray = s.platforms[0];
      if (!tray) return;
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

  updateConveyorLayout(partial) {
    const s = get();
    const res = applyConveyorLayout(s.conveyor, s.boxes, partial);
    set({ conveyor: res.conveyor, boxes: res.boxes, sensor: normalizeSensor(s.sensor, res.conveyor) });
  },

  updatePlatform(id, partial) {
    const s = get();
    const p = s.platforms.find((pl) => pl.id === id);
    if (!p) return;
    const res = applyPlatformLayout(p, s.boxes, partial);
    set({ platforms: s.platforms.map((pl) => (pl.id === id ? res.platform : pl)), boxes: res.boxes });
  },

  addPlatform() {
    const s = get();
    let n = s.platforms.length + 1;
    while (s.platforms.some((p) => p.id === `tray-${n}`)) n++;
    const platform: Platform = {
      id: `tray-${n}`,
      label: `Tray ${n}`,
      x: 140,
      y: 170,
      sizeX: 80,
      sizeY: 80,
      topZ: 20,
      color: PLATFORM_COLORS[(n - 1) % PLATFORM_COLORS.length],
    };
    set({ platforms: [...s.platforms, platform] });
  },

  removePlatform(id) {
    const s = get();
    const p = s.platforms.find((pl) => pl.id === id);
    if (!p) return;
    const platforms = s.platforms.filter((pl) => pl.id !== id);
    // Boxes that were on it drop to whatever is underneath now
    set({ platforms, boxes: settleBoxes(s.boxes, platforms, s.conveyor) });
  },

  resetLayout() {
    const s = get();
    let boxes = applyConveyorLayout(s.conveyor, s.boxes, DEFAULT_CONVEYOR).boxes;
    let platforms = s.platforms;
    const def = DEFAULT_PLATFORMS[0];
    const first = platforms[0];
    if (first) {
      const res = applyPlatformLayout(first, boxes, { ...def, id: first.id });
      boxes = res.boxes;
      platforms = [res.platform];
    } else {
      platforms = DEFAULT_PLATFORMS.map((p) => ({ ...p }));
    }
    const conveyor = { ...DEFAULT_CONVEYOR };
    set({ conveyor, platforms, boxes: settleBoxes(boxes, platforms, conveyor) });
  },

  removeBox(id) {
    set({ boxes: get().boxes.filter((b) => b.id !== id) });
  },

  clearBoxes() {
    const n = get().boxes.length;
    set({ boxes: [], nextBoxNum: 1 });
    log(`Cleared ${n} box${n === 1 ? "" : "es"}`);
  },

  setSensorOffset(offsetMm) {
    set({ sensor: normalizeSensor({ ...get().sensor, offsetMm }, get().conveyor) });
  },

  setSensorEnabled(enabled) {
    const s = get();
    if (s.sensor.enabled === enabled) return;
    if (!enabled && s.autoFeed.enabled) s.setAutoFeed(false);
    set({ sensor: { ...s.sensor, enabled } });
    log(enabled ? "Light sensor installed on the conveyor" : "Light sensor removed (conveyor runs without sensor)");
  },

  setAutoFeed(enabled, speedPercent) {
    const s = get();
    if (enabled && !s.sensor.enabled) {
      log("Auto feed needs the light sensor: enable it in Tools → Light Sensor", "error");
      return;
    }
    const autoFeed = {
      enabled,
      speedPercent: Math.max(5, Math.min(100, speedPercent ?? s.autoFeed.speedPercent)),
    };
    set({
      autoFeed,
      conveyorRuntime: { ...s.conveyorRuntime, targetMm: null, speedMmS: enabled ? s.conveyorRuntime.speedMmS : 0 },
    });
    if (enabled !== s.autoFeed.enabled) {
      log(enabled ? `Conveyor auto-feed ON (${autoFeed.speedPercent}%, stops at the light sensor)` : "Conveyor auto-feed OFF");
    }
  },

  setConveyorSpeedPercent(percent) {
    const p = Math.max(-100, Math.min(100, Number(percent) || 0));
    if (get().autoFeed.enabled) get().setAutoFeed(false);
    set({
      conveyorRuntime: {
        ...get().conveyorRuntime,
        speedMmS: (p / 100) * CONVEYOR_MAX_SPEED_MM_S,
        targetMm: null,
      },
    });
  },

  moveConveyor(distanceMm, absolute, feed) {
    if (get().autoFeed.enabled) get().setAutoFeed(false);
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

    // Auto-feed: run the belt while the beam is clear, stop when a box breaks it
    if (s.autoFeed.enabled && runtime.targetMm === null) {
      const want = autoFeedSpeedMmS(s.autoFeed, isSensorBlocked(s.conveyor, s.sensor, boxes));
      if (want !== runtime.speedMmS) {
        runtime = { ...runtime, speedMmS: want };
        changed = true;
      }
    }

    if (conveyorVelocity(runtime) !== 0) {
      const res = stepConveyor(s.conveyor, runtime, boxes, dtMs);
      runtime = res.runtime;
      boxes = res.boxes;
      changed = true;
    }
    const robot = useRobotStore.getState();
    const tcp = currentTcpPoseMm(robot.joints);

    if (boxes.some((b) => b.held)) {
      boxes = updateHeldBoxes(boxes, tcp);
      changed = true;
    } else if (robot.toolType === "SUCTION" && robot.gripperState === "CLOSE") {
      // Active vacuum suction picks up a box as soon as the cup physically touches its top face.
      const res = findGraspTarget(boxes, tcp, TOOL_DEFS.SUCTION, { contactOnly: true });
      if ("box" in res) {
        boxes = graspBox(boxes, res.box.id, tcp);
        changed = true;
        set({ lastGraspMessage: `Holding ${res.box.id}` });
        log(`${TOOL_DEFS.SUCTION.label}: picked ${res.box.id}`);
      }
    }
    // Contact: the tool tip and any box it carries shove resting boxes they run into.
    const pushers: Pusher[] = heldBoxPushers(boxes);
    const tip = toolPusher(tcp, TOOL_DEFS[robot.toolType]);
    if (tip) pushers.push(tip);
    for (const p of pushers) {
      const prev = lastPusherPos.get(p.id);
      if (prev) {
        p.vx = p.cx - prev.x;
        p.vy = p.cy - prev.y;
      }
    }
    lastPusherPos = new Map(pushers.map((p) => [p.id, { x: p.cx, y: p.cy }]));
    const push = pushBoxes(boxes, pushers, s.platforms, s.conveyor);
    if (push.pushed.length) {
      boxes = push.boxes;
      changed = true;
      const key = push.pushed.join(",");
      const now = Date.now();
      if (key !== lastPushKey || now - lastPushLogAt > 2000) log(`Pushed ${push.pushed.join(", ")}`);
      lastPushKey = key;
      lastPushLogAt = now;
      for (const e of push.events) {
        log(e.toppledOff ? `${e.boxId} toppled off ${e.toppledOff} onto ${e.restsOn}` : `${e.boxId} fell onto ${e.restsOn}`);
      }
    }
    // Gravity: boxes left without support (belt moved or box picked from under them) drop.
    const fall = settleUnsupported(boxes, s.platforms, s.conveyor);
    if (fall.events.length) {
      boxes = fall.boxes;
      changed = true;
      for (const e of fall.events) {
        log(e.toppledOff ? `${e.boxId} toppled off ${e.toppledOff} onto ${e.restsOn}` : `${e.boxId} fell onto ${e.restsOn}`);
      }
    }

    const blocked = isSensorBlocked(s.conveyor, s.sensor, boxes);
    if (blocked !== s.sensorBlocked) {
      set({ sensorBlocked: blocked, sensorCount: s.sensorCount + (blocked ? 1 : 0) });
      log(blocked ? "Light sensor: box detected" : "Light sensor: clear");
    }
    if (changed) set({ boxes, conveyorRuntime: runtime });

    const hasHeld = boxes.some((b) => b.held);
    const collision = hasHeld
      ? findHeldCollision(boxes, s.platforms, s.conveyor)
      : findToolCollision(tcp, TOOL_DEFS[robot.toolType], boxes, s.platforms, s.conveyor);
    if (collision !== s.collision) {
      set({ collision });
      if (collision) log(`Collision: ${collision}`, "error");
    }
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
    let nothingMsg = "No box within reach of the TCP";
    if (res.reason === "NOTHING_IN_REACH" && s.boxes.length > 0) {
      let nearest = s.boxes[0];
      let bestDist = Infinity;
      for (const b of s.boxes) {
        if (b.held) continue;
        const d = Math.hypot(b.x - tcp.x, b.y - tcp.y, b.z + b.size / 2 - tcp.z);
        if (d < bestDist) {
          bestDist = d;
          nearest = b;
        }
      }
      if (nearest && !nearest.held) {
        const dxy = Math.hypot(nearest.x - tcp.x, nearest.y - tcp.y);
        const dz = tcp.z - (nearest.z + nearest.size / 2);
        const dzText = `${dz >= 0 ? "+" : ""}${dz.toFixed(0)}mm vs top`;
        nothingMsg = `No box in reach (nearest ${nearest.id}: XY ${dxy.toFixed(0)}mm, Z ${dzText})`;
      }
    }
    const messages: Record<typeof res.reason, string> = {
      NO_TOOL: "No end-effector mounted",
      NOTHING_IN_REACH: nothingMsg,
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
    const { boxes, events } = releaseBoxesDetailed(s.boxes, s.platforms, s.conveyor);
    set({ boxes, lastGraspMessage: "", collision: null });
    for (const e of events) {
      if (e.toppledOff) log(`Released ${e.boxId}: toppled off ${e.toppledOff} onto ${e.restsOn}`, "error");
      else log(`Released ${e.boxId} onto ${e.restsOn}`);
    }
  },

  snapshot() {
    const s = get();
    return structuredClone({
      boxes: s.boxes,
      platforms: s.platforms,
      conveyor: s.conveyor,
      conveyorRuntime: { ...s.conveyorRuntime, speedMmS: 0, targetMm: null },
      sensor: s.sensor,
      autoFeed: s.autoFeed,
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
      sensor: normalizeSensor(data.sensor, data.conveyor),
      autoFeed: { ...DEFAULT_AUTO_FEED, ...(data.autoFeed ?? {}) },
    });
  },
}));

// Grab / release when the tool closes / opens (from UI, programs, or RS-485 commands).
useRobotStore.subscribe((state, prev) => {
  if (state.toolType !== prev.toolType) {
    useWorkcellStore.getState().release();
    return;
  }
  if (state.gripperState === prev.gripperState && state.gripperCommandSeq === prev.gripperCommandSeq) {
    return;
  }
  if (state.gripperState === "CLOSE") {
    if (!useWorkcellStore.getState().boxes.some((b) => b.held)) {
      useWorkcellStore.getState().grab();
    }
  } else {
    useWorkcellStore.getState().release();
  }
});
