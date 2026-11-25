import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOME_JOINTS, JOINT_LIMITS, MDH_PARAMS } from "../kinematics/constants";
import {
  clampJointsToLimits,
  fkPose6DFromJointsDeg,
  pose6DToTargetMatrix,
  setActiveToolOffsetMm,
} from "../kinematics/fk";
import { isIkResultAcceptable, solveIK_Planar5Once, solveIKPoseCandidate } from "../kinematics/ik";
import { setActiveRobotModel, XARM2_DIMENSIONS_MM, XARM2_PROFILE } from "../robots";
import { TOOL_DEFS } from "../tools/toolDefs";

const TOOL_MM = TOOL_DEFS.XARM_GRIPPER.tcpOffsetMm;

describe("Hiwonder xArm 2.0 kinematics", () => {
  beforeEach(() => {
    setActiveRobotModel("xarm2");
    setActiveToolOffsetMm(TOOL_MM);
  });
  afterEach(() => {
    setActiveRobotModel("mirobot");
    setActiveToolOffsetMm(TOOL_DEFS.TWO_FINGER.tcpOffsetMm);
  });

  it("live constants follow the active profile", () => {
    expect(MDH_PARAMS).toBe(XARM2_PROFILE.mdhParams);
    expect(JOINT_LIMITS[5]).toEqual({ min: 0, max: 0 });
    setActiveRobotModel("mirobot");
    expect(MDH_PARAMS[0].d).toBe(127);
    setActiveRobotModel("xarm2");
  });

  it("home pose points straight up with the gripper facing up", () => {
    const { D1, L2, L3, DF } = XARM2_DIMENSIONS_MM;
    const pose = fkPose6DFromJointsDeg(HOME_JOINTS);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.z).toBeCloseTo(D1 + L2 + L3 + DF + TOOL_MM, 6);
  });

  it("positive J2 leans the arm outwards along the base heading", () => {
    const pose = fkPose6DFromJointsDeg([30, 20, 0, 0, 0, 0]);
    const heading = (Math.atan2(pose.y, pose.x) * 180) / Math.PI;
    expect(heading).toBeCloseTo(30, 4);
  });

  it("clamps the non-existent J6 to 0", () => {
    expect(clampJointsToLimits([0, 0, 0, 0, 0, 45])[5]).toBe(0);
  });

  const configs: number[][] = [
    [0, 30, 40, 50, 0, 0],
    [25, 15, 60, 30, -40, 0],
    [-60, 45, 30, 80, 70, 0],
    [100, -20, 90, 40, 10, 0],
    [-15, 60, -30, 60, -90, 0],
  ];

  it("analytic planar IK round-trips reachable poses exactly", () => {
    for (const q of configs) {
      const target = pose6DToTargetMatrix(fkPose6DFromJointsDeg(q));
      const best = [1, -1]
        .flatMap((elbow) => [0, 1].map((flip) => solveIK_Planar5Once(target, elbow, flip as 0 | 1)))
        .filter((s): s is number[] => Boolean(s))
        .map((s) => fkPose6DFromJointsDeg(s))
        .map((p) => {
          const t = fkPose6DFromJointsDeg(q);
          return Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
        });
      expect(Math.min(...best)).toBeLessThan(0.01);
    }
  });

  it.each(["ANALYTIC", "CONSTRAINED"] as const)("%s solver round-trips position and orientation", (solver) => {
    for (const q of configs) {
      const target = pose6DToTargetMatrix(fkPose6DFromJointsDeg(q));
      const res = solveIKPoseCandidate(HOME_JOINTS, target, solver);
      expect(res).not.toBeNull();
      expect(res!.err.posMm).toBeLessThan(0.6);
      expect(res!.err.rotDeg).toBeLessThan(0.6);
      expect(res!.q[5]).toBe(0);
    }
  });

  it("an unreachable orientation still solves the position (best-effort orientation)", () => {
    const pose = fkPose6DFromJointsDeg([0, 30, 40, 50, 0, 0]);
    // Sideways tilt the 5-DOF wrist cannot produce
    const target = pose6DToTargetMatrix({ ...pose, rx: pose.rx + 25 });
    const res = solveIKPoseCandidate(HOME_JOINTS, target, "CONSTRAINED");
    expect(res).not.toBeNull();
    expect(res!.err.posMm).toBeLessThan(1);
    expect(isIkResultAcceptable(res!.err)).toBe(true);
  });

  it("rejects targets beyond reach", () => {
    const target = pose6DToTargetMatrix({ x: 600, y: 0, z: 100, rx: 0, ry: 90, rz: 0 });
    const res = solveIKPoseCandidate(HOME_JOINTS, target, "CONSTRAINED");
    expect(isIkResultAcceptable(res?.err)).toBe(false);
  });
});

describe("6-DOF acceptance is unchanged", () => {
  it("still rejects large rotation errors on the Mirobot", () => {
    setActiveRobotModel("mirobot");
    expect(isIkResultAcceptable({ posMm: 0.1, rotDeg: 30 })).toBe(false);
    expect(isIkResultAcceptable({ posMm: 0.1, rotDeg: 3 })).toBe(true);
  });
});
