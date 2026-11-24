import { describe, expect, it } from "vitest";
import {
  applyConveyorLayout,
  applyPlatformLayout,
  conveyorExtent,
  conveyorPickPoint,
  DEFAULT_CONVEYOR,
  DEFAULT_PLATFORMS,
  isOnConveyor,
  makeBox,
  reachStatus,
  settleBoxes,
} from "@/lib/sim/workcell";

const conveyor = DEFAULT_CONVEYOR;
const tray = DEFAULT_PLATFORMS[0];
const { min, cross } = conveyorExtent(conveyor);
const beltBox = makeBox({ id: "c", x: min + 50, y: cross, z: conveyor.topZ + 12.5 });
const trayBox = makeBox({ id: "t", x: tray.x + 10, y: tray.y, z: tray.topZ + 12.5 });
const stacked = makeBox({ id: "s", x: tray.x + 10, y: tray.y, z: tray.topZ + 37.5 });
const floorBox = makeBox({ id: "f", x: 0, y: 200 });

describe("workcell layout editing", () => {
  it("moving the conveyor carries its boxes and leaves others alone", () => {
    const res = applyConveyorLayout(conveyor, [beltBox, trayBox], { x: 200, y: -180, topZ: 80 });
    expect(res.conveyor).toMatchObject({ x: 200, y: -180, topZ: 80 });
    const moved = res.boxes[0];
    expect(moved.x).toBeCloseTo(conveyorExtent(res.conveyor).min + 50, 6);
    expect(moved.y).toBeCloseTo(-180, 6);
    expect(moved.z).toBeCloseTo(80 + 12.5, 6);
    expect(isOnConveyor(res.conveyor, moved)).toBe(true);
    expect(res.boxes[1]).toBe(trayBox);
  });

  it("rotating the conveyor to the Y axis keeps boxes on the belt", () => {
    const res = applyConveyorLayout(conveyor, [beltBox], { axis: "y", x: 200, y: 0 });
    expect(isOnConveyor(res.conveyor, res.boxes[0])).toBe(true);
    expect(res.boxes[0].x).toBeCloseTo(200, 6);
  });

  it("clamps silly values", () => {
    const res = applyConveyorLayout(conveyor, [], { lengthMm: 5, topZ: -50, x: 9999 });
    expect(res.conveyor.lengthMm).toBe(100);
    expect(res.conveyor.topZ).toBe(20);
    expect(res.conveyor.x).toBe(400);
  });

  it("moving a tray carries boxes and stacks on it", () => {
    const res = applyPlatformLayout(tray, [trayBox, stacked, floorBox], { x: 150, y: 150, topZ: 40 });
    expect(res.boxes[0]).toMatchObject({ x: 160, y: 150, z: 40 + 12.5 });
    expect(res.boxes[1]).toMatchObject({ x: 160, y: 150, z: 40 + 37.5 });
    expect(res.boxes[2]).toBe(floorBox);
  });

  it("settles boxes onto the floor when their tray is removed", () => {
    const out = settleBoxes([stacked, trayBox], [], conveyor);
    expect(out.find((b) => b.id === "t")!.z).toBeCloseTo(12.5, 6);
    expect(out.find((b) => b.id === "s")!.z).toBeCloseTo(37.5, 6);
  });

  it("reports reach of the default stations", () => {
    const pick = conveyorPickPoint(conveyor);
    expect(reachStatus(pick.x, pick.y)).toBe("OK");
    expect(reachStatus(tray.x, tray.y)).toBe("OK");
    expect(reachStatus(400, 0)).toBe("TOO_FAR");
    expect(reachStatus(20, 20)).toBe("TOO_CLOSE");
  });
});
