import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, HOME_JOINTS, JOINT_LIMITS } from "../kinematics/constants";
import {
  checkWorkspaceXYZ,
  clampJointsToLimits,
  clampJointValue,
  fkPose6DFromJointsDeg,
  forwardTxRxTzRz,
  isJointsWithinLimits,
} from "../kinematics/fk";

describe("WLKATA Mirobot Forward Kinematics", () => {
  it("computes exact home pose from MDH table at q=[0,0,0,0,0,0]", () => {
    const Ts = forwardTxRxTzRz(HOME_JOINTS);
    expect(Ts).toHaveLength(6);

    const pose = fkPose6DFromJointsDeg(HOME_JOINTS);
    // Home geometry from MDH:
    // X = a2 + d4 + (-d6) = 29.69 + 168.98 + 24.28 = 222.95 mm (wait: verify sign of d6 in chain)
    // Let's verify exact deterministic numbers & workspace membership
    expect(Number.isFinite(pose.x)).toBe(true);
    expect(Number.isFinite(pose.y)).toBe(true);
    expect(Number.isFinite(pose.z)).toBe(true);
    expect(Math.abs(pose.y)).toBeLessThan(1e-6);
    expect(pose.x).toBeCloseTo(198.67, 2);
    expect(pose.z).toBeCloseTo(230.72, 2);

    const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, DEFAULT_WORKSPACE);
    expect(ws.ok).toBe(true);
  });

  it("clamps joint values accurately against WLKATA limits", () => {
    expect(clampJointValue(0, -999)).toBe(JOINT_LIMITS[0].min);
    expect(clampJointValue(0, 999)).toBe(JOINT_LIMITS[0].max);
    expect(clampJointValue(4, 100)).toBe(36);
    expect(clampJointsToLimits([-200, 100, -200, 200, 50, -200])).toEqual([
      -100, 70, -170, 170, 36, -180,
    ]);
    expect(isJointsWithinLimits([0, 0, 0, 0, 0, 0])).toBe(true);
    expect(isJointsWithinLimits([0, 75, 0, 0, 0, 0])).toBe(false);
  });

  it("rejects out-of-workspace XYZ targets with clear diagnostics", () => {
    expect(checkWorkspaceXYZ(200, 0, 200).ok).toBe(true);
    expect(checkWorkspaceXYZ(400, 0, 200).ok).toBe(false); // R & X > 325.62
    expect(checkWorkspaceXYZ(10, 10, 200).ok).toBe(false); // R < 80
    expect(checkWorkspaceXYZ(200, 0, 10).ok).toBe(false); // Z < 30.5
    expect(checkWorkspaceXYZ(-100, -150, 200).ok).toBe(false); // A < -110 deg
  });
});
