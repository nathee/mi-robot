import { beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_GCODE_PROGRAMS } from "@/lib/program/gcodeCompiler";
import { SAMPLE_SCRIPTS } from "@/lib/program/scriptCompiler";
import { DEFAULT_PLATFORMS } from "@/lib/sim/workcell";
import { useCodeStore } from "@/stores/useCodeStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useViewerStore } from "@/stores/useViewerStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";

const tray = DEFAULT_PLATFORMS[0];
const onTray = (b: { x: number; y: number; held: boolean }) =>
  !b.held && Math.abs(b.x - tray.x) <= tray.sizeX / 2 && Math.abs(b.y - tray.y) <= tray.sizeY / 2;

function runRealtime(maxFrames = 6000, dtMs = 16) {
  let lastCollision: string | null = null;
  for (let f = 0; f < maxFrames; f++) {
    const code = useCodeStore.getState();
    if (code.status === "RUNNING") {
      code.advanceCodeFrame(dtMs);
    }
    useWorkcellStore.getState().step(dtMs);
    const collision = useWorkcellStore.getState().collision;
    if (collision && collision !== lastCollision) {
      useCodeStore.getState().haltOnCollision(collision);
    }
    lastCollision = collision;

    const st = useCodeStore.getState().status;
    if (st === "COMPLETED" || st === "ERROR" || st === "IDLE") {
      return { status: st, frames: f, collision };
    }
  }
  return { status: useCodeStore.getState().status, frames: maxFrames, collision: lastCollision };
}

describe("suction cup grasping, tool collisions & realtime workflows", () => {
  beforeEach(() => {
    useSerialStore.getState().clear();
    useCodeStore.getState().stop();
    useViewerStore.getState().setField("ikSolver", "CONSTRAINED");
    useRobotStore.getState().setToolType("SUCTION", { log: false });
    useRobotStore.getState().setHome();
    useRobotStore.getState().setGripper("OPEN", 0, { log: false });
  });

  it("picks up a box at its top face without piercing into it", () => {
    for (const targetZ of [45, 48, 43]) {
      useWorkcellStore.getState().loadPreset("PICK_PLACE");
      useRobotStore.getState().setHome();
      useRobotStore.getState().setGripper("OPEN", 0, { log: false });

      useRobotStore.getState().setIkTarget({ x: 200, y: 110, z: targetZ, rx: 0, ry: 0, rz: 0 });
      expect(useRobotStore.getState().applyIk()).toBe(true);
      useRobotStore.getState().setGripper("CLOSE", 1000, { log: false });
      useWorkcellStore.getState().step(16);

      const held = useWorkcellStore.getState().boxes.find((b) => b.held);
      expect(held?.id, `targetZ=${targetZ}`).toBe("box-2");
      expect(useWorkcellStore.getState().collision, `targetZ=${targetZ}`).toBeNull();
    }
  });

  it("detects collision and refuses grasping when suction cup pierces into a box or conveyor", () => {
    useWorkcellStore.getState().loadPreset("PICK_PLACE");
    // Box-2 top is at Z=45; Z=36 is 9 mm inside the box
    useRobotStore.getState().setIkTarget({ x: 200, y: 110, z: 36, rx: 0, ry: 0, rz: 0 });
    expect(useRobotStore.getState().applyIk()).toBe(true);
    useWorkcellStore.getState().step(16);
    expect(useWorkcellStore.getState().collision).toBe("Suction Cup hit box-2");

    useRobotStore.getState().setGripper("CLOSE", 1000, { log: false });
    expect(useWorkcellStore.getState().boxes.some((b) => b.held)).toBe(false);

    // Piercing into the conveyor belt (topZ=60) with empty conveyor
    useWorkcellStore.getState().clearBoxes();
    useRobotStore.getState().setHome();
    useRobotStore.getState().setGripper("OPEN", 0, { log: false });
    useRobotStore.getState().setIkTarget({ x: 180, y: -150, z: 50, rx: 0, ry: 0, rz: 0 });
    expect(useRobotStore.getState().applyIk()).toBe(true);
    useWorkcellStore.getState().step(16);
    expect(useWorkcellStore.getState().collision).toBe("Suction Cup hit Conveyor");
  });

  it("auto-sucks only on real surface contact (not 10 mm in mid-air)", () => {
    useWorkcellStore.getState().loadPreset("PICK_PLACE");
    useRobotStore.getState().setGripper("CLOSE", 1000, { log: false });

    // Hover 10 mm above box-2 top (Z=55): must NOT grab prematurely in mid-air
    useRobotStore.getState().setIkTarget({ x: 200, y: 110, z: 55, rx: 0, ry: 0, rz: 0 });
    expect(useRobotStore.getState().applyIk()).toBe(true);
    useWorkcellStore.getState().step(16);
    expect(useWorkcellStore.getState().boxes.some((b) => b.held)).toBe(false);

    // Touch box-2 top (Z=46): vacuum grabs immediately on contact
    useRobotStore.getState().setIkTarget({ x: 200, y: 110, z: 46, rx: 0, ry: 0, rz: 0 });
    expect(useRobotStore.getState().applyIk()).toBe(true);
    useWorkcellStore.getState().step(16);
    expect(useWorkcellStore.getState().boxes.find((b) => b.held)?.id).toBe("box-2");
    expect(useWorkcellStore.getState().collision).toBeNull();
  });

  it("retries grasping when Grab/Suck is clicked again while already CLOSE", () => {
    useRobotStore.getState().setToolType("TWO_FINGER", { log: false });
    useWorkcellStore.getState().loadPreset("PICK_PLACE");

    useRobotStore.getState().setGripper("CLOSE", 1000, { log: false });
    expect(useWorkcellStore.getState().boxes.some((b) => b.held)).toBe(false);

    useRobotStore.getState().setIkTarget({ x: 200, y: 110, z: 38, rx: 0, ry: 0, rz: 0 });
    expect(useRobotStore.getState().applyIk()).toBe(true);
    useRobotStore.getState().setGripper("CLOSE", 1000, { log: false });

    expect(useWorkcellStore.getState().boxes.find((b) => b.held)?.id).toBe("box-2");
  });

  it("runs SAMPLE_SCRIPTS.sensorFeed (Suction) in realtime with zero collisions", () => {
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    useCodeStore.getState().setMode("SCRIPT");
    useCodeStore.getState().setScriptText(SAMPLE_SCRIPTS.sensorFeed.code);
    useCodeStore.getState().runOrPause();
    const res = runRealtime(4000, 32);
    expect(res.status).toBe("COMPLETED");
    expect(res.collision).toBeNull();
    expect(useWorkcellStore.getState().boxes.every(onTray)).toBe(true);
  });

  it("runs SAMPLE_SCRIPTS.twoFingerConveyor in realtime with zero collisions", () => {
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    useCodeStore.getState().setMode("SCRIPT");
    useCodeStore.getState().setScriptText(SAMPLE_SCRIPTS.twoFingerConveyor.code);
    useCodeStore.getState().runOrPause();
    const res = runRealtime(4000, 32);
    expect(res.status).toBe("COMPLETED");
    expect(res.collision).toBeNull();
    expect(useWorkcellStore.getState().boxes.every(onTray)).toBe(true);
  });

  it("runs SAMPLE_GCODE_PROGRAMS.conveyorSuction in realtime with zero collisions", () => {
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    useRobotStore.getState().setToolType("SUCTION", { log: false });
    useRobotStore.getState().setHome();
    useCodeStore.getState().setMode("GCODE");
    useCodeStore.getState().setGcodeText(SAMPLE_GCODE_PROGRAMS.conveyorSuction.code);
    useCodeStore.getState().runOrPause();
    const res = runRealtime(4000, 32);
    expect(res.status).toBe("COMPLETED");
    expect(res.collision).toBeNull();
    expect(useWorkcellStore.getState().boxes.filter(onTray)).toHaveLength(1);
  });
});
