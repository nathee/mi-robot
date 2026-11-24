import { Quaternion } from "three";
import { describe, expect, it } from "vitest";
import { parseIncomingHardwareLine } from "@/lib/hardware/protocol";
import {
  buildPreset,
  conveyorExtent,
  defaultConveyorRuntime,
  DEFAULT_CONVEYOR,
  DEFAULT_PLATFORMS,
  findGraspTarget,
  graspBox,
  isOnConveyor,
  makeBox,
  findHeldCollision,
  releaseBoxes,
  releaseBoxesDetailed,
  stepConveyor,
  updateHeldBoxes,
  type TcpPoseMm,
} from "@/lib/sim/workcell";
import { TOOL_DEFS } from "@/lib/tools/toolDefs";

const down = new Quaternion();
const tcp = (x: number, y: number, z: number): TcpPoseMm => ({ x, y, z, quaternion: down.clone() });
const tray = DEFAULT_PLATFORMS[0];
const conveyor = DEFAULT_CONVEYOR;

describe("grasping", () => {
  const box = makeBox({ id: "b", x: 200, y: 100, z: 20 + 12.5 }); // on the tray, top = 45

  it("suction picks when touching the top face", () => {
    expect("box" in findGraspTarget([box], tcp(200, 100, 46), TOOL_DEFS.SUCTION)).toBe(true);
    expect(findGraspTarget([box], tcp(200, 100, 70), TOOL_DEFS.SUCTION)).toEqual({ reason: "NOTHING_IN_REACH" });
    expect(findGraspTarget([box], tcp(230, 100, 46), TOOL_DEFS.SUCTION)).toEqual({ reason: "NOTHING_IN_REACH" });
  });

  it("finger grippers pick when the fingertips surround the box", () => {
    expect("box" in findGraspTarget([box], tcp(200, 100, 38), TOOL_DEFS.TWO_FINGER)).toBe(true);
    expect("box" in findGraspTarget([box], tcp(200, 100, 38), TOOL_DEFS.THREE_FINGER_SOFT)).toBe(true);
  });

  it("rejects boxes larger than the tool opening and the bare flange", () => {
    const big = makeBox({ id: "big", x: 200, y: 100, size: 40, z: 40 });
    expect(findGraspTarget([big], tcp(200, 100, 50), TOOL_DEFS.MICRO_SERVO)).toEqual({ reason: "TOO_LARGE" });
    expect(findGraspTarget([box], tcp(200, 100, 46), TOOL_DEFS.NONE)).toEqual({ reason: "NO_TOOL" });
  });

  it("held box follows the TCP and drops onto the conveyor when released", () => {
    let boxes = graspBox([box], "b", tcp(200, 100, 46));
    const { min, cross } = conveyorExtent(conveyor);
    boxes = updateHeldBoxes(boxes, tcp(min + 60, cross, 46 + 80));
    expect(boxes[0].x).toBeCloseTo(min + 60, 6);
    expect(boxes[0].z).toBeCloseTo(46 + 80 - 13.5, 6);
    boxes = releaseBoxes(boxes, DEFAULT_PLATFORMS, conveyor);
    expect(boxes[0].held).toBe(false);
    expect(boxes[0].z).toBeCloseTo(conveyor.topZ + 12.5, 6);
    expect(isOnConveyor(conveyor, boxes[0])).toBe(true);
  });

  it("released box stacks on another box", () => {
    const base = makeBox({ id: "a", x: 200, y: 100, z: tray.topZ + 12.5 });
    let boxes = graspBox([base, makeBox({ id: "b", x: 150, y: 100, z: 12.5 })], "b", tcp(150, 100, 26));
    boxes = updateHeldBoxes(boxes, tcp(202, 101, 120));
    boxes = releaseBoxes(boxes, DEFAULT_PLATFORMS, conveyor);
    expect(boxes[1].z).toBeCloseTo(tray.topZ + 25 + 12.5, 6);
  });
});

describe("conveyor", () => {
  it("carries boxes and stops them at the end of the belt", () => {
    const { min, max, cross } = conveyorExtent(conveyor);
    const box = makeBox({ id: "b", x: max - 20, y: cross, z: conveyor.topZ + 12.5 });
    const rt = { ...defaultConveyorRuntime(), speedMmS: -50 };
    let res = stepConveyor(conveyor, rt, [box], 1000);
    expect(res.boxes[0].x).toBeCloseTo(max - 70, 6);
    for (let i = 0; i < 20; i++) res = stepConveyor(conveyor, res.runtime, res.boxes, 1000);
    expect(res.boxes[0].x).toBeCloseTo(min + 12.5, 6);
  });

  it("queues boxes behind each other", () => {
    const { min, cross } = conveyorExtent(conveyor);
    const a = makeBox({ id: "a", x: min + 12.5, y: cross, z: conveyor.topZ + 12.5 });
    const b = makeBox({ id: "b", x: min + 80, y: cross, z: conveyor.topZ + 12.5 });
    const res = stepConveyor(conveyor, { ...defaultConveyorRuntime(), speedMmS: -50 }, [a, b], 5000);
    expect(res.boxes[0].x).toBeCloseTo(min + 12.5, 6);
    expect(res.boxes[1].x).toBeCloseTo(min + 37.5, 6);
  });

  it("positional D-axis move stops at the target", () => {
    const rt = { ...defaultConveyorRuntime(), targetMm: -40, moveSpeedMmS: 30 };
    let res = stepConveyor(conveyor, rt, [], 1000);
    expect(res.runtime.positionMm).toBeCloseTo(-30, 6);
    res = stepConveyor(conveyor, res.runtime, [], 1000);
    expect(res.runtime.positionMm).toBeCloseTo(-40, 6);
    expect(res.runtime.targetMm).toBeNull();
  });

  it("leaves boxes off the belt alone", () => {
    const box = makeBox({ id: "t", x: tray.x, y: tray.y, z: tray.topZ + 12.5 });
    const res = stepConveyor(conveyor, { ...defaultConveyorRuntime(), speedMmS: 50 }, [box], 1000);
    expect(res.boxes[0].x).toBe(tray.x);
  });

  it("presets build valid scenes", () => {
    expect(buildPreset("CONVEYOR").boxes.every((b) => isOnConveyor(conveyor, b))).toBe(true);
    expect(buildPreset("PICK_PLACE").boxes).toHaveLength(3);
  });
});

describe("protocol: conveyor and tool commands", () => {
  const opts = { currentJoints: [0, 0, 0, 0, 0, 0] };
  it("parses WLKATA 7th-axis D moves", () => {
    expect(parseIncomingHardwareLine("@01G90G00D100", opts)).toMatchObject({ kind: "CONVEYOR_MOVE", distanceMm: 100, absolute: true });
    expect(parseIncomingHardwareLine("@01G91G01D-20", opts)).toMatchObject({ kind: "CONVEYOR_MOVE", distanceMm: -20, absolute: false });
  });
  it("parses MS4220 G6 F speed", () => {
    expect(parseIncomingHardwareLine("@01G6 F-100", opts)).toMatchObject({ kind: "CONVEYOR_SPEED", percent: -100 });
    expect(parseIncomingHardwareLine("@01G6 F250", opts)).toMatchObject({ kind: "CONVEYOR_SPEED", percent: 100 });
  });
  it("interprets M3 by mounted tool", () => {
    expect(parseIncomingHardwareLine("@01M3 S1000", { ...opts, toolType: "MICRO_SERVO" })).toMatchObject({ kind: "GRIPPER", state: "OPEN" });
    expect(parseIncomingHardwareLine("@01M3 S1000", { ...opts, toolType: "SUCTION" })).toMatchObject({ kind: "GRIPPER", state: "CLOSE" });
    expect(parseIncomingHardwareLine("@01M3 S40", { ...opts, toolType: "MICRO_SERVO" })).toMatchObject({ kind: "GRIPPER", state: "CLOSE" });
  });
});

describe("box contact: stacking, toppling, collisions", () => {
  const S = 25;
  const onTray = (id: string, x: number, y: number) => makeBox({ id, x, y, z: tray.topZ + S / 2 });
  const heldAt = (id: string, x: number, y: number, z: number) => ({ ...makeBox({ id, x, y, z }), held: true });

  it("a box released right on top of another stacks instead of overlapping", () => {
    const { boxes, events } = releaseBoxesDetailed([onTray("a", 200, 110), heldAt("b", 200, 110, 90)], DEFAULT_PLATFORMS, conveyor);
    expect(boxes[1].z).toBeCloseTo(tray.topZ + S + S / 2, 6);
    expect(events[0]).toEqual({ boxId: "b", restsOn: "a" });
  });

  it("a partly overlapping box still lands on top while its centre is supported (no interpenetration)", () => {
    // 10 mm offset: the old centre-point check dropped it onto the tray, inside box a
    const { boxes } = releaseBoxesDetailed([onTray("a", 200, 110), heldAt("b", 200, 120, 90)], DEFAULT_PLATFORMS, conveyor);
    expect(boxes[1].z).toBeCloseTo(tray.topZ + S + S / 2, 6);
    expect(boxes[1].y).toBe(120);
  });

  it("a box hanging over the edge topples off, turns 90° and rests beside", () => {
    // centre 15 mm off: beyond a's half-width (12.5) -> unstable
    const { boxes, events } = releaseBoxesDetailed([onTray("a", 200, 110), heldAt("b", 200, 125, 90)], DEFAULT_PLATFORMS, conveyor);
    const b = boxes[1];
    expect(events[0]).toEqual({ boxId: "b", toppledOff: "a", restsOn: "Tray" });
    expect(b.z).toBeCloseTo(tray.topZ + S / 2, 6);
    expect(b.y - boxes[0].y).toBeGreaterThanOrEqual(S); // no overlap with a
    const tilt = new Quaternion(...b.q).angleTo(new Quaternion());
    expect(tilt).toBeCloseTo(Math.PI / 2, 4);
  });

  it("detects a carried box pushed into another box, but not resting contact or side-by-side", () => {
    const a = onTray("a", 200, 110);
    expect(findHeldCollision([a, heldAt("b", 200, 110, tray.topZ + S + S / 2 - 5)], DEFAULT_PLATFORMS, conveyor)).toBe("b hit a");
    expect(findHeldCollision([a, heldAt("b", 200, 110, tray.topZ + S + S / 2)], DEFAULT_PLATFORMS, conveyor)).toBeNull();
    expect(findHeldCollision([a, heldAt("b", 200 + S, 110, tray.topZ + S / 2)], DEFAULT_PLATFORMS, conveyor)).toBeNull();
    expect(findHeldCollision([heldAt("b", 200, 110, tray.topZ + S / 2 - 6)], DEFAULT_PLATFORMS, conveyor)).toBe("b hit Tray");
  });
});
