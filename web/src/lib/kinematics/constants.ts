import type { Matrix3, Quaternion, Vector3 } from "three";

export interface JointLimit {
  min: number;
  max: number;
}

export interface MdhParam {
  i: number;
  alpha: number;
  a: number;
  d: number;
  thetaOffset: number;
}

export interface Pose6D {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface PoseSpatial {
  p: Vector3;
  q: Quaternion;
}

export interface TargetPoseMatrix extends PoseSpatial {
  R: Matrix3;
}

export interface WorkspaceConfig {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  radiusMin: number;
  radiusMax: number;
  baseMinDeg: number;
  baseMaxDeg: number;
}

export interface WorkspaceCheckResult {
  ok: boolean;
  message: string;
}

export interface DlsConfig {
  maxIter: number;
  posTolMm: number;
  rotTolDeg: number;
  stepScale: number;
  lambda: number;
  wPos: number;
  wRot: number;
  finiteDiffDeg: number;
}

export type IkSolverType = "ANALYTIC" | "CONSTRAINED" | "DLS";
export type IkBranchMode = "CLOSEST" | "ELBOW_UP" | "ELBOW_DOWN" | "ELBOW_POS" | "ELBOW_NEG";
export type MotionType = "MOVEJ" | "MOVEL" | "MOVEC";
export type TrajectoryProfileType = "LINEAR" | "CUBIC" | "QUINTIC" | "TRAPEZOIDAL" | "SCURVE";
export type DurationMode = "AUTO" | "FIXED";

export interface IkErrorMetrics {
  posMm: number;
  rotDeg: number;
}

export interface IkSolveCandidate {
  q: number[];
  err: IkErrorMetrics;
  solver: string;
}

export interface PathTargetGcodeMeta {
  space: "joint" | "cartesian";
  interpolation: "joint" | "rapid" | "linear";
}

export interface PathTarget {
  id: number;
  name: string;
  joints: number[];
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  gcode?: PathTargetGcodeMeta;
}

export interface PathProgramSettings {
  motionType: MotionType;
  trajectoryProfile: TrajectoryProfileType;
  durationMode: DurationMode;
  speedDegPerSec: number;
  maxAccelerationDegPerSec2: number;
  linearSpeedMmPerSec: number;
  linearAccelerationMmPerSec2: number;
  orientationSpeedDegPerSec: number;
  ikBranchMode: "CLOSEST" | "ELBOW_UP" | "ELBOW_DOWN";
  fixedDurationSec: number;
  trapezoidAccelPercent: number;
  monitorJoint: number;
}

export const HOME_JOINTS: readonly number[] = [0, 0, 0, 0, 0, 0];

export const LINK_NAMES = ["link1", "link2", "link3", "link4", "link5", "link6"] as const;
export type LinkName = (typeof LINK_NAMES)[number];

export const JOINT_LABELS = [
  "J1 (Base)",
  "J2 (Shoulder)",
  "J3 (Elbow)",
  "J4 (Wrist Pitch)",
  "J5 (Wrist Roll)",
  "J6 (Tool)",
] as const;

export const JOINT_LIMITS: readonly JointLimit[] = [
  { min: -100, max: 160 }, // J1 base
  { min: -40, max: 70 }, // J2 shoulder
  { min: -170, max: 60 }, // J3 elbow
  { min: -170, max: 170 }, // J4 wrist pitch
  { min: -180, max: 36 }, // J5 wrist roll
  { min: -180, max: 180 }, // J6 tool rotation
];

export const MDH_PARAMS: readonly MdhParam[] = [
  { i: 1, alpha: 0, a: 0, d: 127, thetaOffset: 0 },
  { i: 2, alpha: -Math.PI / 2, a: 29.69, d: 0, thetaOffset: -Math.PI / 2 },
  { i: 3, alpha: 0, a: 108, d: 0, thetaOffset: 0 },
  { i: 4, alpha: -Math.PI / 2, a: 20, d: 168.98, thetaOffset: 0 },
  { i: 5, alpha: Math.PI / 2, a: 0, d: 0, thetaOffset: Math.PI / 2 },
  { i: 6, alpha: Math.PI / 2, a: 0, d: -24.28, thetaOffset: 0 },
];

export const DEFAULT_WORKSPACE: WorkspaceConfig = {
  xMin: -325.62,
  xMax: 325.62,
  yMin: -325.62,
  yMax: 325.62,
  zMin: 30.5,
  zMax: 429.4,
  radiusMin: 80,
  radiusMax: 325.62,
  baseMinDeg: -110,
  baseMaxDeg: 160,
};

export const DEFAULT_DLS_CONFIG: DlsConfig = {
  maxIter: 100,
  posTolMm: 0.6,
  rotTolDeg: 0.6,
  stepScale: 0.65,
  lambda: 0.05,
  wPos: 1,
  wRot: 0.4,
  finiteDiffDeg: 0.2,
};

export const DEFAULT_PATH_PROGRAM_SETTINGS: PathProgramSettings = {
  motionType: "MOVEJ",
  trajectoryProfile: "QUINTIC",
  durationMode: "AUTO",
  speedDegPerSec: 45,
  maxAccelerationDegPerSec2: 180,
  linearSpeedMmPerSec: 80,
  linearAccelerationMmPerSec2: 250,
  orientationSpeedDegPerSec: 45,
  ikBranchMode: "CLOSEST",
  fixedDurationSec: 2,
  trapezoidAccelPercent: 25,
  monitorJoint: 0,
};

export const STL_MESH_COLORS: Record<string, number> = {
  base: 0x616161,
  link1: 0xbdbdbd,
  link2: 0xf57c00,
  link3: 0xbdbdbd,
  link4: 0xf57c00,
  link5: 0xbdbdbd,
  link6: 0xbdbdbd,
};
