import { Euler, Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import {
  DEFAULT_WORKSPACE,
  JOINT_LIMITS,
  MDH_PARAMS,
  type Pose6D,
  type PoseSpatial,
  type TargetPoseMatrix,
  type WorkspaceCheckResult,
  type WorkspaceConfig,
} from "./constants";
import { t } from "@/lib/i18n";

export function finiteOr(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function wrapDeg(deg: number): number {
  let v = finiteOr(deg, 0);
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

export function wrapRad(rad: number): number {
  let a = finiteOr(rad, 0);
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function clampJointValue(index: number, deg: number): number {
  const { min, max } = JOINT_LIMITS[index] ?? { min: -180, max: 180 };
  let nv = Number(deg);
  if (!Number.isFinite(nv)) nv = 0;
  if (nv < min) nv = min;
  if (nv > max) nv = max;
  return nv;
}

export function clampJointsToLimits(jointsDeg: readonly number[]): number[] {
  return jointsDeg.map((deg, idx) => clampJointValue(idx, deg));
}

export function isJointsWithinLimits(jointsDeg: readonly number[]): boolean {
  if (!Array.isArray(jointsDeg) || jointsDeg.length !== 6) return false;
  return jointsDeg.every((v, idx) => {
    const n = Number(v);
    const limit = JOINT_LIMITS[idx];
    return Number.isFinite(n) && n >= limit.min - 1e-6 && n <= limit.max + 1e-6;
  });
}

/**
 * WLKATA Modified Denavit-Hartenberg (Craig's MDH) homogeneous transform matrix:
 * T = Rx(alpha) * Tx(a) * Rz(theta) * Tz(d)
 */
export function mdhWlkata(alpha: number, aMeters: number, dMeters: number, theta: number): Matrix4 {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);

  const T = new Matrix4();
  T.set(
    ct,
    -st,
    0,
    aMeters,
    st * ca,
    ct * ca,
    -sa,
    -dMeters * sa,
    st * sa,
    ct * sa,
    ca,
    dMeters * ca,
    0,
    0,
    0,
    1
  );
  return T;
}

/**
 * Computes cumulative 4x4 homogeneous transforms T0_1 .. T0_6 in meters.
 */
export function forwardTxRxTzRz(jointsDeg: readonly number[]): Matrix4[] {
  const qRad = jointsDeg.map((qd) => (finiteOr(qd, 0) * Math.PI) / 180);
  const Ts: Matrix4[] = [];
  const Tprev = new Matrix4().identity();

  for (let i = 0; i < MDH_PARAMS.length; i++) {
    const { alpha, a, d, thetaOffset } = MDH_PARAMS[i];
    const theta = qRad[i] + thetaOffset;
    const A = mdhWlkata(alpha, a / 1000, d / 1000, theta);
    const T = Tprev.clone().multiply(A);
    Ts.push(T.clone());
    Tprev.copy(T);
  }
  return Ts;
}

let activeToolOffsetMm = 0;

/**
 * Sets the mounted tool's TCP offset (mm, measured outward from the flange along link6 -Z). All FK/IK helpers use it by default,
 * so Cartesian coordinates everywhere refer to the tool tip instead of the bare flange.
 */
export function setActiveToolOffsetMm(mm: number): void {
  activeToolOffsetMm = Math.max(0, finiteOr(mm, 0));
}

export function getActiveToolOffsetMm(): number {
  return activeToolOffsetMm;
}

/**
 * Flange-to-TCP transform (meters). The flange faces link6 -Z (MDH d6 < 0),
 * so the tool tip lies along -Z of the link6 frame.
 */
export function toolTransformMatrix(toolOffsetMm = activeToolOffsetMm): Matrix4 {
  return new Matrix4().makeTranslation(0, 0, -finiteOr(toolOffsetMm, 0) / 1000);
}

/** World TCP matrix: T0_6 * T_tool. */
export function tcpMatrixFromJointsDeg(
  jointsDeg: readonly number[],
  toolOffsetMm = activeToolOffsetMm
): Matrix4 {
  const Ts = forwardTxRxTzRz(jointsDeg);
  const T = Ts[Ts.length - 1].clone();
  if (toolOffsetMm) T.multiply(toolTransformMatrix(toolOffsetMm));
  return T;
}

/**
 * Returns TCP position (meters) and orientation (Quaternion) from 6 joint angles (degrees).
 */
export function fkPoseFromJointsDeg(
  jointsDeg: readonly number[],
  toolOffsetMm = activeToolOffsetMm
): PoseSpatial {
  const T = tcpMatrixFromJointsDeg(jointsDeg, toolOffsetMm);
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  T.decompose(p, q, s);
  return { p, q };
}

/**
 * Returns TCP Pose6D (mm / degrees, XYZ Euler) from 6 joint angles (degrees).
 */
export function fkPose6DFromJointsDeg(
  jointsDeg: readonly number[],
  toolOffsetMm = activeToolOffsetMm
): Pose6D {
  const pose = fkPoseFromJointsDeg(jointsDeg, toolOffsetMm);
  const euler = new Euler().setFromQuaternion(pose.q, "XYZ");
  return {
    x: pose.p.x * 1000,
    y: pose.p.y * 1000,
    z: pose.p.z * 1000,
    rx: (euler.x * 180) / Math.PI,
    ry: (euler.y * 180) / Math.PI,
    rz: (euler.z * 180) / Math.PI,
  };
}

/**
 * Converts Pose6D (mm / deg) to TargetPoseMatrix (meters, Quaternion, Matrix3).
 */
export function pose6DToTargetMatrix(pose: Pose6D): TargetPoseMatrix {
  const p = new Vector3(finiteOr(pose.x) / 1000, finiteOr(pose.y) / 1000, finiteOr(pose.z) / 1000);
  const e = new Euler(
    (finiteOr(pose.rx) * Math.PI) / 180,
    (finiteOr(pose.ry) * Math.PI) / 180,
    (finiteOr(pose.rz) * Math.PI) / 180,
    "XYZ"
  );
  const q = new Quaternion().setFromEuler(e);
  const R4 = new Matrix4().makeRotationFromQuaternion(q);
  const R = new Matrix3().setFromMatrix4(R4);
  return { p, q, R };
}

export function targetMatrixFromPositionQuaternion(
  position: Vector3,
  quaternion: Quaternion
): TargetPoseMatrix {
  const p = position.clone();
  const q = quaternion.clone().normalize();
  const R4 = new Matrix4().makeRotationFromQuaternion(q);
  const R = new Matrix3().setFromMatrix4(R4);
  return { p, q, R };
}

/**
 * Checks whether a Cartesian XYZ coordinate (mm) is within the WLKATA Mirobot workspace envelope.
 */
export function checkWorkspaceXYZ(
  x: number,
  y: number,
  z: number,
  ws: WorkspaceConfig = DEFAULT_WORKSPACE
): WorkspaceCheckResult {
  const px = finiteOr(x, NaN);
  const py = finiteOr(y, NaN);
  const pz = finiteOr(z, NaN);

  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
    return { ok: false, message: t("log.outOfWorkspaceInvalid") };
  }

  const reasons: string[] = [];
  if (px < ws.xMin || px > ws.xMax) reasons.push(`X ${px.toFixed(1)} mm`);
  if (py < ws.yMin || py > ws.yMax) reasons.push(`Y ${py.toFixed(1)} mm`);
  if (pz < ws.zMin || pz > ws.zMax) reasons.push(`Z ${pz.toFixed(1)} mm`);

  const radius = Math.hypot(px, py);
  if (radius < ws.radiusMin || radius > ws.radiusMax) {
    reasons.push(`R ${radius.toFixed(1)} mm`);
  }

  const angleDeg = (Math.atan2(py, px) * 180) / Math.PI;
  if (angleDeg < ws.baseMinDeg || angleDeg > ws.baseMaxDeg) {
    reasons.push(`A ${angleDeg.toFixed(1)} deg`);
  }

  return reasons.length
    ? { ok: false, message: t("log.outOfWorkspace", { reasons: reasons.join(", ") }) }
    : { ok: true, message: "" };
}
