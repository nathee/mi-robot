import { create } from "zustand";
import {
  HOME_JOINTS,
  type IkBranchMode,
  type Pose6D,
} from "@/lib/kinematics/constants";
import type { GripperState } from "@/lib/program/types";
import {
  checkWorkspaceXYZ,
  clampJointsToLimits,
  clampJointValue,
  finiteOr,
  fkPose6DFromJointsDeg,
  pose6DToTargetMatrix,
} from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import { useSerialStore } from "./useSerialStore";
import { useViewerStore } from "./useViewerStore";

export interface IkErrorState {
  posMm: number;
  rotDeg: number;
  solver: string;
}

export interface WorkspaceStatusState {
  out: boolean;
  message: string;
}

interface RobotState {
  joints: number[];
  eePose: Pose6D;
  ikTarget: Pose6D;
  lastValidIkPose: Pose6D;
  lastIkErr: IkErrorState;
  workspaceStatus: WorkspaceStatusState;
  gripperState: GripperState;
  gripperPwm: number;

  setJoint: (index: number, deg: number, options?: { log?: boolean }) => void;
  stepJoint: (index: number, deltaDeg: number) => void;
  setJoints: (joints: readonly number[], options?: { syncIk?: boolean }) => void;
  setHome: () => void;
  setGripper: (state: GripperState, pwm?: number) => void;
  syncIkTargetFromJoints: (joints?: readonly number[]) => void;
  setIkTarget: (partial: Partial<Pose6D>) => boolean;
  rollbackIkTarget: () => void;
  applyIk: (options?: {
    withLog?: boolean;
    rollbackOnFail?: boolean;
    branchMode?: IkBranchMode;
  }) => boolean;
  clearWorkspaceError: () => void;
}

const initialHomePose = fkPose6DFromJointsDeg(HOME_JOINTS);

let lastWsErrLogAt = 0;
let lastWsErrText = "";

function formatJogAxis(axis: keyof Pose6D, value: number): string {
  const unit = axis === "x" || axis === "y" || axis === "z" ? "mm" : "deg";
  const labels: Record<keyof Pose6D, string> = {
    x: "X",
    y: "Y",
    z: "Z",
    rx: "Rx",
    ry: "Ry",
    rz: "Rz",
  };
  return `${labels[axis]}: ${finiteOr(value).toFixed(2)} ${unit}`;
}

export const useRobotStore = create<RobotState>((set, get) => ({
  joints: HOME_JOINTS.slice(),
  eePose: { ...initialHomePose },
  ikTarget: { ...initialHomePose },
  lastValidIkPose: { ...initialHomePose },
  lastIkErr: { posMm: 0, rotDeg: 0, solver: "-" },
  workspaceStatus: { out: false, message: "" },
  gripperState: "OPEN",
  gripperPwm: 0,

  setJoint(index, deg, options = {}) {
    const prev = get().joints[index];
    const nextVal = clampJointValue(index, deg);
    const nextJoints = get().joints.slice();
    nextJoints[index] = nextVal;
    const eePose = fkPose6DFromJointsDeg(nextJoints);
    const ws = checkWorkspaceXYZ(eePose.x, eePose.y, eePose.z, useViewerStore.getState().workspace);

    set({
      joints: nextJoints,
      eePose,
      ikTarget: { ...eePose },
      lastValidIkPose: ws.ok ? { ...eePose } : get().lastValidIkPose,
      workspaceStatus: { out: !ws.ok, message: ws.message },
    });

    if (options.log && Math.abs(nextVal - prev) > 0.005) {
      useSerialStore.getState().appendLog({
        dir: "sys",
        text: `Jog J${index + 1}: ${prev.toFixed(2)}° -> ${nextVal.toFixed(2)}°`,
      });
    }
  },

  stepJoint(index, deltaDeg) {
    const current = get().joints[index] ?? 0;
    get().setJoint(index, current + deltaDeg, { log: true });
  },

  setJoints(joints, options = { syncIk: true }) {
    const clamped = clampJointsToLimits(joints);
    const eePose = fkPose6DFromJointsDeg(clamped);
    const ws = checkWorkspaceXYZ(eePose.x, eePose.y, eePose.z, useViewerStore.getState().workspace);

    set((state) => ({
      joints: clamped,
      eePose,
      ...(options.syncIk !== false ? { ikTarget: { ...eePose } } : {}),
      lastValidIkPose: ws.ok && options.syncIk !== false ? { ...eePose } : state.lastValidIkPose,
      workspaceStatus: { out: !ws.ok, message: ws.message },
    }));
  },

  setHome() {
    const homeJoints = HOME_JOINTS.slice();
    const homePose = fkPose6DFromJointsDeg(homeJoints);
    set({
      joints: homeJoints,
      eePose: { ...homePose },
      ikTarget: { ...homePose },
      lastValidIkPose: { ...homePose },
      lastIkErr: { posMm: 0, rotDeg: 0, solver: "-" },
      workspaceStatus: { out: false, message: "" },
    });
    useSerialStore.getState().appendLog({
      dir: "sys",
      text: "Set Home configuration (q=[0,0,0,0,0,0])",
    });
  },

  setGripper(state, pwm) {
    const resolvedPwm = state === "CLOSE" ? Math.max(1, Math.min(1000, pwm ?? 1000)) : 0;
    set({ gripperState: state, gripperPwm: resolvedPwm });
    useSerialStore.getState().appendLog({
      dir: "sys",
      text:
        state === "CLOSE"
          ? `Gripper CLOSED (M3 S${resolvedPwm})`
          : "Gripper OPENED (M5)",
    });
  },

  syncIkTargetFromJoints(joints) {
    const q = joints ?? get().joints;
    const pose = fkPose6DFromJointsDeg(q);
    const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, useViewerStore.getState().workspace);
    set((state) => ({
      eePose: { ...pose },
      ikTarget: { ...pose },
      lastValidIkPose: ws.ok ? { ...pose } : state.lastValidIkPose,
      workspaceStatus: { out: !ws.ok, message: ws.message },
    }));
  },

  setIkTarget(partial) {
    const next: Pose6D = {
      ...get().ikTarget,
      ...partial,
    };
    const ws = checkWorkspaceXYZ(next.x, next.y, next.z, useViewerStore.getState().workspace);

    if (!ws.ok) {
      set({ workspaceStatus: { out: true, message: ws.message } });
      const now = Date.now();
      if (ws.message !== lastWsErrText || now - lastWsErrLogAt > 2000) {
        useSerialStore.getState().appendLog({ dir: "error", text: `ERROR: ${ws.message}` });
        lastWsErrLogAt = now;
        lastWsErrText = ws.message;
      }
      return false;
    }

    set({
      ikTarget: next,
      workspaceStatus: { out: false, message: "" },
    });
    return true;
  },

  rollbackIkTarget() {
    const valid = get().lastValidIkPose;
    set({
      ikTarget: { ...valid },
      workspaceStatus: { out: false, message: "" },
    });
  },

  applyIk(options = {}) {
    const { withLog = false, rollbackOnFail = true, branchMode = "CLOSEST" } = options;
    const state = get();
    const viewer = useViewerStore.getState();

    const ws = checkWorkspaceXYZ(
      state.ikTarget.x,
      state.ikTarget.y,
      state.ikTarget.z,
      viewer.workspace
    );
    if (!ws.ok) {
      set({ workspaceStatus: { out: true, message: ws.message } });
      if (rollbackOnFail) get().rollbackIkTarget();
      return false;
    }

    const fromPose = { ...state.eePose };
    const targetMat = pose6DToTargetMatrix(state.ikTarget);
    const solved = solveIKPoseCandidate(state.joints, targetMat, viewer.ikSolver, {
      branchMode,
      dlsConfig: viewer.dls,
    });

    if (!solved || solved.err.posMm > 5 || solved.err.rotDeg > 10) {
      set({
        lastIkErr: {
          posMm: solved?.err.posMm ?? 999,
          rotDeg: solved?.err.rotDeg ?? 180,
          solver: "NO_SOLUTION",
        },
      });
      if (withLog) {
        useSerialStore.getState().appendLog({
          dir: "error",
          text: `ERROR: IK failed to converge (${(solved?.err.posMm ?? 999).toFixed(2)} mm / ${(solved?.err.rotDeg ?? 180).toFixed(2)}°)`,
        });
      }
      if (rollbackOnFail) get().rollbackIkTarget();
      return false;
    }

    const nextEePose = fkPose6DFromJointsDeg(solved.q);
    set({
      joints: solved.q,
      eePose: nextEePose,
      lastValidIkPose: { ...state.ikTarget },
      lastIkErr: {
        posMm: solved.err.posMm,
        rotDeg: solved.err.rotDeg,
        solver: solved.solver,
      },
      workspaceStatus: { out: false, message: "" },
    });

    if (withLog) {
      const axes: Array<keyof Pose6D> = ["x", "y", "z", "rx", "ry", "rz"];
      const changed = axes.filter((ax) => Math.abs(nextEePose[ax] - fromPose[ax]) > 0.005);
      if (changed.length) {
        const msg = changed
          .map((ax) => `Jog ${formatJogAxis(ax, fromPose[ax])} -> ${formatJogAxis(ax, nextEePose[ax])}`)
          .join(" | ");
        useSerialStore.getState().appendLog({ dir: "sys", text: msg });
      }
    }
    return true;
  },

  clearWorkspaceError() {
    set({ workspaceStatus: { out: false, message: "" } });
  },
}));
