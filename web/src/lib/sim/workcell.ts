import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { ToolDef } from "@/lib/tools/toolDefs";
import { t } from "@/lib/i18n";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";

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

/** Default conveyor for the active robot (read at call time: the robot can change). */
export function defaultConveyor(): ConveyorConfig {
  return { ...(getActiveRobotProfile().workcell?.conveyor ?? DEFAULT_CONVEYOR) };
}

/** Default trays for the active robot. */
export function defaultPlatforms(): Platform[] {
  return (getActiveRobotProfile().workcell?.platforms ?? DEFAULT_PLATFORMS).map((p) => ({ ...p }));
}

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
  return boxAtSensor(c, sensor, boxes) !== null;
}

/** The box crossing the light beam (see isSensorBlocked), or null when the beam is clear. */
export function boxAtSensor(
  c: ConveyorConfig,
  sensor: LightSensorConfig,
  boxes: readonly WorkBox[]
): WorkBox | null {
  if (!sensor.enabled) return null;
  const beam = conveyorExtent(c).min + sensor.offsetMm;
  const beamZ = c.topZ + SENSOR_BEAM_HEIGHT_MM;
  return (
    boxes.find((b) => {
      if (Math.abs(along(c, b) - beam) > b.size / 2) return false;
      if (isOnConveyor(c, b)) return true;
      return (
        Boolean(b.held) &&
        Math.abs(acrossOffset(c, b)) <= c.widthMm / 2 + b.size / 2 &&
        Math.abs(b.z - beamZ) <= b.size / 2
      );
    }) ?? null
  );
}

/** Names for BOX_COLORS, used by the `COLOR?` reply so a controller can sort by colour. */
const BOX_COLOR_NAMES: Record<string, string> = {
  "#ef4444": "RED",
  "#3b82f6": "BLUE",
  "#22c55e": "GREEN",
  "#f59e0b": "AMBER",
  "#a855f7": "PURPLE",
  "#14b8a6": "TEAL",
};

/** Colour name of a box (RED, BLUE, ...), or its hex code for a custom colour. */
export function boxColorName(color: string): string {
  return BOX_COLOR_NAMES[color.toLowerCase()] ?? color.toUpperCase();
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
  // Boxes stacked on a belt box ride along with it (decided before anything moves).
  const riders = new Map(onBelt.map((b) => [b.id, stackAbove(next, b)]));

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
      for (const b of [box, ...(riders.get(box.id) ?? [])]) {
        if (conveyor.axis === "x") b.x += target - pos;
        else b.y += target - pos;
      }
    }
  }
  return { runtime, boxes: next, moved };
}

/** Resting boxes stacked on `base`, directly or through other boxes (bottom-up). */
function stackAbove(boxes: readonly WorkBox[], base: WorkBox): WorkBox[] {
  const out: WorkBox[] = [];
  const level = [base];
  const sorted = boxes.filter((b) => !b.held && b !== base).sort((a, b) => a.z - b.z);
  for (const b of sorted) {
    const bottom = b.z - b.size / 2;
    const on = level.some(
      (o) =>
        Math.abs(o.z + o.size / 2 - bottom) < 1 &&
        overlapLen(b.x, b.size / 2, o.x, o.size / 2) > CONTACT_EPS_MM &&
        overlapLen(b.y, b.size / 2, o.y, o.size / 2) > CONTACT_EPS_MM
    );
    if (on) {
      out.push(b);
      level.push(b);
    }
  }
  return out;
}

/**
 * Free place for a new box on the belt: the feed point, or the nearest spot downstream of it
 * that no box occupies. Null when the belt is full there (never stacks a box on another).
 */
export function findFreeBeltSpot(
  c: ConveyorConfig,
  boxes: readonly WorkBox[],
  size = DEFAULT_BOX_SIZE,
  direction = -1
): { x: number; y: number; z: number } | null {
  const feed = conveyorFeedPoint(c, size, direction);
  const { min, max } = conveyorExtent(c);
  const step = direction < 0 ? -1 : 1;
  for (let a = along(c, feed); a >= min + size / 2 - 1e-6 && a <= max - size / 2 + 1e-6; a += step) {
    const p = c.axis === "x" ? { x: a, y: feed.y } : { x: feed.x, y: a };
    const blocked = boxes.some(
      (b) =>
        b.z - b.size / 2 < c.topZ + size &&
        overlapLen(p.x, size / 2, b.x, b.size / 2) > CONTACT_EPS_MM &&
        overlapLen(p.y, size / 2, b.y, b.size / 2) > CONTACT_EPS_MM
    );
    if (!blocked) return { ...p, z: feed.z };
  }
  return null;
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
  tool: ToolDef,
  options: { contactOnly?: boolean } = {}
): { box: WorkBox } | { reason: GraspFailReason } {
  if (tool.maxObjectSizeMm <= 0) return { reason: "NO_TOOL" };
  if (boxes.some((b) => b.held)) return { reason: "ALREADY_HOLDING" };

  let best: { box: WorkBox; d: number } | null = null;
  let tooLarge = false;
  for (const box of boxes) {
    const top = box.z + box.size / 2;
    const dxy = Math.hypot(box.x - tcp.x, box.y - tcp.y);
    if (dxy > tool.graspRadiusMm) continue;
    // Suction cup seals at the top face (only ~2-3 mm bellows compression, never deep inside the box).
    const zMin =
      tool.type === "SUCTION"
        ? top - (options.contactOnly ? 2.5 : 3)
        : box.z - box.size * 0.25;
    const zMax =
      tool.type === "SUCTION" && options.contactOnly
        ? top + 2.5
        : top + tool.graspHeightTolMm;
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

// ---------------------------------------------------------------------------
// Contact: stacking, toppling and collisions (boxes treated as axis-aligned cubes)
// ---------------------------------------------------------------------------

/** End-stop plate at the downstream belt end (mm); keep in sync with workcellVisuals. */
export const END_STOP_THICKNESS_MM = 3;
export const END_STOP_HEIGHT_MM = 16;

/** Footprints must overlap by more than this (mm) on both axes to touch / support. */
const CONTACT_EPS_MM = 0.5;
/** Interpenetration (mm) tolerated before a held box counts as colliding. */
export const COLLISION_TOL_MM = 2;

interface SupportSurface {
  id: string;
  label: string;
  top: number;
  /** Underside height: 0 for platforms / conveyor (solid from the floor), box bottom for boxes. */
  bottom: number;
  cx: number;
  cy: number;
  hx: number;
  hy: number;
}

interface ContactCtx {
  boxes: readonly WorkBox[];
  platforms: readonly Platform[];
  conveyor: ConveyorConfig;
}

function overlapLen(a: number, ah: number, b: number, bh: number): number {
  return Math.min(a + ah, b + bh) - Math.max(a - ah, b - bh);
}

/** Solid surfaces in the cell (tray platforms, conveyor body, resting boxes), excluding one box. */
function solidSurfaces(ctx: ContactCtx, ignoreId?: string): SupportSurface[] {
  const out: SupportSurface[] = ctx.platforms.map((p) => ({
    id: p.id,
    label: p.label,
    top: p.topZ,
    bottom: 0,
    cx: p.x,
    cy: p.y,
    hx: p.sizeX / 2,
    hy: p.sizeY / 2,
  }));
  const c = ctx.conveyor;
  const { min, max, cross } = conveyorExtent(c);
  const halfLen = (max - min) / 2;
  const mid = (max + min) / 2;
  out.push(
    c.axis === "x"
      ? { id: "conveyor", label: "Conveyor", top: c.topZ, bottom: 0, cx: mid, cy: cross, hx: halfLen, hy: c.widthMm / 2 }
      : { id: "conveyor", label: "Conveyor", top: c.topZ, bottom: 0, cx: cross, cy: mid, hx: c.widthMm / 2, hy: halfLen }
  );
  // End-stop plate just past the downstream end (matches the viewer: 3 mm thick, 16 mm tall).
  const stopA = min - END_STOP_THICKNESS_MM / 2;
  const stopTop = c.topZ + END_STOP_HEIGHT_MM;
  const stopHalfT = END_STOP_THICKNESS_MM / 2;
  out.push(
    c.axis === "x"
      ? { id: "end-stop", label: "End stop", top: stopTop, bottom: 0, cx: stopA, cy: cross, hx: stopHalfT, hy: c.widthMm / 2 }
      : { id: "end-stop", label: "End stop", top: stopTop, bottom: 0, cx: cross, cy: stopA, hx: c.widthMm / 2, hy: stopHalfT }
  );
  for (const b of ctx.boxes) {
    if (b.held || b.id === ignoreId) continue;
    out.push({ id: b.id, label: b.id, top: b.z + b.size / 2, bottom: b.z - b.size / 2, cx: b.x, cy: b.y, hx: b.size / 2, hy: b.size / 2 });
  }
  return out;
}

function yawOnly(q: readonly [number, number, number, number]): Quaternion {
  const e = new Euler().setFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]), "ZYX");
  return new Quaternion().setFromEuler(new Euler(0, 0, e.z, "ZYX"));
}

export interface LandingEvent {
  boxId: string;
  /** Box (or surface) it tipped off, when it toppled. */
  toppledOff?: string;
  /** What it finally rests on. */
  restsOn: string;
}

/**
 * Drops a box straight down onto whatever is under its footprint. If its centre isn't over the
 * surface it lands on (e.g. placed half over the edge of another box), it tips over that edge,
 * rotates 90° and falls to the next surface below.
 */
export function landBox(box: WorkBox, ctx: ContactCtx, depth = 0): { box: WorkBox; event: LandingEvent } {
  const half = box.size / 2;
  const under = solidSurfaces(ctx, box.id).filter(
    (s) =>
      overlapLen(box.x, half, s.cx, s.hx) > CONTACT_EPS_MM &&
      overlapLen(box.y, half, s.cy, s.hy) > CONTACT_EPS_MM
  );
  // Every solid that starts below the box's top is under it or inside it. A box can't share
  // space with another, so it rests on the highest of them: released inside a stack, it ends
  // on top of the stack. Raising it can reach boxes stacked higher, so repeat until it settles.
  let top = box.z + half;
  let surfaces = under.filter((s) => s.bottom < top - 1);
  let height = surfaces.reduce((m, s) => Math.max(m, s.top), 0);
  while (height + box.size > top + 1e-6) {
    top = height + box.size;
    surfaces = under.filter((s) => s.bottom < top - 1);
    height = surfaces.reduce((m, s) => Math.max(m, s.top), 0);
  }
  const resting = surfaces.filter((s) => Math.abs(s.top - height) < 0.5);
  const q = new Quaternion(box.q[0], box.q[1], box.q[2], box.q[3]);
  const settled = (b: WorkBox, quat: Quaternion, restsOn: string) => ({
    box: { ...b, held: false, heldOffset: undefined, z: height + half, q: [quat.x, quat.y, quat.z, quat.w] as WorkBox["q"] },
    event: { boxId: b.id, restsOn },
  });

  if (resting.length === 0) return settled(box, q, "Floor");
  const centreSupported = resting.some(
    (s) => Math.abs(box.x - s.cx) <= s.hx + 1e-6 && Math.abs(box.y - s.cy) <= s.hy + 1e-6
  );
  if (centreSupported || depth >= 3) return settled(box, q, resting[0].label);

  // Centre of mass hangs over the edge: tip off the surface it overlaps most.
  const s = resting.reduce((a, b) =>
    overlapLen(box.x, half, a.cx, a.hx) * overlapLen(box.y, half, a.cy, a.hy) >=
    overlapLen(box.x, half, b.cx, b.hx) * overlapLen(box.y, half, b.cy, b.hy)
      ? a
      : b
  );
  const exX = Math.abs(box.x - s.cx) - s.hx;
  const exY = Math.abs(box.y - s.cy) - s.hy;
  const alongX = exX >= exY;
  const sign = alongX ? Math.sign(box.x - s.cx) || 1 : Math.sign(box.y - s.cy) || 1;
  const tip = new Quaternion().setFromAxisAngle(
    alongX ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0),
    (alongX ? sign : -sign) * (Math.PI / 2)
  );
  const fallen: WorkBox = {
    ...box,
    x: alongX ? s.cx + sign * (s.hx + half + 0.5) : box.x,
    y: alongX ? box.y : s.cy + sign * (s.hy + half + 0.5),
    z: height + half,
    q: (() => {
      const nq = tip.multiply(q);
      return [nq.x, nq.y, nq.z, nq.w] as WorkBox["q"];
    })(),
  };
  const res = landBox(fallen, ctx, depth + 1);
  return { box: res.box, event: { ...res.event, toppledOff: res.event.toppledOff ?? s.label } };
}

/**
 * Releases held boxes: keeps only their yaw and lands them on the highest surface under their
 * footprint (floor, tray, conveyor belt or other boxes), toppling them if they hang over an edge.
 */
export function releaseBoxesDetailed(
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): { boxes: WorkBox[]; events: LandingEvent[] } {
  let next = boxes.map((b) => ({ ...b }));
  const events: LandingEvent[] = [];
  for (const held of next.filter((b) => b.held)) {
    const yaw = yawOnly(held.q);
    const start: WorkBox = { ...held, held: false, heldOffset: undefined, q: [yaw.x, yaw.y, yaw.z, yaw.w] };
    const others = next.filter((b) => b.id !== held.id);
    const { box, event } = landBox(start, { boxes: others, platforms, conveyor });
    events.push(event);
    next = next.map((b) => (b.id === held.id ? box : b));
  }
  return { boxes: next, events };
}

export function releaseBoxes(
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): WorkBox[] {
  return releaseBoxesDetailed(boxes, platforms, conveyor).boxes;
}

/**
 * Gravity for resting boxes: any box with nothing under it (its support was carried away by the
 * belt, picked up, or pushed off) drops onto whatever is below, toppling over an edge when it
 * hangs off. Boxes listed in `recheck` (e.g. just pushed) also topple when their centre of mass
 * no longer sits over the surface they rest on. Bottom-up, so whole stacks come down together.
 */
export function settleUnsupported(
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig,
  recheck: ReadonlySet<string> = new Set()
): { boxes: WorkBox[]; events: LandingEvent[] } {
  let next = boxes.slice();
  const events: LandingEvent[] = [];
  const order = next.filter((b) => !b.held).sort((a, b) => a.z - b.z).map((b) => b.id);
  for (const id of order) {
    const b = next.find((o) => o.id === id)!;
    const half = b.size / 2;
    const bottom = b.z - half;
    const others = next.filter((o) => o.id !== id);
    const ctx = { boxes: others, platforms, conveyor };
    const under = solidSurfaces(ctx, id).filter(
      (s) =>
        s.top <= bottom + 1 &&
        overlapLen(b.x, half, s.cx, s.hx) > CONTACT_EPS_MM &&
        overlapLen(b.y, half, s.cy, s.hy) > CONTACT_EPS_MM
    );
    const height = under.reduce((m, s) => Math.max(m, s.top), 0);
    let fall = bottom - height > 0.5;
    if (!fall && recheck.has(id)) {
      const resting = under.filter((s) => Math.abs(s.top - height) < 0.5);
      fall =
        resting.length > 0 &&
        !resting.some((s) => Math.abs(b.x - s.cx) <= s.hx + 1e-6 && Math.abs(b.y - s.cy) <= s.hy + 1e-6);
    }
    if (!fall) continue;
    // landBox drops from the current height; start just above the support to avoid
    // being lifted onto anything the box merely overlaps sideways.
    const res = landBox({ ...b, z: Math.max(height, 0) + half + 0.01 }, ctx);
    if (Math.abs(res.box.z - b.z) < 1e-6 && res.box.x === b.x && res.box.y === b.y) continue;
    next = next.map((o) => (o.id === id ? res.box : o));
    events.push(res.event);
  }
  return { boxes: next, events };
}

/** Axis-aligned solid that can push resting boxes (a held box or the tool tip). */
export interface Pusher {
  id: string;
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  bottom: number;
  top: number;
  /** Tool tip: never pushes a box whose footprint contains the TCP (that's pressing/gripping it). */
  isTool?: boolean;
  /** Horizontal motion since the previous frame (mm). Boxes are pushed the way the pusher moves. */
  vx?: number;
  vy?: number;
}

export function heldBoxPushers(boxes: readonly WorkBox[]): Pusher[] {
  return boxes
    .filter((b) => b.held)
    .map((b) => ({ id: b.id, cx: b.x, cy: b.y, hx: b.size / 2, hy: b.size / 2, bottom: b.z - b.size / 2, top: b.z + b.size / 2 }));
}

/** Tool tip as a small column from the TCP up the tool body. Null for the bare flange. */
export function toolPusher(tcp: TcpPoseMm, tool: ToolDef): Pusher | null {
  const half = tool.type === "SUCTION" || tool.type === "NONE" ? 4 : 2;
  return {
    id: "__tool__",
    cx: tcp.x,
    cy: tcp.y,
    hx: half,
    hy: half,
    bottom: tcp.z,
    top: tcp.z + Math.max(20, tool.tcpOffsetMm),
    isTool: true,
  };
}

/**
 * Real-world contact instead of interpenetration: when the tool or a box it carries moves into a
 * resting box from the side, that box is shoved out of the way (along the shallowest overlap),
 * carrying boxes stacked on it and shoving the boxes it runs into in turn. A box can't be pushed
 * into the tray or conveyor body; pressing down on top of a box never pushes it (that stays a
 * collision). Pushed boxes then fall or topple if they lost their support.
 */
export function pushBoxes(
  boxes: readonly WorkBox[],
  pushers: readonly Pusher[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): { boxes: WorkBox[]; pushed: string[]; events: LandingEvent[] } {
  let next = boxes.map((b) => ({ ...b }));
  const pushed = new Set<string>();
  const statics = solidSurfaces({ boxes: [], platforms, conveyor });
  const active: Pusher[] = [...pushers];
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (const p of [...active]) {
      for (const b of next) {
        if (b.held || b.id === p.id) continue;
        const h = b.size / 2;
        const ox = overlapLen(p.cx, p.hx, b.x, h);
        const oy = overlapLen(p.cy, p.hy, b.y, h);
        const oz = Math.min(p.top, b.z + h) - Math.max(p.bottom, b.z - h);
        if (ox <= 0.05 || oy <= 0.05 || oz <= 0.05) continue;
        if (p.isTool && Math.abs(p.cx - b.x) <= h && Math.abs(p.cy - b.y) <= h) {
          // TCP over the box: gripping or pressing it, unless it just came in through a side face.
          const px = p.cx - (p.vx ?? 0);
          const py = p.cy - (p.vy ?? 0);
          if (Math.abs(px - b.x) <= h && Math.abs(py - b.y) <= h) continue;
        }
        if (oz <= Math.min(ox, oy)) continue; // contact from above/below: not a sideways push
        const vx = p.vx ?? 0;
        const vy = p.vy ?? 0;
        // Which face did the pusher come in through? Compare with its position last frame:
        // the axis on which it wasn't overlapping before is the one it crossed.
        const wasX = overlapLen(p.cx - vx, p.hx, b.x, h) > 0.05;
        const wasY = overlapLen(p.cy - vy, p.hy, b.y, h) > 0.05;
        let alongX: boolean;
        let sign: number;
        if (wasX !== wasY) {
          // Crossed exactly one face: shove the box ahead of the pusher on that axis.
          alongX = !wasX;
          sign = Math.sign(alongX ? vx : vy) || (alongX ? Math.sign(b.x - p.cx) : Math.sign(b.y - p.cy)) || 1;
        } else {
          // Already touching (or entered diagonally / from above): separate along the shallowest overlap.
          alongX = ox <= oy;
          sign = (alongX ? Math.sign(b.x - p.cx) : Math.sign(b.y - p.cy)) || 1;
        }
        const d = alongX
          ? p.cx + sign * (p.hx + h + 0.05) - b.x
          : p.cy + sign * (p.hy + h + 0.05) - b.y;
        if (d * sign <= 0) continue; // already clear on that side
        const dx = alongX ? d : 0;
        const dy = alongX ? 0 : d;
        const group = [b, ...stackAbove(next, b)];
        const hitsStatic = group.some((g) =>
          statics.some(
            (s) =>
              s.top > g.z - g.size / 2 + 1 &&
              overlapLen(g.x + dx, g.size / 2, s.cx, s.hx) > CONTACT_EPS_MM &&
              overlapLen(g.y + dy, g.size / 2, s.cy, s.hy) > CONTACT_EPS_MM
          )
        );
        if (hitsStatic) continue; // jammed: stays a collision
        const ids = new Set(group.map((g) => g.id));
        next = next.map((o) => (ids.has(o.id) ? { ...o, x: o.x + dx, y: o.y + dy } : o));
        for (const g of next) {
          if (!ids.has(g.id)) continue;
          pushed.add(g.id);
          const gh = g.size / 2;
          const entry: Pusher = { id: g.id, cx: g.x, cy: g.y, hx: gh, hy: gh, bottom: g.z - gh, top: g.z + gh, vx: dx, vy: dy };
          const i = active.findIndex((a) => a.id === g.id);
          if (i >= 0) active[i] = entry;
          else active.push(entry);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  if (pushed.size === 0) return { boxes: next, pushed: [], events: [] };
  const settled = settleUnsupported(next, platforms, conveyor, pushed);
  // A box that toppled or fell back into the tool / carried box would be shoved again next
  // frame, forever. Give up on this push instead: the contact stays a plain collision.
  const before = new Map(boxes.map((b) => [b.id, b]));
  const movedNow = (b: WorkBox) => {
    const o = before.get(b.id);
    return !o || o.x !== b.x || o.y !== b.y || o.z !== b.z;
  };
  const backInside = settled.boxes.some(
    (b) =>
      !b.held &&
      movedNow(b) &&
      pushers.some((p) => {
        const h = b.size / 2;
        return (
          overlapLen(p.cx, p.hx, b.x, h) > 0.5 &&
          overlapLen(p.cy, p.hy, b.y, h) > 0.5 &&
          Math.min(p.top, b.z + h) - Math.max(p.bottom, b.z - h) > 0.5
        );
      })
  );
  if (backInside) return { boxes: boxes.map((b) => ({ ...b })), pushed: [], events: [] };
  return { boxes: settled.boxes, pushed: [...pushed], events: settled.events };
}

/**
 * Returns a description when a box carried by the tool is pushed into another box, the tray,
 * the conveyor or the floor (more than COLLISION_TOL_MM of interpenetration), else null.
 */
export function findHeldCollision(
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): string | null {
  for (const h of boxes) {
    if (!h.held) continue;
    const half = h.size / 2;
    const bottom = h.z - half;
    if (bottom < -COLLISION_TOL_MM) return `${h.id} hit the floor`;
    for (const s of solidSurfaces({ boxes, platforms, conveyor }, h.id)) {
      if (overlapLen(h.x, half, s.cx, s.hx) <= COLLISION_TOL_MM) continue;
      if (overlapLen(h.y, half, s.cy, s.hy) <= COLLISION_TOL_MM) continue;
      const zOverlap = Math.min(h.z + half, s.top) - Math.max(bottom, s.bottom);
      if (zOverlap > COLLISION_TOL_MM) return `${h.id} hit ${s.label}`;
    }
  }
  return null;
}

/**
 * Returns a description when the robot end-effector tip (TCP) pierces into the floor, conveyor,
 * tray, or (for centerline tools like the suction cup / bare flange) a resting box.
 * Finger grippers are allowed around the sides of a box down to its bottom, but still collide
 * with solid tables, conveyor belt, and floor.
 */
export function findToolCollision(
  tcp: TcpPoseMm,
  tool: ToolDef,
  boxes: readonly WorkBox[],
  platforms: readonly Platform[],
  conveyor: ConveyorConfig
): string | null {
  if (tcp.z < -COLLISION_TOL_MM) return `${tool.label} hit the floor`;

  const tipHalf = tool.type === "SUCTION" ? 4 : 2;
  const checkBoxes = tool.type === "SUCTION" || tool.type === "NONE";

  for (const s of solidSurfaces({ boxes: checkBoxes ? boxes : [], platforms, conveyor })) {
    if (overlapLen(tcp.x, tipHalf, s.cx, s.hx) <= COLLISION_TOL_MM) continue;
    if (overlapLen(tcp.y, tipHalf, s.cy, s.hy) <= COLLISION_TOL_MM) continue;
    if (tcp.z < s.top - COLLISION_TOL_MM && tcp.z > s.bottom - 10) {
      return `${tool.label} hit ${s.label}`;
    }
  }
  return null;
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

/** Localized preset text for display. */
export function workcellPresetText(id: WorkcellPresetId, field: "label" | "description"): string {
  return t(`workcell.preset.${id}.${field}`);
}

/** Platform labels are stored in English ("Tray", "Tray 2"); translate them for display. */
export function platformDisplayLabel(label: string): string {
  if (label === "Tray") return t("workcell.tray");
  const m = /^Tray (\d+)$/.exec(label);
  return m ? t("workcell.trayN", { n: m[1] }) : label;
}

export function buildPreset(id: WorkcellPresetId): WorkcellSnapshot {
  const conveyor = defaultConveyor();
  const platforms = defaultPlatforms();
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

/** Generic robot reach (mm, horizontal) used to warn when a station is placed out of reach. */
export const REACH_MIN_MM = 80;
export const REACH_MAX_MM = 300;

export type ReachStatus = "OK" | "TOO_CLOSE" | "TOO_FAR";

export function reachStatus(x: number, y: number): ReachStatus {
  const r = Math.hypot(x, y);
  const wc = getActiveRobotProfile().workcell;
  if (r < (wc?.reachMinMm ?? REACH_MIN_MM)) return "TOO_CLOSE";
  if (r > (wc?.reachMaxMm ?? REACH_MAX_MM)) return "TOO_FAR";
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
  const def = defaultConveyor();
  return {
    x: clampNum(c.x, -400, 400, def.x),
    y: clampNum(c.y, -400, 400, def.y),
    lengthMm: clampNum(c.lengthMm, 100, 600, def.lengthMm),
    widthMm: clampNum(c.widthMm, 30, 120, def.widthMm),
    topZ: clampNum(c.topZ, 20, 200, def.topZ),
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
