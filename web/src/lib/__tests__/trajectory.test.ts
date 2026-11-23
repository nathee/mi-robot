import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATH_PROGRAM_SETTINGS,
  type PathTarget,
  type TrajectoryProfileType,
} from "../kinematics/constants";
import { fkPose6DFromJointsDeg } from "../kinematics/fk";
import {
  buildMoveCGeometry,
  computeSegmentDurationMs,
  getPathSegmentContext,
  pathTrajectoryPeakFactors,
  pathTrajectorySample,
  sampleMoveCGeometry,
} from "../path/trajectory";

function makeTarget(id: number, name: string, joints: number[]): PathTarget {
  return {
    id,
    name,
    joints,
    ...fkPose6DFromJointsDeg(joints),
  };
}

describe("Trajectory Profiles & MoveC Geometry", () => {
  const profiles: TrajectoryProfileType[] = [
    "LINEAR",
    "CUBIC",
    "QUINTIC",
    "TRAPEZOIDAL",
    "SCURVE",
  ];

  it("satisfies boundary conditions s(0)=0 and s(1)=1 across all 5 profiles", () => {
    for (const profile of profiles) {
      const s0 = pathTrajectorySample(0, profile, 25);
      const sMid = pathTrajectorySample(0.5, profile, 25);
      const s1 = pathTrajectorySample(1, profile, 25);

      expect(s0.position).toBeCloseTo(0, 6);
      expect(sMid.position).toBeCloseTo(0.5, 6);
      expect(s1.position).toBeCloseTo(1, 6);

      const peaks = pathTrajectoryPeakFactors(profile, 25);
      expect(peaks.velocity).toBeGreaterThanOrEqual(1);
    }
  });

  it("computes valid 3-point circular MoveC arc passing through from, via, and to", () => {
    const p1 = makeTarget(1, "P1", [-20, 10, -10, 0, 0, 0]);
    const p2 = makeTarget(2, "P2", [0, 20, -15, 0, 0, 0]);
    const p3 = makeTarget(3, "P3", [25, 10, -10, 0, 0, 0]);

    const geom = buildMoveCGeometry(p1, p2, p3);
    expect(geom).not.toBeNull();
    expect(geom!.lengthMm).toBeGreaterThan(10);

    const startSample = sampleMoveCGeometry(geom!, 0);
    const viaSample = sampleMoveCGeometry(geom!, geom!.viaProgress);
    const endSample = sampleMoveCGeometry(geom!, 1);

    expect(startSample.p.distanceTo(geom!.fromPose.p)).toBeLessThan(1e-5);
    expect(viaSample.p.distanceTo(geom!.viaPose.p)).toBeLessThan(1e-4);
    expect(endSample.p.distanceTo(geom!.toPose.p)).toBeLessThan(1e-5);
  });

  it("computes auto and fixed segment durations accurately", () => {
    const p1 = makeTarget(1, "P1", [0, 0, 0, 0, 0, 0]);
    const p2 = makeTarget(2, "P2", [45, 0, 0, 0, 0, 0]);
    const ctx = getPathSegmentContext([p1, p2], 0, "MOVEJ")!;

    const autoMs = computeSegmentDurationMs(ctx, DEFAULT_PATH_PROGRAM_SETTINGS);
    expect(autoMs).toBeGreaterThan(1000);

    const fixedMs = computeSegmentDurationMs(ctx, {
      ...DEFAULT_PATH_PROGRAM_SETTINGS,
      durationMode: "FIXED",
      fixedDurationSec: 3.5,
    });
    expect(fixedMs).toBeCloseTo(3500, 3);
  });
});
