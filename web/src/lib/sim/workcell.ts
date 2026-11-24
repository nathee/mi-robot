import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { ToolDef } from "@/lib/tools/toolDefs";

/**
 * Pure (render-free) work-cell simulation: boxes, a tray and a conveyor belt.
 * All units are millimetres in the robot base frame (Z up). The 3D viewer only mirrors this state.
 * "Physics" is deliberately simple: held boxes follow the TCP rigidly, released boxes snap down
 * onto the highest surface underneath them, and boxes resting on the belt move with it.
 */

export interface WorkBox {
  id: string;
  /** Cube edge length (mm). */
  size: number;
  color: string;
  /** Centre position (mm). */
  x: number;
  y: number;
  z: number;
  /** Orientation quaternion [x, y, z, w]. */
  q: [number, number, number, number];
  held: boolean;
  /** Box pose relative to the TCP while held (column-major Matrix4 elements). */
  heldOffset?: number[];
}

export interface Platform {
  id: string;
  label: string;
  /** Centre XY (mm), footprint size (mm), top height (mm). */
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  topZ: number;
  color: string;
}

export interface ConveyorConfig {
  /** Belt centre (mm). */
  x: number;
  y: number;
  lengthMm: number;
  widthMm: number;
  /** Belt surface height (mm). */
  topZ: number;
  /** Belt runs along this world axis; positive belt motion = +axis. */
  axis: "x" | "y";
}

export interface ConveyorRuntime {
  /** Continuous speed set by G6 F (mm/s, signed). */
  speedMmS: number;
  /** Accumulated belt travel (mm), also the D-axis position. */
  positionMm: number;
  /** Target D-axis position for a positional move, or null. */
  targetMm: number | null;
  /** Speed used for positional (D-axis) moves (mm/s). */
  moveSpeedMmS: number;
}

/**
 * Photoelectric (light) sensor across the belt. The beam sits offsetMm upstream of the end stop;
 * it is "blocked" while a box on the belt crosses the beam.
 */
export interface LightSensorConfig {
  /** Sensor installed on the conveyor. When false it never detects and auto feed is unavailable. */
  enabled: boolean;
  offsetMm: number;
}

/** Auto feed: the belt runs while the sensor is clear and stops when a box breaks the beam. */
export interface AutoFeedConfig {
  enabled: boolean;
  /** Belt speed while feeding, percent of max (positive = toward the end stop). */
  speedPercent: number;
}

export interface WorkcellSnapshot {
  boxes: WorkBox[];
  platforms: Platform[];
  conveyor: ConveyorConfig;
  conveyorRuntime: ConveyorRuntime;
  /** Optional for snapshots saved before the sensor existed. */
  sensor?: LightSensorConfig;
  autoFeed?: AutoFeedConfig;
}

export interface TcpPoseMm {
  /** Position (mm). */
  x: number;
  y: number;
  z: number;
  /** Orientation of the TCP frame. */
  quaternion: Quaternion;
}

/** 100 % on the MS4220 (G6 F100) maps to this belt speed. */
export const CONVEYOR_MAX_SPEED_MM_S = 50;
export const DEFAULT_BOX_SIZE = 25;
export const BOX_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#14b8a6"];

export const DEFAULT_CONVEYOR: ConveyorConfig = {
  x: 240,
  y: -150,
  lengthMm: 240,
  widthMm: 60,
  topZ: 60,
  axis: "x",
};

export const DEFAULT_PLATFORMS: Platform[] = [
  { id: "tray", label: "Tray", x: 200, y: 110, sizeX: 130, sizeY: 90, topZ: 20, color: "#64748b" },
];

export const PLATFORM_COLORS = ["#64748b", "#78716c", "#0f766e", "#7c3aed"];

/** Beam 2 mm in front of the end stop: the belt stops with the box (almost) touching the stop. */
export const DEFAULT_SENSOR: LightSensorConfig = { enabled: true, offsetMm: 2 };
export const DEFAULT_AUTO_FEED: AutoFeedConfig = { enabled: false, speedPercent: 60 };

export function normalizeSensor(s: Partial<LightSensorConfig> | undefined, c: ConveyorConfig): LightSensorConfig {
  const v = Number(s?.offsetMm);
  const offset = Number.isFinite(v) ? v : DEFAULT_SENSOR.offsetMm;
  return {
    enabled: s?.enabled ?? DEFAULT_SENSOR.enabled,
    offsetMm: Math.max(0, Math.min(c.lengthMm, offset)),
  };
}

/** Beam height above the belt surface (mm). */
export const SENSOR_BEAM_HEIGHT_MM = 10;

/** World position (mm) of the sensor beam centre line on the belt. */
export function sensorBeamPoint(c: ConveyorConfig, sensor: LightSensorConfig): { x: number; y: number; z: number } {
  const { min, cross } = conveyorExtent(c);
  const a = min + sensor.offsetMm;
  const z = c.topZ + SENSOR_BEAM_HEIGHT_MM;
  return c.axis === "x" ? { x: a, y: cross, z } : { x: cross, y: a, z };
}

/**
 * True while a box physically crosses the light beam: resting on the belt, or held by the tool
 * but not yet lifted above the beam. A gripped box still blocks until it is raised clear, so
 * auto-feed doesn't restart the belt the moment the gripper closes.
 */
export function isSensorBlocked(
  c: ConveyorConfig,
  sensor: LightSensorConfig,
  boxes: readonly WorkBox[]
): boolean {
  if (!sensor.enabled) return false;
  const beam = conveyorExtent(c).min + sensor.offsetMm;
  const beamZ = c.topZ + SENSOR_BEAM_HEIGHT_MM;
  return boxes.some((b) => {
    if (Math.abs(along(c, b) - beam) > b.size / 2) return false;
    if (isOnConveyor(c, b)) return true;
    return (
      Boolean(b.held) &&
      Math.abs(acrossOffset(c, b)) <= c.widthMm / 2 + b.size / 2 &&
      Math.abs(b.z - beamZ) <= b.size / 2
    );
  });
}

/** A held box still low enough over the belt to collide with boxes riding on it. */
function isHeldObstacleOnBelt(c: ConveyorConfig, b: WorkBox, riderSize: number): boolean {
  if (!b.held) return false;
  const bottom = b.z - b.size / 2;
  return bottom < c.topZ + riderSize && Math.abs(acrossOffset(c, b)) <= c.widthMm / 2 + b.size / 2;
}

/**
 * Belt speed (mm/s) for auto-feed: the belt moves boxes toward the end stop (negative direction)
 * while the beam is clear, and stops as soon as a box breaks it.
 */
export function autoFeedSpeedMmS(auto: AutoFeedConfig, blocked: boolean): number {
  if (!auto.enabled || blocked) return 0;
  const p = Math.max(0, Math.min(100, auto.speedPercent));
  return -(p / 100) * CONVEYOR_MAX_SPEED_MM_S;
}

export function defaultConveyorRuntime(): ConveyorRuntime {
  return { speedMmS: 0, positionMm: 0, targetMm: null, moveSpeedMmS: 30 };
}

const IDENTITY_Q: [number, number, number, number] = [0, 0, 0, 1];

export function makeBox(partial: Partial<WorkBox> & { id: string; x: number; y: number; z?: number }): WorkBox {
  const size = partial.size ?? DEFAULT_BOX_SIZE;
  return {
    size,
    color: partial.color ?? BOX_COLORS[0],
    z: partial.z ?? size / 2,
    q: partial.q ?? [...IDENTITY_Q],
    held: false,
    ...partial,
  };
}

/** Belt end coordinates along its axis (mm). */
export function conveyorExtent(c: ConveyorConfig): { min: number; max: number; center: number; cross: number } {
  const center = c.axis === "x" ? c.x : c.y;
  const cross = c.axis === "x" ? c.y : c.x;
  return { min: center - c.lengthMm / 2, max: center + c.lengthMm / 2, center, cross };
}

function along(c: ConveyorConfig, b: { x: number; y: number }): number {
  return c.axis === "x" ? b.x : b.y;
}

function acrossOffset(c: ConveyorConfig, b: { x: number; y: number }): number {
  return c.axis === "x" ? b.y - c.y : b.x - c.x;
}

export function isOnConveyor(c: ConveyorConfig, box: WorkBox): boolean {
  if (box.held) return false;
  const { min, max } = conveyorExtent(c);
  const a = along(c, box);
  const bottom = box.z - box.size / 2;
  return (
    Math.abs(bottom - c.topZ) < 1 &&
    a >= min - 1e-6 &&
    a <= max + 1e-6 &&
    Math.abs(acrossOffset(c, box)) <= c.widthMm / 2
  );
}

/** Feeder position: just inside the upstream end of the belt for the current direction. */
export function conveyorFeedPoint(c: ConveyorConfig, size = DEFAULT_BOX_SIZE, direction = -1): { x: number; y: number; z: number } {
  const { min, max, cross } = conveyorExtent(c);
  const a = direction < 0 ? max - size / 2 - 2 : min + size / 2 + 2;
  return c.axis === "x"
    ? { x: a, y: cross, z: c.topZ + size / 2 }
    : { x: cross, y: a, z: c.topZ + size / 2 };
}

/** Current belt velocity (mm/s, signed), including positional D-axis moves. */
export function conveyorVelocity(rt: ConveyorRuntime): number {
  if (rt.targetMm !== null) {
    const diff = rt.targetMm - rt.positionMm;
    if (Math.abs(diff) < 1e-6) return 0;
    return Math.sign(diff) * rt.moveSpeedMmS;
  }
  return rt.speedMmS;
}

/**
 * Advances the belt by dtMs and carries resting boxes along. Boxes stop at the belt ends
 * (end stop) and queue up behind each other instead of overlapping.
 */
export function stepConveyor(
  conveyor: ConveyorConfig,
  rt: ConveyorRuntime,
  boxes: readonly WorkBox[],
  dtMs: number
): { runtime: ConveyorRuntime; boxes: WorkBox[]; moved: boolean } {
  const v = conveyorVelocity(rt);
  if (v === 0 || dtMs <= 0) return { runtime: rt, boxes: boxes.slice(), moved: false };

  let delta = (v * dtMs) / 1000;
  const runtime = { ...rt };
  if (runtime.targetMm !== null) {
    const remaining = runtime.targetMm - runtime.positionMm;
    if (Math.abs(delta) >= Math.abs(remaining)) {
      delta = remaining;
      runtime.positionMm = runtime.targetMm;
      runtime.targetMm = null;
    } else {
      runtime.positionMm += delta;
    }
  } else {
    runtime.positionMm += delta;
  }

  const { min, max } = conveyorExtent(conveyor);
  const dir = Math.sign(delta);
  const next = boxes.map((b) => ({ ...b }));
  // Move the box closest to the downstream end first so followers can queue behind it.
  const onBelt = next
    .filter((b) => isOnConveyor(conveyor, b))
    .sort((a, b) => (along(conveyor, b) - along(conveyor, a)) * dir);

  let moved = false;
  for (const box of onBelt) {
    const pos = along(conveyor, box);
    let target = pos + delta;
    const half = box.size / 2;
    target = dir > 0 ? Math.min(target, max - half) : Math.max(target, min + half);
    // Queue behind boxes already processed further downstream, and behind a gripped box
    // that hasn't been lifted clear of the belt yet.
    const obstacles = [...onBelt, ...next.filter((o) => isHeldObstacleOnBelt(conveyor, o, box.size))];
    for (const other of obstacles) {
      if (other === box) continue;
      const op = along(conveyor, other);
      const ahead = (op - pos) * dir > 0;
      if (!ahead) continue;
      if (Math.abs(acrossOffset(conveyor, other) - acrossOffset(conveyor, box)) >= (other.size + box.size) / 2) continue;
      const limit = op - dir * (other.size + box.size) / 2;
      target = dir > 0 ? Math.min(target, limit) : Math.max(target, limit);
    }
    if (dir > 0 ? target < pos : target > pos) target = pos;
    if (target !== pos) {
      moved = true;
      if (conveyor.axis === "x") box.x = target;
      else box.y = target;
    }
  }
  return { runtime, boxes: next, moved };
}

function tcpMatrix(tcp: TcpPoseMm): Matrix4 {
  return new Matrix4().compose(new Vector3(tcp.x, tcp.y, tcp.z), tcp.quaternion, new Vector3(1, 1, 1));
}

function boxMatrix(b: WorkBox): Matrix4 {
  return new Matrix4().compose(
    new Vector3(b.x, b.y, b.z),
    new Quaternion(b.q[0], b.q[1], b.q[2], b.q[3]),
    new Vector3(1, 1, 1)
  );
}

export type GraspFailReason = "NO_TOOL" | "NOTHING_IN_REACH" | "TOO_LARGE" | "ALREADY_HOLDING";

/**
 * Finds the box the tool can grab from the current TCP pose.
 * Suction must touch the top face; fingers must surround the box (TCP between its centre and top).
 */
export function findGraspTarget(
  boxes: readonly WorkBox[],
  tcp: TcpPoseMm,
  tool: ToolDef
): { box: WorkBox } | { reason: GraspFailReason } {
  if (tool.maxObjectSizeMm <= 0) return { reason: "NO_TOOL" };
  if (boxes.some((b) => b.held)) return { reason: "ALREADY_HOLDING" };

  let best: { box: WorkBox; d: number } | null = null;
  let tooLarge = false;
  for (const box of boxes) {
    const top = box.z + box.size / 2;
    const dxy = Math.hypot(box.x - tcp.x, box.y - tcp.y);
    if (dxy > tool.graspRadiusMm) continue;
    const zMin = tool.type === "SUCTION" ? top - 3 : box.z - box.size * 0.25;
    const zMax = top + tool.graspHeightTolMm;
    if (tcp.z < zMin || tcp.z > zMax) continue;
    if (box.size > tool.maxObjectSizeMm) {
      tooLarge = true;
      continue;
    }
    const d = dxy + Math.abs(tcp.z - top) * 0.5;
    if (!best || d < best.d) best = { box, d };
  }
  if (best) return { box: best.box };
  return { reason: tooLarge ? "TOO_LARGE" : "NOTHING_IN_REACH" };
}

/** Attaches the box to the TCP, remembering its relative pose. */
export function graspBox(boxes: readonly WorkBox[], boxId: string, tcp: TcpPoseMm): WorkBox[] {
  const inv = tcpMatrix(tcp).invert();
  return boxes.map((b) => {
    if (b.id !== boxId) return b;
    const rel = inv.clone().multiply(boxMatrix(b));
    return { ...b, held: true, heldOffset: rel.toArray() };
  });
}

/** Moves held boxes so they follow the TCP. */
export function updateHeldBoxes(boxes: readonly WorkBox[], tcp: TcpPoseMm): WorkBox[] {
  if (!boxes.some((b) => b.held && b.heldOffset)) return boxes as WorkBox[];
  const T = tcpMatrix(tcp);
  return boxes.map((b) => {
    if (!b.held || !b.heldOffset) return b;
    const world = T.clone().multiply(new Matrix4().fromArray(b.heldOffset));
    const p = new Vector3();
    const q = new Quaternion();
    world.decompose(p, q, new Vector3());
    return { ...b, x: p.x, y: p.y, z: p.z, q: [q.x, q.y, q.z, q.w] };
  });
}

/** Height (mm) of the highest support surface under (x, y) that is not above maxZ. */
export function supportHeightAt(
  x: number,
  y: number,
  maxZ: number,
  ctx: { boxes: readonly WorkBox[]; platforms: readonly Platform[]; conveyor: ConveyorConfig; ignoreId?: string }
): number {
  let best = 0; // floor
  const consider = (top: number) => {
    if (top <= maxZ + 1e-6 && top > best) best = top;
  };
  for (const p of ctx.platforms) {
    if (Math.abs(x - p.x) <= p.sizeX / 2 && Math.abs(y - p.y) <= p.sizeY / 2) consider(p.topZ);
  }
  const c = ctx.conveyor;
  const { min, max } = conveyorExtent(c);
  const a = c.axis === "x" ? x : y;
  const off = c.axis === "x" ? y - c.y : x - c.x;
  if (a >= min && a <= max && Math.abs(off) <= c.widthMm / 2) consider(c.topZ);
  for (const b of ctx.boxes) {
    if (b.held || b.id === ctx.ignoreId) continue;
    if (Math.abs(x - b.x) <= b.size / 2 && Math.abs(y - b.y) <= b.size / 2) consider(b.z + b.size / 2);
  }
  return best;
}

/**
 * Releases held boxes: keeps only their yaw and drops them straight down onto the
 * highest surface underneath (floor, tray, conveyor belt or another box).
 */
export function releaseBoxes(
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): WorkBox[] {
  let next = boxes.map((b) => ({ ...b }));
  for (const box of next.filter((b) => b.held)) {
    const e = new Euler().setFromQuaternion(new Quaternion(...box.q), "ZYX");
    const yawQ = new Quaternion().setFromEuler(new Euler(0, 0, e.z, "ZYX"));
    const bottom = box.z - box.size / 2;
    const support = supportHeightAt(box.x, box.y, bottom + 2, {
      boxes: next,
      platforms,
      conveyor,
      ignoreId: box.id,
    });
    const placed: WorkBox = {
      ...box,
      held: false,
      heldOffset: undefined,
      z: support + box.size / 2,
      q: [yawQ.x, yawQ.y, yawQ.z, yawQ.w],
    };
    next = next.map((b) => (b.id === box.id ? placed : b));
  }
  return next;
}

export type WorkcellPresetId = "PICK_PLACE" | "CONVEYOR";

export const WORKCELL_PRESETS: Record<WorkcellPresetId, { label: string; description: string }> = {
  PICK_PLACE: {
    label: "Pick & Place",
    description: "3 boxes on the tray. Move them onto the conveyor.",
  },
  CONVEYOR: {
    label: "Conveyor Feed",
    description: "Boxes arrive on the conveyor. Pick them up at the end of the belt and place them on the tray.",
  },
};

export function buildPreset(id: WorkcellPresetId): WorkcellSnapshot {
  const conveyor = { ...DEFAULT_CONVEYOR };
  const platforms = DEFAULT_PLATFORMS.map((p) => ({ ...p }));
  const tray = platforms[0];
  const s = DEFAULT_BOX_SIZE;
  let boxes: WorkBox[] = [];
  if (id === "PICK_PLACE") {
    boxes = [-40, 0, 40].map((dy, i) =>
      makeBox({ id: `box-${i + 1}`, x: tray.x, y: tray.y + dy, z: tray.topZ + s / 2, color: BOX_COLORS[i] })
    );
  } else {
    const { min, cross } = conveyorExtent(conveyor);
    boxes = [0, 1, 2].map((i) =>
      makeBox({
        id: `box-${i + 1}`,
        x: conveyor.axis === "x" ? min + s / 2 + 70 + i * 55 : cross,
        y: conveyor.axis === "x" ? cross : min + s / 2 + 70 + i * 55,
        z: conveyor.topZ + s / 2,
        color: BOX_COLORS[i],
      })
    );
  }
  return { boxes, platforms, conveyor, conveyorRuntime: defaultConveyorRuntime() };
}

// ---------------------------------------------------------------------------
// Layout editing: move / resize the conveyor and trays, carrying resting boxes along.
// ---------------------------------------------------------------------------

/** Robot reach (mm, horizontal) used to warn when a station is placed out of reach. */
export const REACH_MIN_MM = 80;
export const REACH_MAX_MM = 300;

export type ReachStatus = "OK" | "TOO_CLOSE" | "TOO_FAR";

export function reachStatus(x: number, y: number): ReachStatus {
  const r = Math.hypot(x, y);
  if (r < REACH_MIN_MM) return "TOO_CLOSE";
  if (r > REACH_MAX_MM) return "TOO_FAR";
  return "OK";
}

/** Where boxes stop on the belt (downstream end stop, centre of a default box). */
export function conveyorPickPoint(c: ConveyorConfig, size = DEFAULT_BOX_SIZE): { x: number; y: number; z: number } {
  const { min, cross } = conveyorExtent(c);
  const a = min + size / 2;
  return c.axis === "x"
    ? { x: a, y: cross, z: c.topZ + size / 2 }
    : { x: cross, y: a, z: c.topZ + size / 2 };
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeConveyor(c: ConveyorConfig): ConveyorConfig {
  return {
    x: clampNum(c.x, -400, 400, DEFAULT_CONVEYOR.x),
    y: clampNum(c.y, -400, 400, DEFAULT_CONVEYOR.y),
    lengthMm: clampNum(c.lengthMm, 100, 600, DEFAULT_CONVEYOR.lengthMm),
    widthMm: clampNum(c.widthMm, 30, 120, DEFAULT_CONVEYOR.widthMm),
    topZ: clampNum(c.topZ, 20, 200, DEFAULT_CONVEYOR.topZ),
    axis: c.axis === "y" ? "y" : "x",
  };
}

export function normalizePlatform(p: Platform): Platform {
  return {
    ...p,
    x: clampNum(p.x, -400, 400, 200),
    y: clampNum(p.y, -400, 400, 110),
    sizeX: clampNum(p.sizeX, 30, 300, 130),
    sizeY: clampNum(p.sizeY, 30, 300, 90),
    topZ: clampNum(p.topZ, 5, 200, 20),
  };
}

/** Boxes resting on a footprint at topZ, including boxes stacked on top of them. */
function boxesCarriedBy(
  boxes: readonly WorkBox[],
  inFootprint: (b: WorkBox) => boolean,
  topZ: number
): Set<string> {
  const carried = new Set<string>();
  const sorted = boxes.filter((b) => !b.held).sort((a, b) => a.z - b.z);
  for (const b of sorted) {
    const bottom = b.z - b.size / 2;
    if (inFootprint(b) && Math.abs(bottom - topZ) < 1) {
      carried.add(b.id);
      continue;
    }
    // Stacked on an already-carried box
    const base = sorted.find(
      (o) =>
        carried.has(o.id) &&
        Math.abs(o.z + o.size / 2 - bottom) < 1 &&
        Math.abs(o.x - b.x) <= o.size / 2 &&
        Math.abs(o.y - b.y) <= o.size / 2
    );
    if (base) carried.add(b.id);
  }
  return carried;
}

/**
 * Applies a conveyor layout change. Boxes riding on the belt keep their place on it:
 * same distance from the end stop and the same offset across the belt.
 */
export function applyConveyorLayout(
  conveyor: ConveyorConfig,
  boxes: readonly WorkBox[],
  partial: Partial<ConveyorConfig>
): { conveyor: ConveyorConfig; boxes: WorkBox[] } {
  const next = normalizeConveyor({ ...conveyor, ...partial });
  const prevExt = conveyorExtent(conveyor);
  const nextExt = conveyorExtent(next);
  const carried = boxesCarriedBy(
    boxes,
    (b) =>
      along(conveyor, b) >= prevExt.min - 1e-6 &&
      along(conveyor, b) <= prevExt.max + 1e-6 &&
      Math.abs(acrossOffset(conveyor, b)) <= conveyor.widthMm / 2,
    conveyor.topZ
  );
  const dz = next.topZ - conveyor.topZ;
  const out = boxes.map((b) => {
    if (!carried.has(b.id)) return b;
    const fromEnd = along(conveyor, b) - prevExt.min;
    const off = acrossOffset(conveyor, b);
    const a = Math.min(nextExt.max - b.size / 2, nextExt.min + fromEnd);
    const o = Math.max(-next.widthMm / 2 + b.size / 2, Math.min(next.widthMm / 2 - b.size / 2, off));
    const x = next.axis === "x" ? a : next.x + o;
    const y = next.axis === "x" ? next.y + o : a;
    let q = b.q;
    if (next.axis !== conveyor.axis) {
      const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), next.axis === "y" ? Math.PI / 2 : -Math.PI / 2);
      const nq = turn.multiply(new Quaternion(...b.q));
      q = [nq.x, nq.y, nq.z, nq.w];
    }
    return { ...b, x, y, z: b.z + dz, q };
  });
  return { conveyor: next, boxes: out };
}

/** Applies a tray layout change; boxes on the tray (and stacks on them) move with it. */
export function applyPlatformLayout(
  platform: Platform,
  boxes: readonly WorkBox[],
  partial: Partial<Platform>
): { platform: Platform; boxes: WorkBox[] } {
  const next = normalizePlatform({ ...platform, ...partial, id: platform.id });
  const carried = boxesCarriedBy(
    boxes,
    (b) => Math.abs(b.x - platform.x) <= platform.sizeX / 2 && Math.abs(b.y - platform.y) <= platform.sizeY / 2,
    platform.topZ
  );
  const dx = next.x - platform.x;
  const dy = next.y - platform.y;
  const dz = next.topZ - platform.topZ;
  const out = boxes.map((b) => {
    if (!carried.has(b.id)) return b;
    // Keep boxes inside a shrunken tray
    const x = Math.max(next.x - next.sizeX / 2, Math.min(next.x + next.sizeX / 2, b.x + dx));
    const y = Math.max(next.y - next.sizeY / 2, Math.min(next.y + next.sizeY / 2, b.y + dy));
    return { ...b, x, y, z: b.z + dz };
  });
  return { platform: next, boxes: out };
}

/** Drops every resting box straight down onto whatever is underneath it now (bottom-up). */
export function settleBoxes(
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): WorkBox[] {
  const order = boxes
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.held)
    .sort((a, b) => a.b.z - b.b.z);
  const out = boxes.slice();
  const settled: WorkBox[] = [];
  for (const { b, i } of order) {
    const support = supportHeightAt(b.x, b.y, b.z - b.size / 2 + 2, {
      boxes: settled,
      platforms,
      conveyor,
    });
    const nb = { ...b, z: support + b.size / 2 };
    out[i] = nb;
    settled.push(nb);
  }
  return out;
}
