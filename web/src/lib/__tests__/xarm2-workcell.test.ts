import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { JOINT_LIMITS } from "../kinematics/constants";
import { setActiveToolOffsetMm, tcpMatrixFromJointsDeg } from "../kinematics/fk";
import { setActiveRobotModel } from "../robots";
import { TOOL_DEFS } from "../tools/toolDefs";
import {
  buildPreset,
  conveyorPickPoint,
  DEFAULT_CONVEYOR,
  DEFAULT_PLATFORMS,
  defaultConveyor,
  defaultPlatforms,
  findGraspTarget,
  makeBox,
  reachStatus,
  type WorkBox,
} from "../sim/workcell";

/**
 * True when some joint set with the gripper pointing straight down (J2 + J3 + J4 = 180° on the
 * xArm) puts the TCP inside the grasp window of `box`.
 */
function graspableGripperDown(box: WorkBox): boolean {
  const j1 = (Math.atan2(box.y, box.x) * 180) / Math.PI;
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  for (let j2 = JOINT_LIMITS[1].min; j2 <= JOINT_LIMITS[1].max; j2 += 0.5) {
    for (let j3 = JOINT_LIMITS[2].min; j3 <= JOINT_LIMITS[2].max; j3 += 0.5) {
      const j4 = 180 - j2 - j3;
      if (j4 < JOINT_LIMITS[3].min || j4 > JOINT_LIMITS[3].max) continue;
      tcpMatrixFromJointsDeg([j1, j2, j3, j4, 0, 0]).decompose(p, q, s);
      const tcp = { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000, quaternion: q.clone() };
      if ("box" in findGraspTarget([box], tcp, TOOL_DEFS.XARM_GRIPPER)) return true;
    }
  }
  return false;
}

describe("xArm 2.0 workcell layout", () => {
  beforeEach(() => {
    setActiveRobotModel("xarm2");
    setActiveToolOffsetMm(TOOL_DEFS.XARM_GRIPPER.tcpOffsetMm);
  });
  afterEach(() => {
    setActiveRobotModel("mirobot");
    setActiveToolOffsetMm(TOOL_DEFS.TWO_FINGER.tcpOffsetMm);
  });

  it("the gripper-down check really points the gripper down", () => {
    const q = new Quaternion();
    tcpMatrixFromJointsDeg([0, 40, 70, 70, 0, 0]).decompose(new Vector3(), q, new Vector3());
    const approach = new Vector3(0, 0, 1).applyQuaternion(q);
    expect(Math.abs(Math.abs(approach.z) - 1)).toBeLessThan(1e-6);
  });

  it("every Pick & Place box can be grabbed with the gripper pointing down", () => {
    for (const box of buildPreset("PICK_PLACE").boxes) {
      expect(graspableGripperDown(box), box.id).toBe(true);
    }
  });

  it("the conveyor pick point can be grabbed with the gripper pointing down", () => {
    const { conveyor } = buildPreset("CONVEYOR");
    const pick = conveyorPickPoint(conveyor);
    expect(graspableGripperDown(makeBox({ id: "pick", x: pick.x, y: pick.y, z: pick.z }))).toBe(true);
  });

  it("the reach badge reflects the xArm's shorter arm", () => {
    const tray = defaultPlatforms()[0];
    expect(reachStatus(tray.x, tray.y)).toBe("OK");
    const pick = conveyorPickPoint(defaultConveyor());
    expect(reachStatus(pick.x, pick.y)).toBe("OK");
    // The Mirobot tray position is out of the xArm's gripper-down reach
    expect(reachStatus(DEFAULT_PLATFORMS[0].x, DEFAULT_PLATFORMS[0].y)).toBe("TOO_FAR");
  });

  it("leaves the Mirobot layout unchanged", () => {
    setActiveRobotModel("mirobot");
    expect(defaultConveyor()).toEqual(DEFAULT_CONVEYOR);
    expect(defaultPlatforms()).toEqual(DEFAULT_PLATFORMS);
    expect(reachStatus(DEFAULT_PLATFORMS[0].x, DEFAULT_PLATFORMS[0].y)).toBe("OK");
  });
});
