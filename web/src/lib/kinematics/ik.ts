import { MathUtils, Matrix3, Vector3 } from "three";
import {
  DEFAULT_DLS_CONFIG,
  MDH_PARAMS,
  getActiveRobotProfile,
  type DlsConfig,
  type IkBranchMode,
  type IkErrorMetrics,
  type IkSolveCandidate,
  type IkSolverType,
  type PoseSpatial,
  type TargetPoseMatrix,
} from "./constants";
import {
  clampJointsToLimits,
  clampJointValue,
  finiteOr,
  fkPoseFromJointsDeg,
  forwardTxRxTzRz,
  getActiveToolOffsetMm,
  wrapDeg,
  wrapRad,
} from "./fk";

/** Mirobot arm geometry, read from the active profile at call time (Mirobot: 127 / 29.69 / 108 / a4⊕d4). */
function geo() {
  return {
    h1: MDH_PARAMS[0].d,
    l1: MDH_PARAMS[1].a,
    l2: MDH_PARAMS[2].a,
    l3: Math.hypot(MDH_PARAMS[3].a, MDH_PARAMS[3].d),
  };
}

function clampUnit(x: number): number {
  return Math.min(1, Math.max(-1, x));
}

export function poseError(curr: PoseSpatial, targ: PoseSpatial): { ep: Vector3; eo: Vector3 } {
  const ep = targ.p.clone().sub(curr.p);
  const qInv = curr.q.clone().invert();
  const qErr = qInv.multiply(targ.q.clone()).normalize();
  let angle = 2 * Math.acos(MathUtils.clamp(qErr.w, -1, 1));
  if (angle > Math.PI) angle -= 2 * Math.PI;
  const s = Math.sqrt(Math.max(1 - qErr.w * qErr.w, 0));
  const axis = new Vector3(1, 0, 0);
  if (s > 1e-8) {
    axis.set(qErr.x / s, qErr.y / s, qErr.z / s);
  }
  const eo = axis.multiplyScalar(angle);
  return { ep, eo };
}

export function ikErrorForQ(qDeg: readonly number[], targPose: PoseSpatial): IkErrorMetrics {
  const curr = fkPoseFromJointsDeg(qDeg);
  const { ep, eo } = poseError(curr, targPose);
  return {
    posMm: ep.length() * 1000,
    rotDeg: (eo.length() * 180) / Math.PI,
  };
}

function weightedPoseResidual(
  qDeg: readonly number[],
  targPose: PoseSpatial,
  cfg: DlsConfig
): number[] {
  const curr = fkPoseFromJointsDeg(qDeg);
  const { ep, eo } = poseError(curr, targPose);
  return [
    cfg.wPos * ep.x,
    cfg.wPos * ep.y,
    cfg.wPos * ep.z,
    cfg.wRot * eo.x,
    cfg.wRot * eo.y,
    cfg.wRot * eo.z,
  ];
}

function residualScore(
  qDeg: readonly number[],
  targPose: PoseSpatial,
  seedQDeg: readonly number[],
  cfg: DlsConfig
): number {
  const r = weightedPoseResidual(qDeg, targPose, cfg);
  const residual = r.reduce((sum, v) => sum + v * v, 0);
  const jointTravel = qDeg.reduce((sum, v, i) => {
    const d = wrapDeg(v - finiteOr(seedQDeg[i], v));
    return sum + d * d;
  }, 0);
  return residual + jointTravel * 1e-7;
}

function buildJacobianNumeric(
  qDeg: readonly number[],
  targPose: PoseSpatial,
  cfg: DlsConfig
): number[][] {
  const deltaDeg = cfg.finiteDiffDeg;
  const deltaRad = (deltaDeg * Math.PI) / 180;
  const basePose = fkPoseFromJointsDeg(qDeg);
  const { ep: ep0, eo: eo0 } = poseError(basePose, targPose);
  const J = Array.from({ length: 6 }, () => Array<number>(6).fill(0));

  for (let i = 0; i < 6; i++) {
    const qp = qDeg.slice();
    qp[i] += deltaDeg;
    const qpc = clampJointsToLimits(qp);
    const poseP = fkPoseFromJointsDeg(qpc);
    const { ep, eo } = poseError(poseP, targPose);
    const dep = ep.sub(ep0).multiplyScalar(1 / deltaRad);
    const deo = eo.sub(eo0).multiplyScalar(1 / deltaRad);
    J[0][i] = dep.x;
    J[1][i] = dep.y;
    J[2][i] = dep.z;
    J[3][i] = deo.x;
    J[4][i] = deo.y;
    J[5][i] = deo.z;
  }
  return J;
}

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const k = B.length;
  const out = Array.from({ length: m }, () => Array<number>(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let t = 0; t < k; t++) {
        out[i][j] += A[i][t] * B[t][j];
      }
    }
  }
  return out;
}

function matVecMul(A: number[][], v: number[]): number[] {
  const m = A.length;
  const n = v.length;
  const out = Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      out[i] += A[i][j] * v[j];
    }
  }
  return out;
}

function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const out = Array.from({ length: n }, () => Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      out[j][i] = A[i][j];
    }
  }
  return out;
}

function addDiag(A: number[][], d: number): number[][] {
  const out = A.map((row) => row.slice());
  for (let i = 0; i < out.length; i++) out[i][i] += d;
  return out;
}

function invert6(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row) => row.slice());
  const I = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    [I[col], I[pivot]] = [I[pivot], I[col]];

    const div = M[col][col];
    for (let j = 0; j < n; j++) {
      M[col][j] /= div;
      I[col][j] /= div;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = 0; j < n; j++) {
        M[r][j] -= f * M[col][j];
        I[r][j] -= f * I[col][j];
      }
    }
  }
  return I;
}

/**
 * Damped Least Squares (Levenberg-Marquardt / DLS) numeric IK solver.
 */
export function solveIK_DLS(
  seedQDeg: readonly number[],
  targPose: PoseSpatial,
  cfg: DlsConfig = DEFAULT_DLS_CONFIG
): number[] {
  const q = clampJointsToLimits(seedQDeg);

  for (let iter = 0; iter < cfg.maxIter; iter++) {
    const curr = fkPoseFromJointsDeg(q);
    const { ep, eo } = poseError(curr, targPose);
    const posErrMm = ep.length() * 1000;
    const rotErrDeg = (eo.length() * 180) / Math.PI;
    if (posErrMm <= cfg.posTolMm && rotErrDeg <= cfg.rotTolDeg) break;

    const e = [
      -cfg.wPos * ep.x,
      -cfg.wPos * ep.y,
      -cfg.wPos * ep.z,
      -cfg.wRot * eo.x,
      -cfg.wRot * eo.y,
      -cfg.wRot * eo.z,
    ];
    const J = buildJacobianNumeric(q, targPose, cfg);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) J[r][c] *= cfg.wPos;
    for (let r = 3; r < 6; r++) for (let c = 0; c < 6; c++) J[r][c] *= cfg.wRot;

    const JT = transpose(J);
    const JJT = matMul(J, JT);
    const A = addDiag(JJT, cfg.lambda * cfg.lambda);
    const Ainv = invert6(A);
    if (!Ainv) break;

    const x = matVecMul(Ainv, e);
    const dqRad = matVecMul(JT, x);
    for (let i = 0; i < 6; i++) {
      q[i] = clampJointValue(i, q[i] + ((dqRad[i] * 180) / Math.PI) * cfg.stepScale);
    }
  }
  return q;
}

/**
 * Constrained adaptive damped least squares IK solver with backtracking line search.
 */
export function solveIK_Constrained(
  seedQDeg: readonly number[],
  targPose: PoseSpatial,
  cfg: DlsConfig = DEFAULT_DLS_CONFIG
): number[] {
  let q = clampJointsToLimits(seedQDeg);
  let lambda = Math.max(cfg.lambda, 0.01);
  let bestScore = residualScore(q, targPose, seedQDeg, cfg);
  const maxStepDeg = 8;

  for (let iter = 0; iter < cfg.maxIter; iter++) {
    const curr = fkPoseFromJointsDeg(q);
    const { ep, eo } = poseError(curr, targPose);
    const posErrMm = ep.length() * 1000;
    const rotErrDeg = (eo.length() * 180) / Math.PI;
    if (posErrMm <= cfg.posTolMm && rotErrDeg <= cfg.rotTolDeg) break;

    const e = [
      -cfg.wPos * ep.x,
      -cfg.wPos * ep.y,
      -cfg.wPos * ep.z,
      -cfg.wRot * eo.x,
      -cfg.wRot * eo.y,
      -cfg.wRot * eo.z,
    ];
    const J = buildJacobianNumeric(q, targPose, cfg);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) J[r][c] *= cfg.wPos;
    for (let r = 3; r < 6; r++) for (let c = 0; c < 6; c++) J[r][c] *= cfg.wRot;

    const JT = transpose(J);
    const JTJ = matMul(JT, J);
    const A = addDiag(JTJ, lambda * lambda);
    const Ainv = invert6(A);
    if (!Ainv) break;

    const b = matVecMul(JT, e);
    const dqRad = matVecMul(Ainv, b);
    const dqDeg = dqRad.map((v) =>
      MathUtils.clamp(((v * 180) / Math.PI) * cfg.stepScale, -maxStepDeg, maxStepDeg)
    );

    let accepted = false;
    let localScale = 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cand = q.map((v, i) => clampJointValue(i, v + dqDeg[i] * localScale));
      const score = residualScore(cand, targPose, seedQDeg, cfg);
      if (score < bestScore) {
        q = cand;
        bestScore = score;
        lambda = Math.max(lambda * 0.7, 2e-3);
        accepted = true;
        break;
      }
      localScale *= 0.5;
    }

    if (!accepted) {
      lambda = Math.min(lambda * 2.5, 10);
      if (lambda >= 10) break;
    }
  }
  return q;
}

function R0_3_fromMDH(qDeg: readonly number[]): Matrix3 {
  const q3only = qDeg.slice();
  q3only[3] = 0;
  q3only[4] = 0;
  q3only[5] = 0;
  const Ts = forwardTxRxTzRz(q3only);
  return new Matrix3().setFromMatrix4(Ts[2]);
}

function RRIK_planar(
  S: number,
  V: number,
  gamma2: number,
  L2: number,
  L3: number
): { q2: number; q3: number } {
  const r2 = V * V + S * S;
  const c3 = clampUnit((r2 - L2 * L2 - L3 * L3) / (2 * L2 * L3));
  const s3 = gamma2 * Math.sqrt(Math.max(0, 1 - c3 * c3));
  const q3 = Math.atan2(s3, c3);
  const phi = Math.atan2(S, V);
  const k1 = L2 + L3 * c3;
  const k2 = L3 * s3;
  const q2 = phi - Math.atan2(k2, k1);
  return { q2, q3 };
}

function IOK_numeric(
  R0_3: Matrix3,
  R0_e: Matrix3,
  gammaW = 1
): { q4: number; q5: number; q6: number } {
  const R3e = new Matrix3();
  const R0_3_T = R0_3.clone().transpose();
  R3e.multiplyMatrices(R0_3_T, R0_e);
  const e = R3e.elements;
  const r13 = e[6];
  const r21 = e[1];
  const r22 = e[4];
  const r23 = e[7];
  const r33 = e[8];
  const c5 = Math.sqrt(r21 * r21 + r22 * r22);
  const c5eff = gammaW * c5;
  const q5 = Math.atan2(r23, c5eff);
  const q6 = Math.atan2(-r22, r21);
  let q4 = 0;
  if (Math.abs(c5eff) > 1e-9) {
    const c4 = r13 / c5eff;
    const s4 = -r33 / c5eff;
    q4 = Math.atan2(s4, c4);
  }
  return { q4: wrapRad(q4), q5: wrapRad(q5), q6: wrapRad(q6) };
}

function wristCenterFromTarget(target: TargetPoseMatrix, d6Sign = 1): Vector3 {
  const z_e = new Vector3(0, 0, 1).applyMatrix3(target.R);
  const d6m = (MDH_PARAMS[5].d / 1000) * d6Sign;
  // TCP -> flange (tool tip lies along link6 -Z) -> wrist centre
  const toolM = getActiveToolOffsetMm() / 1000;
  return target.p.clone().addScaledVector(z_e, toolM - d6m);
}

export function solveIK_AnalyticOnce(
  target: TargetPoseMatrix,
  gamma2: number,
  gammaW: number,
  d6Sign: number
): number[] {
  const pw = wristCenterFromTarget(target, d6Sign);
  const x = pw.x * 1000;
  const y = pw.y * 1000;
  const z = pw.z * 1000;
  const GEO = geo();
  const q1 = Math.atan2(y, x);
  const V = Math.sqrt(x * x + y * y) - GEO.l1;
  const S = z - GEO.h1;
  const { q2, q3 } = RRIK_planar(S, V, gamma2, GEO.l2, GEO.l3);

  const qDeg = [(q1 * 180) / Math.PI, (q2 * 180) / Math.PI, (q3 * 180) / Math.PI, 0, 0, 0];
  for (let i = 0; i < 3; i++) qDeg[i] = clampJointValue(i, qDeg[i]);

  const R0_3 = R0_3_fromMDH(qDeg);
  const { q4, q5, q6 } = IOK_numeric(R0_3, target.R, gammaW);
  qDeg[3] = clampJointValue(3, (q4 * 180) / Math.PI);
  qDeg[4] = clampJointValue(4, (q5 * 180) / Math.PI);
  qDeg[5] = clampJointValue(5, (q6 * 180) / Math.PI);

  for (let i = 0; i < 6; i++) qDeg[i] = wrapDeg(qDeg[i]);
  return qDeg;
}

function normalizeBranchMode(branchMode: IkBranchMode): "CLOSEST" | "ELBOW_POS" | "ELBOW_NEG" {
  if (branchMode === "ELBOW_POS" || branchMode === "ELBOW_UP") return "ELBOW_POS";
  if (branchMode === "ELBOW_NEG" || branchMode === "ELBOW_DOWN") return "ELBOW_NEG";
  return "CLOSEST";
}

/**
 * Closed-form IK for a 5-DOF arm with a vertical base yaw (J1), three parallel pitch joints
 * (J2..J4, 0° = straight up, positive = lean outwards) and a wrist roll (J5) — the Hiwonder xArm.
 *
 * A 5-DOF arm cannot reach an arbitrary 6D pose: the approach axis must lie in the vertical
 * plane through the base axis. The target's approach axis is projected into that plane, so the
 * result is exact for reachable poses and the closest pitch/roll match otherwise.
 *
 * @param baseFlip  0 = face the target, 1 = reach over the top (J1 + 180°)
 * @param elbowSign +1 / -1 picks the elbow branch
 */
export function solveIK_Planar5Once(
  target: TargetPoseMatrix,
  elbowSign: number,
  baseFlip: 0 | 1 = 0
): number[] | null {
  const d1 = MDH_PARAMS[0].d / 1000;
  const L2 = MDH_PARAMS[2].a / 1000;
  const L3 = MDH_PARAMS[3].a / 1000;
  const wristToTcp = -MDH_PARAMS[5].d / 1000 + getActiveToolOffsetMm() / 1000;

  // Gripper approach direction = link6 -Z
  const approach = new Vector3(0, 0, -1).applyMatrix3(target.R).normalize();
  const p = target.p;

  let q1 = Math.hypot(p.x, p.y) > 1e-6 ? Math.atan2(p.y, p.x) : Math.atan2(approach.y, approach.x);
  if (baseFlip) q1 = wrapRad(q1 + Math.PI);
  const u = new Vector3(Math.cos(q1), Math.sin(q1), 0);

  // Pitch of the approach axis measured from vertical, positive towards +u
  const pitch = Math.atan2(approach.dot(u), approach.z);
  const g = new Vector3().addScaledVector(u, Math.sin(pitch)).add(new Vector3(0, 0, Math.cos(pitch)));

  const w = p.clone().addScaledVector(g, -wristToTcp);
  const r = w.dot(u);
  const s = w.z - d1;
  const c3 = (r * r + s * s - L2 * L2 - L3 * L3) / (2 * L2 * L3);
  if (c3 > 1 + 1e-6 || c3 < -1 - 1e-6) return null;
  const q3 = elbowSign * Math.acos(clampUnit(c3));
  const q2 = Math.atan2(r, s) - Math.atan2(L3 * Math.sin(q3), L2 + L3 * Math.cos(q3));
  const q4 = pitch - q2 - q3;

  const deg = (rad: number) => wrapDeg((rad * 180) / Math.PI);
  const q = [deg(q1), deg(q2), deg(q3), deg(q4), 0, 0];

  // Wrist roll: residual rotation about the flange Z axis
  const Ts = forwardTxRxTzRz(q);
  const Rcur = new Matrix3().setFromMatrix4(Ts[5]);
  const Rrel = Rcur.clone().transpose().multiply(target.R).elements;
  q[4] = deg(Math.atan2(Rrel[1], Rrel[0]));

  return q.map((v, i) => clampJointValue(i, v));
}

function solveIK_Planar5Best(
  seedQDeg: readonly number[],
  targPose: TargetPoseMatrix,
  branchMode: IkBranchMode
): {
  q: number[];
  err: IkErrorMetrics;
  score: number;
  b: { g2: number; gw: number; ds: number };
} | null {
  const normalizedBranch = normalizeBranchMode(branchMode);
  const elbowSigns =
    normalizedBranch === "ELBOW_POS" ? [1] : normalizedBranch === "ELBOW_NEG" ? [-1] : [1, -1];
  let best: ReturnType<typeof solveIK_Planar5Best> = null;
  for (const g2 of elbowSigns) {
    for (const flip of [0, 1] as const) {
      const q = solveIK_Planar5Once(targPose, g2, flip);
      if (!q) continue;
      const err = ikErrorForQ(q, targPose);
      const travel = q.reduce(
        (sum, value, index) => sum + Math.abs(wrapDeg(value - finiteOr(seedQDeg[index], value))),
        0
      );
      const score = err.posMm + 0.5 * err.rotDeg + travel * 0.02;
      if (!best || score < best.score) best = { q, err, score, b: { g2, gw: 1, ds: flip ? -1 : 1 } };
    }
  }
  return best;
}

export function solveIK_AnalyticBest(
  seedQDeg: readonly number[],
  targPose: TargetPoseMatrix,
  branchMode: IkBranchMode = "CLOSEST"
): {
  q: number[];
  err: IkErrorMetrics;
  score: number;
  b: { g2: number; gw: number; ds: number };
} | null {
  if (getActiveRobotProfile().analyticIk === "PLANAR_5DOF") {
    return solveIK_Planar5Best(seedQDeg, targPose, branchMode);
  }
  const normalizedBranch = normalizeBranchMode(branchMode);
  const gamma2s =
    normalizedBranch === "ELBOW_POS"
      ? [1]
      : normalizedBranch === "ELBOW_NEG"
        ? [-1]
        : [1, -1];
  const gammaWs = [1, -1];
  const d6Signs = [1, -1];

  let best: {
    q: number[];
    err: IkErrorMetrics;
    score: number;
    b: { g2: number; gw: number; ds: number };
  } | null = null;

  for (const g2 of gamma2s) {
    for (const gw of gammaWs) {
      for (const ds of d6Signs) {
        let q: number[];
        try {
          q = solveIK_AnalyticOnce(targPose, g2, gw, ds);
        } catch {
          continue;
        }
        const err = ikErrorForQ(q, targPose);
        const travel = q.reduce(
          (sum, value, index) => sum + Math.abs(wrapDeg(value - finiteOr(seedQDeg[index], value))),
          0
        );
        const score = err.posMm + 0.5 * err.rotDeg + travel * 0.02;
        if (!best || score < best.score) {
          best = { q, err, score, b: { g2, gw, ds } };
        }
      }
    }
  }
  return best;
}

function chooseBestIKCandidate(
  candidates: Array<{ q: number[]; err?: IkErrorMetrics; solver: string }>,
  seedQDeg: readonly number[],
  targPose: PoseSpatial
): IkSolveCandidate | null {
  let best: (IkSolveCandidate & { score: number }) | null = null;
  for (const cand of candidates) {
    if (!cand?.q) continue;
    const err = cand.err ?? ikErrorForQ(cand.q, targPose);
    const travel = cand.q.reduce((sum, v, i) => {
      const d = wrapDeg(v - finiteOr(seedQDeg[i], v));
      return sum + Math.abs(d);
    }, 0);
    const score = err.posMm + 0.5 * err.rotDeg + travel * 2e-3;
    if (!best || score < best.score) {
      best = { q: cand.q, err, solver: cand.solver, score };
    }
  }
  return best ? { q: best.q, err: best.err, solver: best.solver } : null;
}

/**
 * Unified IK solver matching Mirobot Simulator v0.0.1:
 * supports ANALYTIC, DLS, and CONSTRAINED (hybrid analytic seed + constrained DLS refinement).
 */
export function solveIKPoseCandidate(
  seedQDeg: readonly number[],
  target: TargetPoseMatrix,
  solver: IkSolverType = "CONSTRAINED",
  options: { branchMode?: IkBranchMode; dlsConfig?: DlsConfig } = {}
): IkSolveCandidate | null {
  const branchMode = options.branchMode ?? "CLOSEST";
  const cfg = options.dlsConfig ?? DEFAULT_DLS_CONFIG;

  if (solver === "ANALYTIC") {
    const bestA = solveIK_AnalyticBest(seedQDeg, target, branchMode);
    if (!bestA) return null;
    return {
      q: bestA.q,
      err: bestA.err,
      solver: `ANALYTIC g2=${bestA.b.g2} gw=${bestA.b.gw} ds=${bestA.b.ds}`,
    };
  }

  if (solver === "DLS") {
    const analyticSeed =
      normalizeBranchMode(branchMode) === "CLOSEST"
        ? null
        : solveIK_AnalyticBest(seedQDeg, target, branchMode);
    const qDls = solveIK_DLS(analyticSeed?.q ?? seedQDeg, target, cfg);
    return { q: qDls, err: ikErrorForQ(qDls, target), solver: "DLS" };
  }

  const candidates: Array<{ q: number[]; err?: IkErrorMetrics; solver: string }> = [];
  if (normalizeBranchMode(branchMode) === "CLOSEST") {
    const qConstrained = solveIK_Constrained(seedQDeg, target, cfg);
    candidates.push({ q: qConstrained, solver: "CONSTRAINED" });
  }

  const bestA = solveIK_AnalyticBest(seedQDeg, target, branchMode);
  if (bestA) {
    candidates.push({
      q: bestA.q,
      err: bestA.err,
      solver: `CONSTRAINED analytic-seed g2=${bestA.b.g2} gw=${bestA.b.gw} ds=${bestA.b.ds}`,
    });
    const qRefined = solveIK_Constrained(bestA.q, target, cfg);
    candidates.push({ q: qRefined, solver: "CONSTRAINED refined" });
  }

  return chooseBestIKCandidate(candidates, seedQDeg, target);
}

/** True when the active robot has fewer than 6 DOF, so only "closest reachable" orientation exists. */
export function isOrientationBestEffort(): boolean {
  return getActiveRobotProfile().activeJointCount < 6;
}

/**
 * Accepts an IK result within the position tolerance, and within the rotation tolerance on
 * 6-DOF arms. A 5-DOF arm cannot match every orientation, so there the rotation residual
 * is the closest reachable orientation, not a failure.
 */
export function isIkResultAcceptable(
  err: IkErrorMetrics | null | undefined,
  posTolMm = 5,
  rotTolDeg = 10
): boolean {
  if (!err) return false;
  if (err.posMm > posTolMm) return false;
  return isOrientationBestEffort() || err.rotDeg <= rotTolDeg;
}
