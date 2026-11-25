import type { JointLimit, MdhParam, WorkspaceConfig } from "@/lib/kinematics/constants";
import type { ToolType } from "@/lib/tools/toolDefs";

export type RobotModelId = "mirobot" | "xarm2";

/** Which closed-form IK the "ANALYTIC" solver (and the CONSTRAINED seed) uses. */
export type AnalyticIkKind = "MIROBOT_6DOF" | "PLANAR_5DOF";

/** How the simulator talks to the physical robot. */
export type HardwareDriverKind = "WLKATA_RS485" | "HIWONDER_BUS_SERVO";

/** One bus servo driving one simulator joint (Hiwonder xArm family). */
export interface BusServoJointMap {
  /** Index into the 6-element joint array (0 = J1). */
  jointIndex: number;
  /** Bus servo ID on the controller board. */
  servoId: number;
  /** +1 when servo angle grows with the joint angle, -1 when it is mirrored. */
  direction: 1 | -1;
  /** Servo angle (deg) reported when the simulator joint is at 0°. */
  offsetDeg: number;
}

export interface BusServoGripperMap {
  servoId: number;
  /** Raw servo position (0..1000) for an open / closed gripper. */
  openPos: number;
  closePos: number;
}

export interface RobotProfile {
  id: RobotModelId;
  name: string;
  vendor: string;
  /** One-line summary for the robot-selection screen. */
  summary: string;
  /** Joints that actually move (Mirobot 6, xArm 5). Joints past this are locked at 0. */
  activeJointCount: number;
  mdhParams: readonly MdhParam[];
  jointLimits: readonly JointLimit[];
  jointLabels: readonly string[];
  home: readonly number[];
  /** Quick poses offered in the Jog panel. */
  jogPresets: ReadonlyArray<{ label: string; joints: readonly number[] }>;
  workspace: WorkspaceConfig;
  /** Approximate max horizontal reach of the flange, shown on the selection screen (mm). */
  reachMm: number;
  analyticIk: AnalyticIkKind;
  /** "stl" loads /models/<dir>/<link>.stl, "primitive" builds boxes from the MDH table. */
  meshSource: "stl" | "primitive";
  stlDir?: string;
  meshColors: Record<string, number>;
  allowedTools: readonly ToolType[];
  defaultTool: ToolType;
  hardwareDriver: HardwareDriverKind;
  busServos?: {
    joints: readonly BusServoJointMap[];
    gripper: BusServoGripperMap;
  };
}
