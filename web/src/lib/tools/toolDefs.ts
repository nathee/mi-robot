import type { GripperState } from "@/lib/program/types";

/**
 * End-effectors of the WLKATA Mirobot Advanced Kit.
 * TCP offsets are approximate (measured outward from the link6 flange, along link6 -Z)
 * and can be tuned here without touching any other code.
 */
export type ToolType =
  | "NONE"
  | "SUCTION"
  | "TWO_FINGER"
  | "THREE_FINGER_SOFT"
  | "MICRO_SERVO"
  | "XARM_GRIPPER";

export const TOOL_TYPES: readonly ToolType[] = [
  "NONE",
  "SUCTION",
  "TWO_FINGER",
  "THREE_FINGER_SOFT",
  "MICRO_SERVO",
  "XARM_GRIPPER",
];

export const DEFAULT_TOOL: ToolType = "TWO_FINGER";

export interface ToolDef {
  type: ToolType;
  label: string;
  shortLabel: string;
  description: string;
  /** Tool centre point distance from the flange along link6 +Z (mm). */
  tcpOffsetMm: number;
  /** Max horizontal distance (mm) between TCP and object centre to grasp it. */
  graspRadiusMm: number;
  /** Max vertical gap (mm) between TCP and the object's top face to grasp it. */
  graspHeightTolMm: number;
  /** Largest object edge (mm) the tool can hold. 0 = cannot grasp. */
  maxObjectSizeMm: number;
  /** G-code sent for grab / release (used by exporters and the Tool panel). */
  grabCode: string;
  releaseCode: string;
  grabLabel: string;
  releaseLabel: string;
}

export const TOOL_DEFS: Record<ToolType, ToolDef> = {
  NONE: {
    type: "NONE",
    label: "No Tool (Flange)",
    shortLabel: "Flange",
    description: "No end-effector: the TCP sits on the link6 flange.",
    tcpOffsetMm: 0,
    graspRadiusMm: 0,
    graspHeightTolMm: 0,
    maxObjectSizeMm: 0,
    grabCode: "M3 S1000",
    releaseCode: "M5",
    grabLabel: "On",
    releaseLabel: "Off",
  },
  SUCTION: {
    type: "SUCTION",
    label: "Suction Cup",
    shortLabel: "Suction",
    description: "Vacuum pump + suction cup. M3 S1000 = suck, M3 S500 = blow, M3 S0 = off.",
    tcpOffsetMm: 52,
    graspRadiusMm: 15,
    graspHeightTolMm: 6,
    maxObjectSizeMm: 60,
    grabCode: "M3 S1000",
    releaseCode: "M3 S500",
    grabLabel: "Suck",
    releaseLabel: "Blow",
  },
  TWO_FINGER: {
    type: "TWO_FINGER",
    label: "Two-Finger Gripper",
    shortLabel: "2-Finger",
    description: "Pneumatic parallel gripper. M4 E65 = grab, M4 E40 = open.",
    tcpOffsetMm: 60,
    graspRadiusMm: 10,
    graspHeightTolMm: 18,
    maxObjectSizeMm: 28,
    grabCode: "M4 E65",
    releaseCode: "M4 E40",
    grabLabel: "Grab",
    releaseLabel: "Open",
  },
  THREE_FINGER_SOFT: {
    type: "THREE_FINGER_SOFT",
    label: "Three-Finger Soft Gripper",
    shortLabel: "Soft 3F",
    description: "Pneumatic soft gripper. M3 S1000 = inflate (grab), M3 S500 = deflate (open).",
    tcpOffsetMm: 75,
    graspRadiusMm: 14,
    graspHeightTolMm: 22,
    maxObjectSizeMm: 45,
    grabCode: "M3 S1000",
    releaseCode: "M3 S500",
    grabLabel: "Grab",
    releaseLabel: "Open",
  },
  MICRO_SERVO: {
    type: "MICRO_SERVO",
    label: "Micro Servo Gripper",
    shortLabel: "Servo",
    description: "PWM micro-servo gripper. M3 S40 = grab, M3 S60 = open.",
    tcpOffsetMm: 55,
    graspRadiusMm: 8,
    graspHeightTolMm: 14,
    maxObjectSizeMm: 22,
    grabCode: "M3 S40",
    releaseCode: "M3 S60",
    grabLabel: "Grab",
    releaseLabel: "Open",
  },
  XARM_GRIPPER: {
    type: "XARM_GRIPPER",
    label: "xArm Servo Gripper",
    shortLabel: "xArm Grip",
    description: "Hiwonder xArm claw on an HTS-16L bus servo (servo ID 1), opens to 55 mm. M3 S40 = grab, M3 S60 = open.",
    // Grasp centre ~15 mm inside the finger tips (tips are 90 mm past the flange)
    tcpOffsetMm: 75,
    graspRadiusMm: 12,
    graspHeightTolMm: 20,
    maxObjectSizeMm: 50,
    grabCode: "M3 S40",
    releaseCode: "M3 S60",
    grabLabel: "Grab",
    releaseLabel: "Open",
  },
};

export function isToolType(value: unknown): value is ToolType {
  return typeof value === "string" && (TOOL_TYPES as readonly string[]).includes(value);
}

export type ToolCommandCode = "M3" | "M4" | "M5";

export interface ToolCommandResult {
  /** CLOSE = holding / sucking, OPEN = released. */
  state: GripperState;
  /** Raw PWM / E value as received. */
  pwm: number;
  label: string;
}

/**
 * Interprets an M3 / M4 / M5 command according to the mounted tool.
 * The same G-code means different things for a vacuum pump and a servo gripper
 * (WLKATA SDK: pump() sends M3 S1000/S500/S0, gripper() sends M3 S40/S60/S0).
 */
export function interpretToolCommand(
  tool: ToolType,
  code: ToolCommandCode,
  value?: number
): ToolCommandResult {
  if (code === "M5") {
    return { state: "OPEN", pwm: 0, label: `${TOOL_DEFS[tool].shortLabel} OFF (M5)` };
  }

  if (code === "M4") {
    const e = clampInt(value ?? 65, 0, 100);
    const close = e >= 55;
    return {
      state: close ? "CLOSE" : "OPEN",
      pwm: e,
      label: close ? `Gripper GRAB (M4 E${e})` : `Gripper OPEN (M4 E${e})`,
    };
  }

  const s = clampInt(value ?? 1000, 0, 1000);
  if (s === 0) {
    return { state: "OPEN", pwm: 0, label: tool === "SUCTION" ? "Pump OFF (M3 S0)" : `${TOOL_DEFS[tool].shortLabel} OFF (M3 S0)` };
  }

  switch (tool) {
    case "SUCTION":
      return s >= 700
        ? { state: "CLOSE", pwm: s, label: `Suction ON (M3 S${s})` }
        : { state: "OPEN", pwm: s, label: `Air Blow / Release (M3 S${s})` };
    case "MICRO_SERVO":
    case "XARM_GRIPPER":
      return s <= 50
        ? { state: "CLOSE", pwm: s, label: `Servo Gripper GRAB (M3 S${s})` }
        : { state: "OPEN", pwm: s, label: `Servo Gripper OPEN (M3 S${s})` };
    case "TWO_FINGER":
    case "THREE_FINGER_SOFT":
    case "NONE":
    default:
      // Pneumatic tools: high pressure closes, blow opens. Small PWM values keep
      // compatibility with the Mirobot.cpp servo gripper convention (S40 grab / S60 open).
      if (s >= 700) return { state: "CLOSE", pwm: s, label: `Pump ON / Grab (M3 S${s})` };
      if (s >= 400) return { state: "OPEN", pwm: s, label: `Air Blow / Release (M3 S${s})` };
      if (s <= 50) return { state: "CLOSE", pwm: s, label: `Gripper GRAB (M3 S${s})` };
      return { state: "OPEN", pwm: s, label: `Gripper OPEN (M3 S${s})` };
  }
}

/** G-code line that performs grab / release with the given tool. */
export function toolCodeFor(tool: ToolType, state: GripperState): string {
  const def = TOOL_DEFS[tool];
  return state === "CLOSE" ? def.grabCode : def.releaseCode;
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
