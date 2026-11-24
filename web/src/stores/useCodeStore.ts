import { create } from "zustand";
import { CONVEYOR_MAX_SPEED_MM_S } from "@/lib/sim/workcell";
import { useWorkcellStore } from "./useWorkcellStore";
import { HOME_JOINTS, type Pose6D } from "@/lib/kinematics/constants";
import {
  fkPose6DFromJointsDeg,
  fkPoseFromJointsDeg,
  pose6DToTargetMatrix,
  targetMatrixFromPositionQuaternion,
} from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import { pathTrajectorySample } from "@/lib/path/trajectory";
import {
  blocksToGcode,
  blocksToScript,
  compileBlocksProgram,
  createDemoBlocks,
  nextBlockId,
} from "@/lib/program/blocks";
import {
  compileGcodeProgram,
  SAMPLE_GCODE_PROGRAMS,
  stepsToGcode,
} from "@/lib/program/gcodeCompiler";
import {
  compileScriptProgram,
  SAMPLE_SCRIPTS,
  scriptToGcode,
} from "@/lib/program/scriptCompiler";
import type {
  CodeEditorMode,
  CompileError,
  ProgramBlock,
  ProgramStep,
} from "@/lib/program/types";
import { usePathStore } from "./usePathStore";
import { useProjectStore } from "./useProjectStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";
import { useViewerStore } from "./useViewerStore";

export type CodeRunStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "ERROR";

interface ActiveStepRuntime {
  stepIndex: number;
  elapsedMs: number;
  durationMs: number;
  startJoints: number[];
  startPose: Pose6D;
}

interface CodeState {
  mode: CodeEditorMode;
  blocks: ProgramBlock[];
  scriptText: string;
  gcodeText: string;

  status: CodeRunStatus;
  compiledSteps: ProgramStep[];
  errors: CompileError[];
  activeStepIndex: number;
  activeLine: number | null;
  activeBlockId: string | null;
  stepProgress: number;
  runtime: ActiveStepRuntime | null;

  // Mode & Editing
  setMode: (mode: CodeEditorMode) => void;
  setBlocks: (blocks: ProgramBlock[]) => void;
  setScriptText: (text: string) => void;
  setGcodeText: (text: string) => void;

  // Block helpers
  addBlock: (block: ProgramBlock, parentRepeatId?: string) => void;
  updateBlock: (id: string, updater: (b: ProgramBlock) => ProgramBlock) => void;
  removeBlock: (id: string) => void;
  moveBlock: (fromIdx: number, toIdx: number) => void;
  loadSampleBlocks: () => void;

  // Insert current robot pose into active editor
  insertCurrentPose: (space: "JOINT" | "LINEAR") => void;

  // Conversions
  convertBlocksToGcode: () => boolean;
  convertBlocksToScript: () => boolean;
  convertScriptToGcode: () => boolean;
  getExportableGcode: () => string;

  // Execution
  compileCurrent: () => boolean;
  runOrPause: () => void;
  stepOnce: () => void;
  stop: (reason?: string) => void;
  advanceCodeFrame: (dtMs: number) => void;
}

function logCode(text: string, dir: "sys" | "ok" | "error" = "sys"): void {
  useSerialStore.getState().appendLog({ dir, text: `[CODE] ${text}` });
}

function sensorConditionMet(step: { until: "BLOCKED" | "CLEAR" }): boolean {
  const blocked = useWorkcellStore.getState().sensorBlocked;
  return step.until === "BLOCKED" ? blocked : !blocked;
}

/** Side effects of non-motion steps (tool action, conveyor, tool change). */
function applyInstantStep(step: ProgramStep): void {
  const robot = useRobotStore.getState();
  if (step.type === "GRIPPER") {
    robot.setGripper(step.state, step.pwm);
  } else if (step.type === "TOOL") {
    robot.setToolType(step.tool);
  } else if (step.type === "CONVEYOR") {
    const wc = useWorkcellStore.getState();
    if (step.mode === "AUTO") wc.setAutoFeed(step.value > 0, step.value > 0 ? step.value : undefined);
    else if (step.mode === "SPEED") wc.setConveyorSpeedPercent(step.value);
    else wc.moveConveyor(step.value, Boolean(step.absolute), step.feed);
    logCode(step.label);
  }
}

function mapBlocksRecursive(
  list: ProgramBlock[],
  fn: (b: ProgramBlock) => ProgramBlock | null
): ProgramBlock[] {
  const out: ProgramBlock[] = [];
  for (const b of list) {
    const updated = fn(b);
    if (!updated) continue;
    if (updated.kind === "REPEAT") {
      out.push({ ...updated, children: mapBlocksRecursive(updated.children, fn) });
    } else {
      out.push(updated);
    }
  }
  return out;
}

function computeStepDurationMs(
  step: ProgramStep,
  startJoints: readonly number[],
  startPose: Pose6D
): number {
  if (step.type === "WAIT") return Math.max(50, step.durationMs);
  if (step.type === "GRIPPER" || step.type === "LOG") return 180;
  if (step.type === "TOOL") return 400;
  if (step.type === "WAIT_SENSOR") return step.timeoutMs;
  if (step.type === "CONVEYOR") {
    if (step.mode === "SPEED" || step.mode === "AUTO") return 180;
    const rt = useWorkcellStore.getState().conveyorRuntime;
    const dist = step.absolute ? step.value - rt.positionMm : step.value;
    const speed =
      step.feed && step.feed > 0
        ? Math.max(5, Math.min(CONVEYOR_MAX_SPEED_MM_S, step.feed / 60))
        : rt.moveSpeedMmS;
    return Math.max(180, (Math.abs(dist) / speed) * 1000 + 60);
  }

  if (step.type === "HOME" || step.type === "MOVE_JOINT") {
    const targetJoints = step.type === "HOME" ? HOME_JOINTS : step.joints;
    const maxTravel = targetJoints.reduce(
      (max, q, i) => Math.max(max, Math.abs(q - (startJoints[i] ?? 0))),
      0
    );
    const degPerSec =
      step.type === "MOVE_JOINT" ? Math.max(5, step.feedDegPerMin / 60) : 55;
    return Math.max(280, (maxTravel * 1.65 * 1000) / degPerSec);
  }

  // MOVE_CARTESIAN
  const dx = step.pose.x - startPose.x;
  const dy = step.pose.y - startPose.y;
  const dz = step.pose.z - startPose.z;
  const distMm = Math.hypot(dx, dy, dz);
  const mmPerSec = Math.max(10, step.feedMmPerMin / 60);
  return Math.max(300, (distMm * 1.5 * 1000) / mmPerSec);
}

export const useCodeStore = create<CodeState>((set, get) => ({
  mode: "BLOCKS",
  blocks: createDemoBlocks(),
  scriptText: SAMPLE_SCRIPTS.pickLoop.code,
  gcodeText: SAMPLE_GCODE_PROGRAMS.pickAndPlace.code,

  status: "IDLE",
  compiledSteps: [],
  errors: [],
  activeStepIndex: -1,
  activeLine: null,
  activeBlockId: null,
  stepProgress: 0,
  runtime: null,

  setMode(mode) {
    if (get().status === "RUNNING") get().stop("Switched code editor mode");
    set({ mode, errors: [] });
  },

  setBlocks(blocks) {
    set({ blocks, errors: [] });
    useProjectStore.getState().setDirty(true);
  },

  setScriptText(scriptText) {
    set({ scriptText, errors: [] });
    useProjectStore.getState().setDirty(true);
  },

  setGcodeText(gcodeText) {
    set({ gcodeText, errors: [] });
    useProjectStore.getState().setDirty(true);
  },

  addBlock(block, parentRepeatId) {
    useProjectStore.getState().setDirty(true);
    if (!parentRepeatId) {
      set((s) => ({ blocks: [...s.blocks, block], errors: [] }));
      return;
    }
    set((s) => ({
      blocks: mapBlocksRecursive(s.blocks, (b) =>
        b.id === parentRepeatId && b.kind === "REPEAT"
          ? { ...b, children: [...b.children, block] }
          : b
      ),
      errors: [],
    }));
  },

  updateBlock(id, updater) {
    useProjectStore.getState().setDirty(true);
    set((s) => ({
      blocks: mapBlocksRecursive(s.blocks, (b) => (b.id === id ? updater(b) : b)),
      errors: [],
    }));
  },

  removeBlock(id) {
    useProjectStore.getState().setDirty(true);
    set((s) => ({
      blocks: mapBlocksRecursive(s.blocks, (b) => (b.id === id ? null : b)),
      errors: [],
    }));
  },

  moveBlock(fromIdx, toIdx) {
    useProjectStore.getState().setDirty(true);
    set((s) => {
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= s.blocks.length ||
        toIdx >= s.blocks.length ||
        fromIdx === toIdx
      ) {
        return s;
      }
      const next = s.blocks.slice();
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return { blocks: next };
    });
  },

  loadSampleBlocks() {
    get().stop();
    set({ blocks: createDemoBlocks(), errors: [] });
    logCode("Loaded Demo Pick & Place visual blocks");
  },

  insertCurrentPose(space) {
    const robot = useRobotStore.getState();
    const { mode } = get();

    if (mode === "BLOCKS") {
      if (space === "JOINT") {
        get().addBlock({
          id: nextBlockId(),
          kind: "MOVE_JOINT",
          joints: robot.joints.map((v) => Number(v.toFixed(1))),
          speedDegPerSec: 50,
        });
      } else {
        const p = robot.eePose;
        get().addBlock({
          id: nextBlockId(),
          kind: "MOVE_LINEAR",
          pose: {
            x: Number(p.x.toFixed(1)),
            y: Number(p.y.toFixed(1)),
            z: Number(p.z.toFixed(1)),
            rx: Number(p.rx.toFixed(1)),
            ry: Number(p.ry.toFixed(1)),
            rz: Number(p.rz.toFixed(1)),
          },
          speedMmPerSec: 80,
        });
      }
      return;
    }

    if (mode === "SCRIPT") {
      const line =
        space === "JOINT"
          ? `moveJ(${robot.joints.map((v) => Number(v.toFixed(1))).join(", ")}, speed=50)`
          : `moveL(${[
              robot.eePose.x,
              robot.eePose.y,
              robot.eePose.z,
              robot.eePose.rx,
              robot.eePose.ry,
              robot.eePose.rz,
            ]
              .map((v) => Number(v.toFixed(1)))
              .join(", ")}, speed=80)`;
      set((s) => ({
        scriptText: `${s.scriptText.replace(/\s*$/, "")}\n${line}\n`,
      }));
      return;
    }

    // G-code mode
    const j = robot.joints.map((v) => Number(v.toFixed(2)));
    const p = robot.eePose;
    const gLine =
      space === "JOINT"
        ? `M21 G90 X${j[0]} Y${j[1]} Z${j[2]} A${j[3]} B${j[4]} C${j[5]} F3000`
        : `M20 G90 G1 X${p.x.toFixed(2)} Y${p.y.toFixed(2)} Z${p.z.toFixed(2)} A${p.rx.toFixed(2)} B${p.ry.toFixed(2)} C${p.rz.toFixed(2)} F4800`;
    set((s) => ({
      gcodeText: `${s.gcodeText.replace(/\s*$/, "")}\n${gLine}\n`,
    }));
  },

  convertBlocksToGcode() {
    const res = compileBlocksProgram(get().blocks);
    if (res.errors.length) {
      set({ errors: res.errors });
      return false;
    }
    const gcode = blocksToGcode(get().blocks, useProjectStore.getState().name, useRobotStore.getState().toolType);
    set({ gcodeText: gcode, mode: "GCODE", errors: [] });
    logCode("Converted Visual Blocks → WLKATA G-code", "ok");
    return true;
  },

  convertBlocksToScript() {
    const res = compileBlocksProgram(get().blocks);
    if (res.errors.length) {
      set({ errors: res.errors });
      return false;
    }
    const script = `# Converted from Visual Blocks\n${blocksToScript(get().blocks)}\n`;
    set({ scriptText: script, mode: "SCRIPT", errors: [] });
    logCode("Converted Visual Blocks → Easy Script", "ok");
    return true;
  },

  convertScriptToGcode() {
    const { gcode, errors } = scriptToGcode(
      get().scriptText,
      useProjectStore.getState().name,
      useRobotStore.getState().toolType
    );
    if (errors.length) {
      set({ errors });
      return false;
    }
    set({ gcodeText: gcode, mode: "GCODE", errors: [] });
    logCode("Converted Easy Script → WLKATA G-code", "ok");
    return true;
  },

  getExportableGcode() {
    const { mode, blocks, scriptText, gcodeText } = get();
    const projectName = useProjectStore.getState().name;
    if (mode === "GCODE") return gcodeText;
    const tool = useRobotStore.getState().toolType;
    if (mode === "BLOCKS") return blocksToGcode(blocks, projectName, tool);
    const res = compileScriptProgram(scriptText);
    return res.errors.length ? "" : stepsToGcode(res.steps, projectName, tool);
  },

  compileCurrent() {
    const { mode, blocks, scriptText, gcodeText } = get();
    const res =
      mode === "BLOCKS"
        ? compileBlocksProgram(blocks)
        : mode === "SCRIPT"
          ? compileScriptProgram(scriptText)
          : compileGcodeProgram(gcodeText, useRobotStore.getState().joints, {
              toolType: useRobotStore.getState().toolType,
            });

    set({ compiledSteps: res.steps, errors: res.errors });
    if (res.errors.length) {
      logCode(`Compile failed: Line ${res.errors[0].line} — ${res.errors[0].message}`, "error");
      return false;
    }
    if (!res.steps.length) {
      logCode("Nothing to run: program has 0 steps", "error");
      return false;
    }
    return true;
  },

  runOrPause() {
    const state = get();
    if (state.status === "RUNNING") {
      set({ status: "PAUSED" });
      logCode("Paused program execution");
      return;
    }

    usePathStore.getState().cancelForManualControl();

    if (state.status === "PAUSED" && state.runtime) {
      set({ status: "RUNNING" });
      logCode("Resumed program execution");
      return;
    }

    if (!get().compileCurrent()) {
      set({ status: "ERROR" });
      return;
    }

    const steps = get().compiledSteps;
    const first = steps[0];
    const robot = useRobotStore.getState();
    const durationMs = computeStepDurationMs(first, robot.joints, robot.eePose);

    set({
      status: "RUNNING",
      activeStepIndex: 0,
      activeLine: first.sourceLine ?? null,
      activeBlockId: first.blockId ?? null,
      stepProgress: 0,
      runtime: {
        stepIndex: 0,
        elapsedMs: 0,
        durationMs,
        startJoints: robot.joints.slice(),
        startPose: { ...robot.eePose },
      },
    });
    logCode(`Started ${state.mode} program (${steps.length} steps)`);
  },

  stepOnce() {
    const state = get();
    if (state.status === "RUNNING") {
      set({ status: "PAUSED" });
    }
    if (!state.compiledSteps.length || state.status === "IDLE" || state.status === "COMPLETED") {
      if (!get().compileCurrent()) return;
    }

    const steps = get().compiledSteps;
    const nextIdx =
      get().activeStepIndex < 0 || get().activeStepIndex >= steps.length - 1
        ? 0
        : get().activeStepIndex + 1;
    const step = steps[nextIdx];
    const robot = useRobotStore.getState();

    if (step.type === "HOME") {
      robot.setHome();
    } else if (step.type === "MOVE_JOINT") {
      robot.setJoints(step.joints, { syncIk: true });
    } else if (step.type === "MOVE_CARTESIAN") {
      const viewer = useViewerStore.getState();
      const solved = solveIKPoseCandidate(
        robot.joints,
        pose6DToTargetMatrix(step.pose),
        viewer.ikSolver,
        { dlsConfig: viewer.dls }
      );
      if (solved && solved.err.posMm <= 5) {
        robot.setJoints(solved.q, { syncIk: true });
      } else {
        logCode(`Step ${nextIdx + 1} IK failed for ${step.label}`, "error");
        set({ status: "ERROR" });
        return;
      }
    } else if (step.type === "GRIPPER" || step.type === "CONVEYOR" || step.type === "TOOL") {
      applyInstantStep(step);
    } else if (step.type === "LOG") {
      logCode(step.message, "ok");
    } else if (step.type === "WAIT_SENSOR") {
      const ok = sensorConditionMet(step);
      logCode(`${step.label}: sensor is ${useWorkcellStore.getState().sensorBlocked ? "blocked" : "clear"}${ok ? "" : " (not met yet)"}`);
    }

    set({
      status: "PAUSED",
      activeStepIndex: nextIdx,
      activeLine: step.sourceLine ?? null,
      activeBlockId: step.blockId ?? null,
      stepProgress: 1,
      runtime: null,
    });
    logCode(`Step ${nextIdx + 1}/${steps.length}: ${step.label}`);
  },

  stop(reason) {
    if (get().status === "IDLE") return;
    set({
      status: "IDLE",
      activeStepIndex: -1,
      activeLine: null,
      activeBlockId: null,
      stepProgress: 0,
      runtime: null,
    });
    if (reason) logCode(reason);
  },

  advanceCodeFrame(dtMs) {
    const state = get();
    if (state.status !== "RUNNING" || !state.runtime) return;

    const step = state.compiledSteps[state.runtime.stepIndex];
    if (!step) {
      set({ status: "COMPLETED", runtime: null, activeLine: null, activeBlockId: null });
      return;
    }

    let nextElapsed = Math.min(state.runtime.elapsedMs + Math.max(0, dtMs), state.runtime.durationMs);

    // Wait for the conveyor light sensor: finish as soon as the condition holds, fail on timeout
    if (step.type === "WAIT_SENSOR") {
      if (!useWorkcellStore.getState().sensor.enabled) {
        set({ status: "ERROR", runtime: null });
        logCode(`${step.label}: the light sensor is disabled (Tools → Light Sensor)`, "error");
        return;
      }
      if (sensorConditionMet(step)) {
        nextElapsed = state.runtime.durationMs;
      } else if (nextElapsed >= state.runtime.durationMs) {
        set({ status: "ERROR", runtime: null });
        logCode(`Timeout: ${step.label} (${(step.timeoutMs / 1000).toFixed(0)} s)`, "error");
        return;
      }
    }
    const u = state.runtime.durationMs > 0 ? nextElapsed / state.runtime.durationMs : 1;
    const ease = pathTrajectorySample(u, "QUINTIC").position;
    const robot = useRobotStore.getState();

    // Execute instant side-effects at start of step
    if (state.runtime.elapsedMs === 0) {
      if (step.type === "GRIPPER" || step.type === "CONVEYOR" || step.type === "TOOL") {
        applyInstantStep(step);
      } else if (step.type === "LOG") {
        logCode(step.message, "ok");
      }
    }

    if (step.type === "HOME" || step.type === "MOVE_JOINT") {
      const target = step.type === "HOME" ? HOME_JOINTS : step.joints;
      const q = state.runtime.startJoints.map((q0, i) => q0 + (target[i] - q0) * ease);
      robot.setJoints(q, { syncIk: true });
    } else if (step.type === "MOVE_CARTESIAN") {
      const fromSpatial = fkPoseFromJointsDeg(state.runtime.startJoints);
      const toMat = pose6DToTargetMatrix(step.pose);
      const pos = fromSpatial.p.clone().lerp(toMat.p, ease);
      const quat = fromSpatial.q.clone().slerp(toMat.q, ease);
      const desired = targetMatrixFromPositionQuaternion(pos, quat);
      const viewer = useViewerStore.getState();
      const solved = solveIKPoseCandidate(robot.joints, desired, viewer.ikSolver, {
        dlsConfig: viewer.dls,
      });
      if (!solved || solved.err.posMm > 5 || solved.err.rotDeg > 12) {
        set({ status: "ERROR", runtime: null });
        logCode(`IK failed during step "${step.label}"`, "error");
        return;
      }
      robot.setJoints(solved.q, { syncIk: true });
    }

    if (nextElapsed < state.runtime.durationMs) {
      set({
        stepProgress: u,
        runtime: { ...state.runtime, elapsedMs: nextElapsed },
      });
      return;
    }

    // Advance to next step
    const nextIdx = state.runtime.stepIndex + 1;
    if (nextIdx >= state.compiledSteps.length) {
      set({
        status: "COMPLETED",
        activeStepIndex: state.compiledSteps.length - 1,
        activeLine: null,
        activeBlockId: null,
        stepProgress: 1,
        runtime: null,
      });
      logCode("Program execution finished!", "ok");
      return;
    }

    const nextStep = state.compiledSteps[nextIdx];
    const nowRobot = useRobotStore.getState();
    const nextDurationMs = computeStepDurationMs(nextStep, nowRobot.joints, nowRobot.eePose);
    set({
      activeStepIndex: nextIdx,
      activeLine: nextStep.sourceLine ?? null,
      activeBlockId: nextStep.blockId ?? null,
      stepProgress: 0,
      runtime: {
        stepIndex: nextIdx,
        elapsedMs: 0,
        durationMs: nextDurationMs,
        startJoints: nowRobot.joints.slice(),
        startPose: fkPose6DFromJointsDeg(nowRobot.joints),
      },
    });
  },
}));
