import type { Matrix3, Quaternion, Vector3 } from "three";
import { MIROBOT_PROFILE } from "@/lib/robots/mirobot";
import type { RobotProfile } from "@/lib/robots/types";

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

/*
 * Robot-specific constants are ES-module *live bindings*: they hold the active robot profile's
 * values and are reassigned by applyRobotProfile(). Every importer (FK/IK, validators, viewer)
 * therefore follows the robot chosen on the selection screen. They default to the WLKATA Mirobot.
 * Always read them at call time; never cache them in module-level variables.
 */
let activeProfile: RobotProfile = MIROBOT_PROFILE;

export let HOME_JOINTS: readonly number[] = MIROBOT_PROFILE.home;

export const LINK_NAMES = ["link1", "link2", "link3", "link4", "link5", "link6"] as const;
export type LinkName = (typeof LINK_NAMES)[number];

export let JOINT_LABELS: readonly string[] = MIROBOT_PROFILE.jointLabels;

export let JOINT_LIMITS: readonly JointLimit[] = MIROBOT_PROFILE.jointLimits;

export let MDH_PARAMS: readonly MdhParam[] = MIROBOT_PROFILE.mdhParams;

export let DEFAULT_WORKSPACE: WorkspaceConfig = MIROBOT_PROFILE.workspace;

export let STL_MESH_COLORS: Record<string, number> = MIROBOT_PROFILE.meshColors;

export function getActiveRobotProfile(): RobotProfile {
  return activeProfile;
}

/** Points every robot-specific constant above at `profile`. */
export function applyRobotProfile(profile: RobotProfile): void {
  activeProfile = profile;
  HOME_JOINTS = profile.home;
  JOINT_LABELS = profile.jointLabels;
  JOINT_LIMITS = profile.jointLimits;
  MDH_PARAMS = profile.mdhParams;
  DEFAULT_WORKSPACE = profile.workspace;
  STL_MESH_COLORS = profile.meshColors;
}

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
