import { beforeEach, describe, expect, it } from "vitest";
import { pose6DToTargetMatrix } from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import { compileGcodeProgram, SAMPLE_GCODE_PROGRAMS } from "@/lib/program/gcodeCompiler";
import { compileScriptProgram, SAMPLE_SCRIPTS } from "@/lib/program/scriptCompiler";
import type { ProgramStep } from "@/lib/program/types";
import { DEFAULT_PLATFORMS, isOnConveyor } from "@/lib/sim/workcell";
import { useRobotStore } from "@/stores/useRobotStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";

/** Executes compiled steps instantly against the real stores. */
function run(steps: readonly ProgramStep[]) {
  for (const step of steps) {
    const robot = useRobotStore.getState();
    const wc = useWorkcellStore.getState();
    switch (step.type) {
      case "HOME":
        robot.setHome();
        break;
      case "MOVE_JOINT":
        robot.setJoints(step.joints);
        break;
      case "MOVE_CARTESIAN": {
        const sol = solveIKPoseCandidate(robot.joints, pose6DToTargetMatrix(step.pose), "CONSTRAINED");
        expect(sol!.err.posMm, step.label).toBeLessThan(5); // same tolerance as the code runner
        robot.setJoints(sol!.q);
        break;
      }
      case "GRIPPER":
        robot.setGripper(step.state, step.pwm, { log: false });
        break;
      case "TOOL":
        robot.setToolType(step.tool, { log: false });
        break;
      case "CONVEYOR":
        if (step.mode === "SPEED") wc.setConveyorSpeedPercent(step.value);
        else wc.moveConveyor(step.value, Boolean(step.absolute), step.feed);
        for (let i = 0; i < 200; i++) useWorkcellStore.getState().step(50);
        break;
      case "WAIT":
        for (let i = 0; i < step.durationMs / 50; i++) useWorkcellStore.getState().step(50);
        break;
    }
    useWorkcellStore.getState().step(16);
  }
}

const tray = DEFAULT_PLATFORMS[0];
const onTray = (b: { x: number; y: number; held: boolean }) =>
  !b.held && Math.abs(b.x - tray.x) <= tray.sizeX / 2 && Math.abs(b.y - tray.y) <= tray.sizeY / 2;

describe("workcell end-to-end", () => {
  beforeEach(() => {
    useRobotStore.getState().setToolType("TWO_FINGER", { log: false });
    useRobotStore.getState().setHome();
    useRobotStore.getState().setGripper("OPEN", 0, { log: false });
  });

  it("conveyor sample script moves all 3 boxes onto the tray", () => {
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    const res = compileScriptProgram(SAMPLE_SCRIPTS.conveyorPick.code);
    expect(res.errors).toEqual([]);
    run(res.steps);
    const boxes = useWorkcellStore.getState().boxes;
    expect(boxes).toHaveLength(3);
    expect(boxes.every(onTray)).toBe(true);
    boxes.forEach((b) => expect(b.z).toBeCloseTo(tray.topZ + b.size / 2, 3));
  });

  it("soft gripper sample moves a tray box onto the conveyor", () => {
    useWorkcellStore.getState().loadPreset("PICK_PLACE");
    const res = compileScriptProgram(SAMPLE_SCRIPTS.softGripper.code);
    expect(res.errors).toEqual([]);
    run(res.steps);
    const { boxes, conveyor } = useWorkcellStore.getState();
    expect(boxes.filter((b) => isOnConveyor(conveyor, b))).toHaveLength(1);
  });

  it("G-code conveyor sample with the suction cup", () => {
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    useRobotStore.getState().setToolType("SUCTION", { log: false });
    const res = compileGcodeProgram(SAMPLE_GCODE_PROGRAMS.conveyorSuction.code, useRobotStore.getState().joints, {
      toolType: "SUCTION",
    });
    expect(res.errors).toEqual([]);
    run(res.steps);
    expect(useWorkcellStore.getState().boxes.filter(onTray)).toHaveLength(1);
  });

  it("micro servo cannot grab a box larger than its jaws", () => {
    useWorkcellStore.getState().loadPreset("PICK_PLACE");
    useWorkcellStore.setState((s) => ({ boxes: s.boxes.map((b) => ({ ...b, size: 40, z: tray.topZ + 20 })) }));
    useRobotStore.getState().setToolType("MICRO_SERVO", { log: false });
    run(compileScriptProgram(`moveL(200, 110, 65, 0, 0, 0)\ngrab()`).steps);
    expect(useWorkcellStore.getState().boxes.some((b) => b.held)).toBe(false);
    expect(useWorkcellStore.getState().lastGraspMessage).toMatch(/too large/i);
  });
});
