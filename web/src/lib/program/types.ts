import type { Pose6D } from "@/lib/kinematics/constants";

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

export type ProgramStep =
  | MoveJointStep
  | MoveCartesianStep
  | WaitStep
  | GripperStep
  | HomeStep
  | LogStep;

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
  | { id: string; kind: "REPEAT"; count: number; children: ProgramBlock[] };
