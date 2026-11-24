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

import {
  autoFeedSpeedMmS,
  DEFAULT_SENSOR,
  isSensorBlocked,
  stepConveyor,
  defaultConveyorRuntime,
} from "@/lib/sim/workcell";
import { formatSensorLine, parseIncomingHardwareLine } from "@/lib/hardware/protocol";

describe("light sensor", () => {
  const atStop = makeBox({ id: "a", x: min + 12.5, y: cross, z: conveyor.topZ + 12.5 });
  const far = makeBox({ id: "b", x: min + 120, y: cross, z: conveyor.topZ + 12.5 });

  it("detects a box at the end stop, ignores boxes upstream and lifted boxes", () => {
    expect(isSensorBlocked(conveyor, DEFAULT_SENSOR, [atStop])).toBe(true);
    expect(isSensorBlocked(conveyor, DEFAULT_SENSOR, [far])).toBe(false);
    expect(isSensorBlocked(conveyor, DEFAULT_SENSOR, [{ ...atStop, held: true }])).toBe(false);
    expect(isSensorBlocked(conveyor, DEFAULT_SENSOR, [{ ...atStop, z: atStop.z + 30 }])).toBe(false);
  });

  it("auto feed runs while clear and stops when blocked", () => {
    const auto = { enabled: true, speedPercent: 60 };
    expect(autoFeedSpeedMmS(auto, false)).toBeCloseTo(-30, 6);
    expect(autoFeedSpeedMmS(auto, true)).toBe(0);
    expect(autoFeedSpeedMmS({ ...auto, enabled: false }, false)).toBe(0);
  });

  it("a fed box breaks the beam close to the end stop", () => {
    let boxes = [far];
    let rt = defaultConveyorRuntime();
    const auto = { enabled: true, speedPercent: 60 };
    for (let i = 0; i < 400; i++) {
      rt = { ...rt, speedMmS: autoFeedSpeedMmS(auto, isSensorBlocked(conveyor, DEFAULT_SENSOR, boxes)) };
      const res = stepConveyor(conveyor, rt, boxes, 16);
      rt = res.runtime;
      boxes = res.boxes;
    }
    expect(isSensorBlocked(conveyor, DEFAULT_SENSOR, boxes)).toBe(true);
    expect(boxes[0].x - (min + 12.5)).toBeLessThan(3);
  });

  it("RS-485: SENSOR? query, AUTO command and reply format", () => {
    const opts = { currentJoints: [0, 0, 0, 0, 0, 0] };
    expect(parseIncomingHardwareLine("@01SENSOR?", opts).kind).toBe("SENSOR_QUERY");
    expect(parseIncomingHardwareLine("@01AUTO=1,60", opts)).toMatchObject({ kind: "AUTO_FEED", enabled: true, speedPercent: 60 });
    expect(parseIncomingHardwareLine("@01AUTO=0", opts)).toMatchObject({ kind: "AUTO_FEED", enabled: false });
    expect(parseIncomingHardwareLine("@01?", opts).kind).toBe("STATUS_QUERY");
    expect(formatSensorLine(true)).toBe("SENSOR=1");
  });
});
