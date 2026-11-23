import { create } from "zustand";
import {
  DEFAULT_PATH_PROGRAM_SETTINGS,
  type PathProgramSettings,
  type PathTarget,
} from "@/lib/kinematics/constants";
import {
  checkWorkspaceXYZ,
  clampJointsToLimits,
  fkPose6DFromJointsDeg,
} from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import {
  clonePathTarget,
  exportPathProgramGcode,
  isWlkataGcodeFile,
  normalizePathProgramSettings,
  parseGcodePathProgram,
  parsePathProgramJson,
  serializePathProgramJson,
} from "@/lib/path/gcode";
import {
  computeSegmentDurationMs,
  desiredCartesianPathPose,
  getPathSegmentContext,
  pathTrajectorySample,
} from "@/lib/path/trajectory";
import { useProjectStore } from "./useProjectStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";
import { useViewerStore } from "./useViewerStore";

export type PathPlaybackStatus = "IDLE" | "PLAYING" | "PAUSED" | "COMPLETED" | "ERROR";

export interface TrajectoryTelemetry {
  q: number;
  velocity: number;
  acceleration: number;
  elapsedSec: number;
  durationSec: number;
  progress: number;
  segment: string;
}

interface PathSnapshot {
  targets: PathTarget[];
  activeTargetIndex: number;
  nextId: number;
}

interface PathState {
  targets: PathTarget[];
  nextId: number;
  activeTargetIndex: number;
  status: PathPlaybackStatus;
  settings: PathProgramSettings;
  repeatCount: number;
  repeatRemaining: number;
  currentSegment: number;
  segmentElapsedMs: number;
  lastTelemetryJoints: number[] | null;
  lastTelemetryVelocity: number;
  trajectoryTelemetry: TrajectoryTelemetry;
  undoStack: PathSnapshot[];
  redoStack: PathSnapshot[];
  clipboard: PathTarget | null;

  // Settings & selection
  updateSettings: (partial: Partial<PathProgramSettings>) => void;
  setRepeatCount: (count: number) => void;
  setActiveTargetIndex: (index: number) => void;

  // Target CRUD & editing
  teachTarget: (customName?: string) => PathTarget | null;
  updateSelectedTarget: () => boolean;
  goToTarget: (index: number) => boolean;
  reorderTarget: (fromIndex: number, toIndex: number) => void;
  moveTarget: (index: number, delta: -1 | 1) => void;
  removeTarget: (index?: number) => void;
  renameTarget: (index: number, nextName: string) => boolean;
  copySelectedTarget: () => boolean;
  pasteTarget: () => boolean;
  clearTargets: () => void;
  undo: () => boolean;
  redo: () => boolean;

  // Playback
  canPlay: () => boolean;
  togglePlayback: () => void;
  stopPlayback: (reason?: string) => void;
  cancelForManualControl: () => void;
  resetPlayback: () => void;
  stepProgram: () => void;
  advancePlaybackFrame: (dtMs: number) => void;

  // Program I/O
  newProgram: () => void;
  importProgramText: (filename: string, content: string) => { warnings: string[] };
  exportJsonString: () => string;
  exportGcodeString: () => string;
}

function emptyTelemetry(q = 0, segment = "-", progress = 0): TrajectoryTelemetry {
  return {
    q,
    velocity: 0,
    acceleration: 0,
    elapsedSec: 0,
    durationSec: 0,
    progress,
    segment,
  };
}

function captureSnapshot(state: PathState): PathSnapshot {
  return {
    targets: state.targets.map(clonePathTarget),
    activeTargetIndex: state.activeTargetIndex,
    nextId: state.nextId,
  };
}

function pushUndo(stack: PathSnapshot[], snap: PathSnapshot): PathSnapshot[] {
  const next = [...stack, snap];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

function logPath(text: string, dir: "sys" | "ok" | "error" = "sys"): void {
  useSerialStore.getState().appendLog({ dir, text: `[PATH] ${text}` });
}

export const usePathStore = create<PathState>((set, get) => ({
  targets: [],
  nextId: 1,
  activeTargetIndex: -1,
  status: "IDLE",
  settings: { ...DEFAULT_PATH_PROGRAM_SETTINGS },
  repeatCount: 1,
  repeatRemaining: 0,
  currentSegment: 0,
  segmentElapsedMs: 0,
  lastTelemetryJoints: null,
  lastTelemetryVelocity: 0,
  trajectoryTelemetry: emptyTelemetry(),
  undoStack: [],
  redoStack: [],
  clipboard: null,

  updateSettings(partial) {
    set((state) => ({
      settings: normalizePathProgramSettings({ ...state.settings, ...partial }),
    }));
    useProjectStore.getState().setDirty(true);
  },

  setRepeatCount(count) {
    const clamped = Math.max(1, Math.min(100, Math.round(Number(count) || 1)));
    set({ repeatCount: clamped });
    useProjectStore.getState().setDirty(true);
  },

  setActiveTargetIndex(index) {
    const { targets } = get();
    if (index < -1 || index >= targets.length) return;
    set({ activeTargetIndex: index });
  },

  teachTarget(customName) {
    const state = get();
    if (state.status === "PLAYING" || state.status === "PAUSED") return null;

    const robot = useRobotStore.getState();
    const joints = clampJointsToLimits(robot.joints);
    const pose = fkPose6DFromJointsDeg(joints);
    const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, useViewerStore.getState().workspace);
    if (!ws.ok) {
      logPath(`Cannot teach target: ${ws.message}`, "error");
      return null;
    }

    const id = state.nextId;
    const name = customName?.trim() || `P${id}`;
    const target: PathTarget = { id, name, joints, ...pose };

    const snap = captureSnapshot(state);
    const insertAt =
      state.activeTargetIndex >= 0 && state.activeTargetIndex < state.targets.length
        ? state.activeTargetIndex + 1
        : state.targets.length;
    const nextTargets = state.targets.slice();
    nextTargets.splice(insertAt, 0, target);

    set({
      targets: nextTargets,
      nextId: id + 1,
      activeTargetIndex: insertAt,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath(`Added target ${name} (X:${pose.x.toFixed(1)} Y:${pose.y.toFixed(1)} Z:${pose.z.toFixed(1)} mm)`);
    return target;
  },

  updateSelectedTarget() {
    const state = get();
    const idx = state.activeTargetIndex;
    if (idx < 0 || idx >= state.targets.length) return false;
    if (state.status === "PLAYING" || state.status === "PAUSED") return false;

    const robot = useRobotStore.getState();
    const joints = clampJointsToLimits(robot.joints);
    const pose = fkPose6DFromJointsDeg(joints);
    const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, useViewerStore.getState().workspace);
    if (!ws.ok) {
      logPath(`Cannot update target: ${ws.message}`, "error");
      return false;
    }

    const snap = captureSnapshot(state);
    const nextTargets = state.targets.map(clonePathTarget);
    nextTargets[idx] = { ...nextTargets[idx], joints, ...pose };

    set({
      targets: nextTargets,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath(`Updated target ${nextTargets[idx].name}`);
    return true;
  },

  goToTarget(index) {
    const state = get();
    const target = state.targets[index];
    if (!target) return false;
    get().cancelForManualControl();
    useRobotStore.getState().setJoints(target.joints, { syncIk: true });
    set({ activeTargetIndex: index });
    logPath(`Moved to ${target.name}`);
    return true;
  },

  reorderTarget(fromIndex, toIndex) {
    const state = get();
    if (
      fromIndex < 0 ||
      fromIndex >= state.targets.length ||
      toIndex < 0 ||
      toIndex >= state.targets.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const snap = captureSnapshot(state);
    const nextTargets = state.targets.map(clonePathTarget);
    const [moved] = nextTargets.splice(fromIndex, 1);
    nextTargets.splice(toIndex, 0, moved);

    set({
      targets: nextTargets,
      activeTargetIndex: toIndex,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath(`Reordered ${moved.name} to #${toIndex + 1}`);
  },

  moveTarget(index, delta) {
    const targetIdx = index + delta;
    get().reorderTarget(index, targetIdx);
  },

  removeTarget(index) {
    const state = get();
    const idx = index ?? state.activeTargetIndex;
    if (idx < 0 || idx >= state.targets.length) return;

    const snap = captureSnapshot(state);
    const removed = state.targets[idx];
    const nextTargets = state.targets.filter((_, i) => i !== idx);
    const nextActive = nextTargets.length ? Math.min(idx, nextTargets.length - 1) : -1;

    set({
      targets: nextTargets,
      activeTargetIndex: nextActive,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath(`Removed target ${removed.name}`);
  },

  renameTarget(index, nextName) {
    const state = get();
    const trimmed = nextName.trim();
    if (!trimmed || index < 0 || index >= state.targets.length) return false;

    const snap = captureSnapshot(state);
    const oldName = state.targets[index].name;
    if (oldName === trimmed) return true;

    const nextTargets = state.targets.map(clonePathTarget);
    nextTargets[index].name = trimmed;
    set({
      targets: nextTargets,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
    });
    useProjectStore.getState().setDirty(true);
    logPath(`Renamed target ${oldName} -> ${trimmed}`);
    return true;
  },

  copySelectedTarget() {
    const state = get();
    const selected = state.targets[state.activeTargetIndex];
    if (!selected) return false;
    set({ clipboard: clonePathTarget(selected) });
    logPath(`Copied target ${selected.name}`);
    return true;
  },

  pasteTarget() {
    const state = get();
    if (!state.clipboard) return false;
    const snap = captureSnapshot(state);
    const id = state.nextId;
    const pasted: PathTarget = {
      ...clonePathTarget(state.clipboard),
      id,
      name: `${state.clipboard.name}_copy`,
    };
    const insertAt =
      state.activeTargetIndex >= 0 ? state.activeTargetIndex + 1 : state.targets.length;
    const nextTargets = state.targets.map(clonePathTarget);
    nextTargets.splice(insertAt, 0, pasted);

    set({
      targets: nextTargets,
      nextId: id + 1,
      activeTargetIndex: insertAt,
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath(`Pasted target ${pasted.name}`);
    return true;
  },

  clearTargets() {
    const state = get();
    if (!state.targets.length) return;
    const snap = captureSnapshot(state);
    set({
      targets: [],
      activeTargetIndex: -1,
      currentSegment: 0,
      segmentElapsedMs: 0,
      status: "IDLE",
      trajectoryTelemetry: emptyTelemetry(),
      undoStack: pushUndo(state.undoStack, snap),
      redoStack: [],
    });
    useProjectStore.getState().setDirty(true);
    logPath("Cleared all targets");
  },

  undo() {
    const state = get();
    if (!state.undoStack.length) return false;
    const prev = state.undoStack[state.undoStack.length - 1];
    const currentSnap = captureSnapshot(state);
    set({
      targets: prev.targets.map(clonePathTarget),
      activeTargetIndex: prev.activeTargetIndex,
      nextId: prev.nextId,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: pushUndo(state.redoStack, currentSnap),
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath("Undo target edit");
    return true;
  },

  redo() {
    const state = get();
    if (!state.redoStack.length) return false;
    const next = state.redoStack[state.redoStack.length - 1];
    const currentSnap = captureSnapshot(state);
    set({
      targets: next.targets.map(clonePathTarget),
      activeTargetIndex: next.activeTargetIndex,
      nextId: next.nextId,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: pushUndo(state.undoStack, currentSnap),
      status: "IDLE",
    });
    useProjectStore.getState().setDirty(true);
    logPath("Redo target edit");
    return true;
  },

  canPlay() {
    const { targets, settings } = get();
    if (settings.motionType === "MOVEC") {
      return targets.length >= 3 && (targets.length - 1) % 2 === 0;
    }
    return targets.length >= 2;
  },

  togglePlayback() {
    const state = get();
    if (state.status === "PLAYING") {
      set({ status: "PAUSED" });
      logPath("Paused playback");
      return;
    }

    if (!get().canPlay()) {
      const minPts = state.settings.motionType === "MOVEC" ? "3 (odd count: 3, 5, 7...)" : "2";
      logPath(`Need at least ${minPts} targets for ${state.settings.motionType}`, "error");
      return;
    }

    if (state.status === "PAUSED") {
      set({ status: "PLAYING" });
      logPath("Resumed playback");
      return;
    }

    const first = state.targets[0];
    useRobotStore.getState().setJoints(first.joints, { syncIk: true });
    const ctx = getPathSegmentContext(state.targets, 0, state.settings.motionType);
    if (state.settings.motionType === "MOVEC" && !ctx?.circle) {
      set({ status: "ERROR" });
      logPath("MoveC points are collinear or degenerate", "error");
      return;
    }

    set({
      status: "PLAYING",
      currentSegment: 0,
      segmentElapsedMs: 0,
      activeTargetIndex: 0,
      repeatRemaining: Math.max(1, state.repeatCount),
      lastTelemetryJoints: first.joints.slice(),
      lastTelemetryVelocity: 0,
      trajectoryTelemetry: emptyTelemetry(
        first.joints[state.settings.monitorJoint] ?? 0,
        ctx?.label ?? "-",
        0
      ),
    });
    logPath(
      `Started ${state.settings.motionType} (${state.settings.trajectoryProfile}) x${state.repeatCount}`
    );
  },

  stopPlayback(reason) {
    const state = get();
    if (state.status === "IDLE") return;
    set({
      status: "IDLE",
      segmentElapsedMs: 0,
      repeatRemaining: 0,
    });
    if (reason) logPath(reason);
  },

  cancelForManualControl() {
    const state = get();
    if (state.status === "PLAYING" || state.status === "PAUSED") {
      set({ status: "IDLE", segmentElapsedMs: 0, repeatRemaining: 0 });
    }
  },

  resetPlayback() {
    const state = get();
    const first = state.targets[0];
    if (first) {
      useRobotStore.getState().setJoints(first.joints, { syncIk: true });
    }
    set({
      status: "IDLE",
      currentSegment: 0,
      segmentElapsedMs: 0,
      repeatRemaining: 0,
      activeTargetIndex: first ? 0 : -1,
      lastTelemetryJoints: first ? first.joints.slice() : null,
      lastTelemetryVelocity: 0,
      trajectoryTelemetry: emptyTelemetry(
        first ? (first.joints[state.settings.monitorJoint] ?? 0) : 0,
        "-",
        0
      ),
    });
    logPath("Reset path playback");
  },

  stepProgram() {
    const state = get();
    if (!state.targets.length) return;
    if (state.status === "PLAYING") set({ status: "PAUSED" });

    const nextIdx =
      state.activeTargetIndex < 0 || state.activeTargetIndex >= state.targets.length - 1
        ? 0
        : state.activeTargetIndex + 1;
    const target = state.targets[nextIdx];
    useRobotStore.getState().setJoints(target.joints, { syncIk: true });
    set({
      activeTargetIndex: nextIdx,
      trajectoryTelemetry: emptyTelemetry(
        target.joints[state.settings.monitorJoint] ?? 0,
        target.name,
        nextIdx / Math.max(1, state.targets.length - 1)
      ),
    });
    logPath(`Stepped to ${target.name} (#${nextIdx + 1}/${state.targets.length})`);
  },

  advancePlaybackFrame(dtMs) {
    const state = get();
    if (state.status !== "PLAYING") return;

    const ctx = getPathSegmentContext(state.targets, state.currentSegment, state.settings.motionType);
    if (!ctx) {
      set({ status: "COMPLETED" });
      return;
    }

    const durationMs = computeSegmentDurationMs(ctx, state.settings);
    const nextElapsedMs = Math.min(state.segmentElapsedMs + Math.max(0, dtMs), durationMs);
    const u = durationMs > 0 ? nextElapsedMs / durationMs : 1;
    const sample = pathTrajectorySample(
      u,
      state.settings.trajectoryProfile,
      state.settings.trapezoidAccelPercent
    );

    let nextJoints: number[];
    const monitorIdx = state.settings.monitorJoint;
    const durationSec = durationMs / 1000;
    const elapsedSec = nextElapsedMs / 1000;

    if (state.settings.motionType === "MOVEJ") {
      nextJoints = ctx.from.joints.map((q0, i) => q0 + (ctx.to.joints[i] - q0) * sample.position);
      const dq = ctx.to.joints[monitorIdx] - ctx.from.joints[monitorIdx];
      const velocity = durationSec > 0 ? (dq * sample.velocity) / durationSec : 0;
      const acceleration = durationSec > 0 ? (dq * sample.acceleration) / (durationSec * durationSec) : 0;

      useRobotStore.getState().setJoints(nextJoints, { syncIk: true });
      set({
        segmentElapsedMs: nextElapsedMs,
        lastTelemetryJoints: nextJoints.slice(),
        lastTelemetryVelocity: velocity,
        trajectoryTelemetry: {
          q: nextJoints[monitorIdx],
          velocity,
          acceleration,
          elapsedSec,
          durationSec,
          progress: sample.position,
          segment: ctx.label,
        },
      });
    } else {
      const desired = desiredCartesianPathPose(ctx, sample.position, state.settings.motionType);
      if (!desired) {
        set({ status: "ERROR" });
        logPath(`Segment ${ctx.label} failed: invalid Cartesian geometry`, "error");
        return;
      }

      const viewer = useViewerStore.getState();
      const seed = useRobotStore.getState().joints;
      const solved = solveIKPoseCandidate(seed, desired, viewer.ikSolver, {
        branchMode: state.settings.ikBranchMode,
        dlsConfig: viewer.dls,
      });

      if (!solved || solved.err.posMm > 5 || solved.err.rotDeg > 10) {
        set({ status: "ERROR" });
        logPath(
          `IK failed during ${ctx.label} (${(solved?.err.posMm ?? 999).toFixed(2)} mm)`,
          "error"
        );
        return;
      }

      nextJoints = solved.q;
      const dtSec = Math.max(dtMs / 1000, 1e-4);
      const prevQ = state.lastTelemetryJoints?.[monitorIdx] ?? nextJoints[monitorIdx];
      const velocity = (nextJoints[monitorIdx] - prevQ) / dtSec;
      const acceleration = (velocity - state.lastTelemetryVelocity) / dtSec;

      useRobotStore.getState().setJoints(nextJoints, { syncIk: true });
      set({
        segmentElapsedMs: nextElapsedMs,
        lastTelemetryJoints: nextJoints.slice(),
        lastTelemetryVelocity: velocity,
        trajectoryTelemetry: {
          q: nextJoints[monitorIdx],
          velocity,
          acceleration,
          elapsedSec,
          durationSec,
          progress: sample.position,
          segment: ctx.label,
        },
      });
    }

    // Check segment completion
    if (nextElapsedMs >= durationMs) {
      const nextSeg = state.currentSegment + ctx.step;
      const nextCtx = getPathSegmentContext(state.targets, nextSeg, state.settings.motionType);
      if (nextCtx) {
        set({
          currentSegment: nextSeg,
          segmentElapsedMs: 0,
          activeTargetIndex: nextSeg,
        });
      } else {
        const remaining = state.repeatRemaining - 1;
        if (remaining > 0) {
          const first = state.targets[0];
          useRobotStore.getState().setJoints(first.joints, { syncIk: true });
          set({
            currentSegment: 0,
            segmentElapsedMs: 0,
            activeTargetIndex: 0,
            repeatRemaining: remaining,
            lastTelemetryJoints: first.joints.slice(),
            lastTelemetryVelocity: 0,
          });
          logPath(`Repeating cycle (${remaining} remaining)`);
        } else {
          set({
            status: "COMPLETED",
            activeTargetIndex: state.targets.length - 1,
            repeatRemaining: 0,
          });
          logPath("Path playback completed", "ok");
        }
      }
    }
  },

  newProgram() {
    set({
      targets: [],
      nextId: 1,
      activeTargetIndex: -1,
      status: "IDLE",
      settings: { ...DEFAULT_PATH_PROGRAM_SETTINGS },
      repeatCount: 1,
      repeatRemaining: 0,
      currentSegment: 0,
      segmentElapsedMs: 0,
      trajectoryTelemetry: emptyTelemetry(),
      undoStack: [],
      redoStack: [],
    });
    useProjectStore.getState().resetProject();
    logPath("Created new path program");
  },

  importProgramText(filename, content) {
    const gcode = isWlkataGcodeFile(filename);
    const baseName = filename.replace(/\.[^.]+$/, "") || "Untitled";
    const parsed = gcode
      ? parseGcodePathProgram(content, {
          fallbackProjectName: baseName,
          initialJoints: useRobotStore.getState().joints,
          solver: useViewerStore.getState().ikSolver,
        })
      : parsePathProgramJson(content);

    set({
      targets: parsed.targets,
      nextId: parsed.nextId,
      activeTargetIndex: parsed.targets.length ? 0 : -1,
      status: "IDLE",
      settings: parsed.settings,
      repeatCount: parsed.repeatCount,
      repeatRemaining: 0,
      currentSegment: 0,
      segmentElapsedMs: 0,
      trajectoryTelemetry: emptyTelemetry(),
      undoStack: [],
      redoStack: [],
    });

    if (parsed.targets.length) {
      useRobotStore.getState().setJoints(parsed.targets[0].joints, { syncIk: true });
    }

    useProjectStore.getState().setName(parsed.projectName, false);
    useProjectStore.getState().setFileMeta({
      fileName: baseName,
      fileFormat: gcode ? "gcode" : "json",
      dirty: false,
    });

    logPath(
      `Loaded ${filename} (${parsed.targets.length} targets, ${parsed.settings.motionType})`,
      "ok"
    );
    parsed.warnings.forEach((w) => logPath(`Warning: ${w}`, "sys"));
    return { warnings: parsed.warnings };
  },

  exportJsonString() {
    const { targets, settings, repeatCount } = get();
    const { name } = useProjectStore.getState();
    return serializePathProgramJson({
      projectName: name,
      settings,
      repeatCount,
      targets,
    });
  },

  exportGcodeString() {
    const { targets, settings } = get();
    const { name } = useProjectStore.getState();
    return exportPathProgramGcode({
      projectName: name,
      settings,
      targets,
    });
  },
}));
