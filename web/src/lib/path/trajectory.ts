import { MathUtils, type Quaternion, type Vector3 } from "three";
import {
  type PathProgramSettings,
  type PathTarget,
  type TargetPoseMatrix,
  type TrajectoryProfileType,
} from "../kinematics/constants";
import {
  fkPoseFromJointsDeg,
  targetMatrixFromPositionQuaternion,
} from "../kinematics/fk";

export interface TrajectoryProfileOption {
  value: TrajectoryProfileType;
  label: string;
}

export const TRAJECTORY_PROFILES: readonly TrajectoryProfileOption[] = [
  { value: "LINEAR", label: "Linear" },
  { value: "CUBIC", label: "Cubic" },
  { value: "QUINTIC", label: "Quintic" },
  { value: "TRAPEZOIDAL", label: "Trapezoidal" },
  { value: "SCURVE", label: "S-Curve" },
];

export interface TrajectorySample {
  position: number;
  velocity: number;
  acceleration: number;
}

export interface MoveCGeometry {
  fromPose: TargetPoseMatrix;
  viaPose: TargetPoseMatrix;
  toPose: TargetPoseMatrix;
  center: Vector3;
  basisX: Vector3;
  basisY: Vector3;
  radius: number;
  sweep: number;
  viaProgress: number;
  lengthMm: number;
}

export interface PathSegmentContext {
  from: PathTarget;
  via: PathTarget | null;
  to: PathTarget;
  circle: MoveCGeometry | null;
  step: 1 | 2;
  label: string;
}

export function pathTargetPose(target: PathTarget): TargetPoseMatrix {
  const fk = fkPoseFromJointsDeg(target.joints);
  return targetMatrixFromPositionQuaternion(fk.p, fk.q);
}

export function quaternionTravelDeg(qFrom: Quaternion, qTo: Quaternion): number {
  const dot = Math.abs(MathUtils.clamp(qFrom.dot(qTo), -1, 1));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function positiveAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

/**
 * Computes exact 3D circular arc geometry passing through from -> via -> to.
 * Returns null if points are collinear or degenerate.
 */
export function buildMoveCGeometry(
  from: PathTarget,
  via: PathTarget,
  to: PathTarget
): MoveCGeometry | null {
  const fromPose = pathTargetPose(from);
  const viaPose = pathTargetPose(via);
  const toPose = pathTargetPose(to);

  const a = viaPose.p.clone().sub(fromPose.p);
  const b = toPose.p.clone().sub(fromPose.p);
  const normal = a.clone().cross(b);
  const normalLengthSq = normal.lengthSq();
  if (a.lengthSq() < 1e-10 || b.lengthSq() < 1e-10 || normalLengthSq < 1e-10) {
    return null;
  }

  const centerOffset = normal
    .clone()
    .cross(a)
    .multiplyScalar(b.lengthSq())
    .add(b.clone().cross(normal).multiplyScalar(a.lengthSq()))
    .multiplyScalar(1 / (2 * normalLengthSq));

  const center = fromPose.p.clone().add(centerOffset);
  const radius = center.distanceTo(fromPose.p);
  if (!Number.isFinite(radius) || radius < 1e-5) return null;

  const basisX = fromPose.p.clone().sub(center).normalize();
  const basisY = normal.clone().normalize().cross(basisX).normalize();

  const angleFor = (position: Vector3): number => {
    const radial = position.clone().sub(center).normalize();
    return Math.atan2(radial.dot(basisY), radial.dot(basisX));
  };

  const viaAngle = positiveAngle(angleFor(viaPose.p));
  const endAngle = positiveAngle(angleFor(toPose.p));
  const sweep = viaAngle <= endAngle ? endAngle : endAngle - Math.PI * 2;
  if (Math.abs(sweep) < 1e-5) return null;

  const unwrappedVia = sweep > 0 ? viaAngle : viaAngle - Math.PI * 2;
  const viaProgress = MathUtils.clamp(unwrappedVia / sweep, 1e-4, 0.9999);

  return {
    fromPose,
    viaPose,
    toPose,
    center,
    basisX,
    basisY,
    radius,
    sweep,
    viaProgress,
    lengthMm: Math.abs(sweep) * radius * 1000,
  };
}

export function sampleMoveCGeometry(geometry: MoveCGeometry, progress: number): TargetPoseMatrix {
  const s = MathUtils.clamp(progress, 0, 1);
  const angle = geometry.sweep * s;
  const position = geometry.center
    .clone()
    .addScaledVector(geometry.basisX, geometry.radius * Math.cos(angle))
    .addScaledVector(geometry.basisY, geometry.radius * Math.sin(angle));

  const quaternion =
    s <= geometry.viaProgress
      ? geometry.fromPose.q.clone().slerp(geometry.viaPose.q, s / geometry.viaProgress)
      : geometry.viaPose.q
          .clone()
          .slerp(
            geometry.toPose.q,
            (s - geometry.viaProgress) / Math.max(1 - geometry.viaProgress, 1e-4)
          );

  return targetMatrixFromPositionQuaternion(position, quaternion);
}

export function getPathSegmentContext(
  targets: readonly PathTarget[],
  index: number,
  motionType: PathProgramSettings["motionType"]
): PathSegmentContext | null {
  const from = targets[index];
  if (!from) return null;

  if (motionType === "MOVEC") {
    const via = targets[index + 1];
    const to = targets[index + 2];
    if (!via || !to) return null;
    const circle = buildMoveCGeometry(from, via, to);
    return {
      from,
      via,
      to,
      circle,
      step: 2,
      label: `${from.name} -> ${via.name} -> ${to.name}`,
    };
  }

  const to = targets[index + 1];
  if (!to) return null;
  return {
    from,
    via: null,
    to,
    circle: null,
    step: 1,
    label: `${from.name} -> ${to.name}`,
  };
}

export function pathTrajectoryEquation(
  profile: TrajectoryProfileType,
  trapezoidAccelPercent = 25
): string {
  if (profile === "LINEAR") return "s(u) = u";
  if (profile === "CUBIC") return "s(u) = 3u^2 - 2u^3";
  if (profile === "QUINTIC") return "s(u) = 10u^3 - 15u^4 + 6u^5";
  if (profile === "SCURVE") return "s(u) = 35u^4 - 84u^5 + 70u^6 - 20u^7";
  return `Trapezoidal velocity, ta/T = ${trapezoidAccelPercent}%`;
}

export function pathTrajectorySample(
  normalizedTime: number,
  profile: TrajectoryProfileType,
  trapezoidAccelPercent = 25
): TrajectorySample {
  const u = MathUtils.clamp(Number(normalizedTime) || 0, 0, 1);

  if (profile === "LINEAR") {
    return { position: u, velocity: 1, acceleration: 0 };
  }
  if (profile === "CUBIC") {
    return {
      position: 3 * u ** 2 - 2 * u ** 3,
      velocity: 6 * u - 6 * u ** 2,
      acceleration: 6 - 12 * u,
    };
  }
  if (profile === "QUINTIC") {
    return {
      position: 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5,
      velocity: 30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4,
      acceleration: 60 * u - 180 * u ** 2 + 120 * u ** 3,
    };
  }
  if (profile === "SCURVE") {
    return {
      position: 35 * u ** 4 - 84 * u ** 5 + 70 * u ** 6 - 20 * u ** 7,
      velocity: 140 * u ** 3 - 420 * u ** 4 + 420 * u ** 5 - 140 * u ** 6,
      acceleration: 420 * u ** 2 - 1680 * u ** 3 + 2100 * u ** 4 - 840 * u ** 5,
    };
  }

  const accelFraction = MathUtils.clamp(Number(trapezoidAccelPercent) / 100 || 0.25, 0.1, 0.45);
  const peakVelocity = 1 / (1 - accelFraction);
  const normalizedAcceleration = peakVelocity / accelFraction;

  if (u < accelFraction) {
    return {
      position: 0.5 * normalizedAcceleration * u ** 2,
      velocity: normalizedAcceleration * u,
      acceleration: normalizedAcceleration,
    };
  }
  if (u <= 1 - accelFraction) {
    return {
      position: peakVelocity * (u - accelFraction / 2),
      velocity: peakVelocity,
      acceleration: 0,
    };
  }
  const remaining = 1 - u;
  return {
    position: 1 - 0.5 * normalizedAcceleration * remaining ** 2,
    velocity: normalizedAcceleration * remaining,
    acceleration: -normalizedAcceleration,
  };
}

export function pathTrajectoryPeakFactors(
  profile: TrajectoryProfileType,
  trapezoidAccelPercent = 25
): { velocity: number; acceleration: number } {
  if (profile === "LINEAR") return { velocity: 1, acceleration: 0 };
  if (profile === "CUBIC") return { velocity: 1.5, acceleration: 6 };
  if (profile === "QUINTIC") {
    return { velocity: 1.875, acceleration: 10 / Math.sqrt(3) };
  }
  if (profile === "SCURVE") {
    return { velocity: 2.1875, acceleration: 7.51319 };
  }
  const accelFraction = MathUtils.clamp(Number(trapezoidAccelPercent) / 100 || 0.25, 0.1, 0.45);
  return {
    velocity: 1 / (1 - accelFraction),
    acceleration: 1 / (accelFraction * (1 - accelFraction)),
  };
}

export function pathJointTravel(context: PathSegmentContext): number {
  return context.from.joints.reduce((largest, value, index) => {
    const travel = context.via
      ? Math.abs(context.via.joints[index] - value) +
        Math.abs(context.to.joints[index] - context.via.joints[index])
      : Math.abs(context.to.joints[index] - value);
    return Math.max(largest, travel);
  }, 0);
}

export function computeSegmentDurationMs(
  context: PathSegmentContext,
  settings: PathProgramSettings
): number {
  if (settings.durationMode === "FIXED") {
    const fixedDurationSec = MathUtils.clamp(Number(settings.fixedDurationSec) || 2, 0.25, 30);
    return fixedDurationSec * 1000;
  }

  const maxTravel = pathJointTravel(context);
  const maxVelocity = MathUtils.clamp(Number(settings.speedDegPerSec) || 45, 5, 180);
  const maxAcceleration = MathUtils.clamp(
    Number(settings.maxAccelerationDegPerSec2) || 180,
    10,
    2000
  );
  const peak = pathTrajectoryPeakFactors(
    settings.trajectoryProfile,
    settings.trapezoidAccelPercent
  );
  const velocityDurationMs = (maxTravel * peak.velocity * 1000) / maxVelocity;
  const accelerationDurationMs =
    peak.acceleration > 0
      ? Math.sqrt((maxTravel * peak.acceleration) / maxAcceleration) * 1000
      : 0;

  if (settings.motionType === "MOVEJ") {
    return Math.max(250, velocityDurationMs, accelerationDurationMs);
  }

  const fromPose = pathTargetPose(context.from);
  const toPose = pathTargetPose(context.to);
  const distanceMm =
    settings.motionType === "MOVEC"
      ? (context.circle?.lengthMm ?? 0)
      : fromPose.p.distanceTo(toPose.p) * 1000;
  const orientationDeg = context.via
    ? quaternionTravelDeg(fromPose.q, pathTargetPose(context.via).q) +
      quaternionTravelDeg(pathTargetPose(context.via).q, toPose.q)
    : quaternionTravelDeg(fromPose.q, toPose.q);

  const linearVelocity = MathUtils.clamp(Number(settings.linearSpeedMmPerSec) || 80, 5, 500);
  const linearAcceleration = MathUtils.clamp(
    Number(settings.linearAccelerationMmPerSec2) || 250,
    10,
    3000
  );
  const orientationVelocity = MathUtils.clamp(
    Number(settings.orientationSpeedDegPerSec) || 45,
    5,
    180
  );

  const linearVelocityMs = (distanceMm * peak.velocity * 1000) / linearVelocity;
  const linearAccelerationMs =
    peak.acceleration > 0
      ? Math.sqrt((distanceMm * peak.acceleration) / linearAcceleration) * 1000
      : 0;
  const orientationMs = (orientationDeg * peak.velocity * 1000) / orientationVelocity;

  return Math.max(
    250,
    velocityDurationMs,
    accelerationDurationMs,
    linearVelocityMs,
    linearAccelerationMs,
    orientationMs
  );
}

export function desiredCartesianPathPose(
  context: PathSegmentContext,
  progress: number,
  motionType: PathProgramSettings["motionType"]
): TargetPoseMatrix | null {
  if (motionType === "MOVEC") {
    if (!context.circle) return null;
    return sampleMoveCGeometry(context.circle, progress);
  }
  const fromPose = pathTargetPose(context.from);
  const toPose = pathTargetPose(context.to);
  const s = MathUtils.clamp(progress, 0, 1);
  const position = fromPose.p.clone().lerp(toPose.p, s);
  const quaternion = fromPose.q.clone().slerp(toPose.q, s);
  return targetMatrixFromPositionQuaternion(position, quaternion);
}
