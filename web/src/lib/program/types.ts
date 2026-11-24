import type { Pose6D } from "@/lib/kinematics/constants";
import type { ToolType } from "@/lib/tools/toolDefs";

export type CodeEditorMode = "BLOCKS" | "SCRIPT" | "GCODE";
export type GripperState = "OPEN" | "CLOSE";

export interface MoveJointStep {
  type: "MOVE_JOINT";
  joints: number[];
  feedDegPerMin: number;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

export interface MoveCartesianStep {
  type: "MOVE_CARTESIAN";
  pose: Pose6D;
  interpolation: "rapid" | "linear";
  feedMmPerMin: number;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

export interface WaitStep {
  type: "WAIT";
  durationMs: number;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

export interface GripperStep {
  type: "GRIPPER";
  state: GripperState;
  pwm: number;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

export interface HomeStep {
  type: "HOME";
  sourceLine?: number;
  blockId?: string;
  label: string;
}

export interface LogStep {
  type: "LOG";
  message: string;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

/** Conveyor belt: MOVE = D-axis positional move (G90/G91 D), SPEED = MS4220 continuous speed (G6 F). */
export interface ConveyorStep {
  type: "CONVEYOR";
  mode: "MOVE" | "SPEED";
  /** MOVE: distance / target (mm). SPEED: percent -100..100. */
  value: number;
  absolute?: boolean;
  feed?: number;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

/** Changes the mounted end-effector. */
export interface ToolStep {
  type: "TOOL";
  tool: ToolType;
  sourceLine?: number;
  blockId?: string;
  label: string;
}

export type ProgramStep =
  | MoveJointStep
  | MoveCartesianStep
  | WaitStep
  | GripperStep
  | HomeStep
  | LogStep
  | ConveyorStep
  | ToolStep;

export interface CompileError {
  line: number;
  message: string;
}

export interface CompileResult {
  steps: ProgramStep[];
  errors: CompileError[];
  warnings: string[];
}

export type ProgramBlock =
  | { id: string; kind: "HOME" }
  | { id: string; kind: "MOVE_JOINT"; joints: number[]; speedDegPerSec: number }
  | { id: string; kind: "MOVE_LINEAR"; pose: Pose6D; speedMmPerSec: number }
  | { id: string; kind: "WAIT"; seconds: number }
  | { id: string; kind: "GRIPPER"; state: GripperState; pwm: number }
  | { id: string; kind: "CONVEYOR"; mode: "MOVE" | "SPEED"; value: number }
  | { id: string; kind: "TOOL"; tool: ToolType }
  | { id: string; kind: "REPEAT"; count: number; children: ProgramBlock[] };
