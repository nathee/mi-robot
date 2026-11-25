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
  findFreeBeltSpot,
  pushBoxes,
  settleUnsupported,
  toolPusher,
  heldBoxPushers,
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

  it("a box released inside an existing stack is pushed up onto it, never into the same place", () => {
    // Sorting-station case: the arm lowers to the tray slot (box bottom 2 mm above the tray)
    // although a 3-high stack already stands there. The box must end on top of the stack.
    const a = onTray("a", 160, 130);
    const b = makeBox({ id: "b", x: 160, y: 130, z: tray.topZ + S + S / 2 });
    const c = makeBox({ id: "c", x: 160, y: 130, z: tray.topZ + 2 * S + S / 2 });
    const { boxes, events } = releaseBoxesDetailed(
      [a, b, c, heldAt("d", 160, 130, tray.topZ + 2 + S / 2)],
      DEFAULT_PLATFORMS,
      conveyor
    );
    expect(boxes[3].z).toBeCloseTo(tray.topZ + 3 * S + S / 2, 6);
    expect(events[0]).toEqual({ boxId: "d", restsOn: "c" });
  });

  it("a box released half inside a lower box ends on top of it", () => {
    const a = onTray("a", 200, 110);
    const { boxes } = releaseBoxesDetailed([a, heldAt("b", 200, 110, tray.topZ + S)], DEFAULT_PLATFORMS, conveyor);
    expect(boxes[1].z).toBeCloseTo(tray.topZ + S + S / 2, 6);
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

describe("gravity, feeding and pushing", () => {
  const S = 25;
  const onTray = (id: string, x: number, y: number) => makeBox({ id, x, y, z: tray.topZ + S / 2 });
  const belt = (id: string, a: number, z = conveyor.topZ + S / 2) =>
    makeBox({ id, x: a, y: conveyor.y, z });

  it("a floating box (its support carried away) drops onto the belt", () => {
    // the saved-state bug: box-5 hovering one box above the belt with a tower on it
    const boxes = [belt("b5", 345.5, conveyor.topZ + S + S / 2), belt("b6", 345.5, conveyor.topZ + 2 * S + S / 2)];
    const { boxes: out } = settleUnsupported(boxes, DEFAULT_PLATFORMS, conveyor);
    expect(out[0].z).toBeCloseTo(conveyor.topZ + S / 2, 6);
    expect(out[1].z).toBeCloseTo(conveyor.topZ + S + S / 2, 6);
  });

  it("boxes stacked on a belt box ride along with it", () => {
    const { max } = conveyorExtent(conveyor);
    const base = belt("a", max - 40);
    const top = belt("b", max - 40, conveyor.topZ + S + S / 2);
    const res = stepConveyor(conveyor, { ...defaultConveyorRuntime(), speedMmS: -50 }, [base, top], 200);
    expect(res.boxes[0].x).toBeCloseTo(max - 50, 6);
    expect(res.boxes[1].x).toBeCloseTo(max - 50, 6);
  });

  it("a new conveyor box never stacks on one waiting at the feed point", () => {
    const first = findFreeBeltSpot(conveyor, [])!;
    const second = findFreeBeltSpot(conveyor, [belt("a", first.x)])!;
    expect(second.z).toBeCloseTo(conveyor.topZ + S / 2, 6);
    expect(Math.abs(second.x - first.x)).toBeGreaterThanOrEqual(S - 0.5);
    const full = Array.from({ length: 10 }, (_, i) => belt(`f${i}`, conveyorExtent(conveyor).min + S / 2 + i * S));
    expect(findFreeBeltSpot(conveyor, full)).toBeNull();
  });

  it("the tool tip moving into a box from the side shoves it instead of passing through", () => {
    const a = onTray("a", 200, 110);
    const tip = toolPusher(tcp(200 - 12.5 - 4 + 3, 110, tray.topZ + 5), TOOL_DEFS.SUCTION)!; // 3 mm into its -X face
    const { boxes, pushed } = pushBoxes([a], [tip], DEFAULT_PLATFORMS, conveyor);
    expect(pushed).toEqual(["a"]);
    expect(boxes[0].x).toBeCloseTo(203.05, 2);
    expect(boxes[0].z).toBeCloseTo(a.z, 6);
  });

  it("a carried box shoves a row of boxes and the last one falls off the tray", () => {
    // tray spans y 65..155. Row along +Y ends near the edge.
    const row = [onTray("a", 200, 100), onTray("b", 200, 125), onTray("c", 200, 150 - 0.1)];
    const held = { ...makeBox({ id: "h", x: 200, y: 100 - 25 + 15, z: tray.topZ + S / 2 + 1 }), held: true };
    const { boxes } = pushBoxes([...row, held], heldBoxPushers([held]), DEFAULT_PLATFORMS, conveyor);
    const [a, b, c] = boxes;
    expect(a.y - (held.y + S)).toBeGreaterThanOrEqual(-0.1); // no overlap left
    expect(b.y - a.y).toBeGreaterThanOrEqual(S - 0.1);
    expect(c.y).toBeGreaterThan(155); // centre beyond the tray edge -> toppled to the floor
    expect(c.z).toBeCloseTo(S / 2, 6);
  });

  it("pressing down on top of a box does not push it sideways", () => {
    const a = onTray("a", 200, 110);
    const held = { ...makeBox({ id: "h", x: 205, y: 110, z: a.z + S - 2 }), held: true };
    const { pushed } = pushBoxes([a, held], heldBoxPushers([held]), DEFAULT_PLATFORMS, conveyor);
    expect(pushed).toEqual([]);
  });

  it("a gripper descending around a box does not push it", () => {
    const a = onTray("a", 200, 110);
    const tip = toolPusher(tcp(200, 110, a.z + 2), TOOL_DEFS.TWO_FINGER)!;
    expect(pushBoxes([a], [tip], DEFAULT_PLATFORMS, conveyor).pushed).toEqual([]);
  });

  it("a thin tool tip moving several mm per frame pushes the box the way it moves", () => {
    const a = onTray("a", 200, 110);
    // tip fully inside the box's X range, 8 mm into its -Y face, moving +Y
    const tip = { ...toolPusher(tcp(200 + 6, 110 - 12.5 - 2 + 8, tray.topZ + 5), TOOL_DEFS.TWO_FINGER)!, vx: 0, vy: 8 };
    const { boxes } = pushBoxes([a], [tip], DEFAULT_PLATFORMS, conveyor);
    expect(boxes[0].x).toBeCloseTo(200, 6);
    expect(boxes[0].y).toBeCloseTo(tip.cy + 2 + 12.5 + 0.05, 6);
  });

  it("lifting a gripped box with a little sideways jitter doesn't shove its touching neighbour across", () => {
    // queued box touching the held one along X (0.2 mm overlap), lift with 0.01 mm Y jitter
    const held = { ...belt("h", 132.5, conveyor.topZ + S / 2 + 1), held: true };
    const next = belt("n", 132.5 + S - 0.2);
    const pushers = heldBoxPushers([held]).map((p) => ({ ...p, vx: 0, vy: 0.01 }));
    const { boxes } = pushBoxes([held, next], pushers, DEFAULT_PLATFORMS, conveyor);
    expect(boxes[1].y).toBeCloseTo(next.y, 6);
    expect(boxes[1].x).toBeCloseTo(132.5 + S + 0.05, 6); // only nudged back out of the overlap
  });

  it("never leaves a pushed box inside the pusher (no push/topple loop)", () => {
    // box on the tray edge, held box sweeping in along +Y; whatever happens, no overlap remains
    const a = onTray("a", 200, 150);
    const held = { ...makeBox({ id: "h", x: 200, y: 150 - S + 4, z: a.z + 6 }), held: true };
    const pushers = heldBoxPushers([held]).map((p) => ({ ...p, vx: 0, vy: 4 }));
    for (let i = 0; i < 3; i++) {
      const { boxes } = pushBoxes([a, held], pushers, DEFAULT_PLATFORMS, conveyor);
      const b = boxes[0];
      const inside =
        Math.abs(b.x - held.x) < S - 0.5 && Math.abs(b.y - held.y) < S - 0.5 && Math.abs(b.z - held.z) < S - 0.5;
      expect(inside && (b.x !== a.x || b.y !== a.y || b.z !== a.z)).toBe(false);
    }
  });

  it("boxes at the end stop can't be pushed over it off the belt", () => {
    const { min } = conveyorExtent(conveyor);
    const a = belt("a", min + S / 2);
    const top = belt("t", min + S / 2, conveyor.topZ + S + S / 2);
    const held = { ...makeBox({ id: "h", x: min + S / 2 + S - 3, y: conveyor.y, z: a.z }), held: true };
    const pushers = heldBoxPushers([held]).map((p) => ({ ...p, vx: -3, vy: 0 }));
    const { boxes } = pushBoxes([a, top, held], pushers, DEFAULT_PLATFORMS, conveyor);
    expect(boxes[0].x).toBeCloseTo(a.x, 6);
    expect(boxes[1].x).toBeCloseTo(top.x, 6);
  });

  it("a box on the floor can't be pushed into the tray body", () => {
    const a = makeBox({ id: "a", x: 200, y: 65 - S / 2 - 0.2, z: S / 2 });
    const tip = toolPusher(tcp(200, a.y - S / 2 - 2, 5), TOOL_DEFS.SUCTION)!;
    const { boxes } = pushBoxes([a], [tip], DEFAULT_PLATFORMS, conveyor);
    expect(boxes[0].y).toBeCloseTo(a.y, 6);
  });
});
