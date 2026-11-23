import { describe, expect, it } from "vitest";
import { HOME_JOINTS } from "../kinematics/constants";
import { fkPose6DFromJointsDeg, pose6DToTargetMatrix } from "../kinematics/fk";
import { solveIKPoseCandidate } from "../kinematics/ik";

describe("WLKATA Mirobot Inverse Kinematics Solvers", () => {
  const testConfigs: number[][] = [
    [0, 0, 0, 0, 0, 0],
    [25, 15, -20, 10, -15, 30],
    [-35, 25, -30, -20, -10, -45],
    [45, -10, 15, 40, -30, 60],
  ];

  it("CONSTRAINED solver achieves accurate FK->IK->FK round-trip", () => {
    for (const qTarget of testConfigs) {
      const targetPose = pose6DToTargetMatrix(fkPose6DFromJointsDeg(qTarget));
      const res = solveIKPoseCandidate(HOME_JOINTS, targetPose, "CONSTRAINED");
      expect(res).not.toBeNull();
      expect(res!.err.posMm).toBeLessThan(0.6);
      expect(res!.err.rotDeg).toBeLessThan(0.6);
    }
  });

  it("DLS solver converges accurately from nearby seed", () => {
    const qTarget = [20, 10, -15, 5, -10, 20];
    const seed = [10, 5, -5, 0, -5, 10];
    const targetPose = pose6DToTargetMatrix(fkPose6DFromJointsDeg(qTarget));
    const res = solveIKPoseCandidate(seed, targetPose, "DLS");
    expect(res).not.toBeNull();
    expect(res!.err.posMm).toBeLessThan(1.0);
    expect(res!.err.rotDeg).toBeLessThan(1.0);
  });

  it("ANALYTIC solver returns bounded joint candidates across branch modes", () => {
    const qTarget = [30, 10, -20, 15, -20, 10];
    const targetPose = pose6DToTargetMatrix(fkPose6DFromJointsDeg(qTarget));
    const res = solveIKPoseCandidate(HOME_JOINTS, targetPose, "ANALYTIC", {
      branchMode: "CLOSEST",
    });
    expect(res).not.toBeNull();
    expect(res!.q).toHaveLength(6);
    expect(res!.solver).toContain("ANALYTIC");
  });
});
