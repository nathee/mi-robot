import {
  DEFAULT_WORKSPACE,
  HOME_JOINTS,
  JOINT_LIMITS,
  type Pose6D,
} from "@/lib/kinematics/constants";
import { checkWorkspaceXYZ, fkPose6DFromJointsDeg } from "@/lib/kinematics/fk";
import { formatWlkataCartesianMove, formatWlkataJointMove } from "@/lib/path/gcode";
import type { CompileError, CompileResult, ProgramStep } from "./types";
import { APP_NAME } from "@/lib/appConfig";
import { DEFAULT_TOOL, interpretToolCommand, TOOL_DEFS, toolCodeFor, type ToolType } from "@/lib/tools/toolDefs";
import { t } from "@/lib/i18n";

const NUMBER_PATTERN = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][-+]?\\d+)?";
const WORD_PATTERN = new RegExp(`([A-Z])\\s*=?\\s*(${NUMBER_PATTERN})`, "gi");

function stripComments(line: string): string {
  return line.replace(/\([^)]*\)/g, " ").split(";", 1)[0].trim();
}

function extractWords(code: string): Array<{ letter: string; value: number }> {
  const out: Array<{ letter: string; value: number }> = [];
  WORD_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_PATTERN.exec(code))) {
    const val = Number(m[2]);
    if (Number.isFinite(val)) {
      out.push({ letter: m[1].toUpperCase(), value: val });
    }
  }
  return out;
}

/**
 * Compiles extended WLKATA Mirobot G-code into executable ProgramStep[].
 * Supports: M21 (joint), M20 (cartesian), G0/G1, G90/G91, G4 (dwell), M3/M4/M5 (tool, interpreted
 * by the mounted end-effector), D-axis conveyor moves, G6 F (MS4220 conveyor speed), $H/G28 (home).
 */
export function compileGcodeProgram(
  source: string,
  initialJoints: readonly number[] = HOME_JOINTS,
  options: { toolType?: ToolType } = {}
): CompileResult {
  const tool = options.toolType ?? DEFAULT_TOOL;
  const steps: ProgramStep[] = [];
  const errors: CompileError[] = [];
  const warnings: string[] = [];

  let space: "" | "joint" | "cartesian" = "";
  let coordMode: "absolute" | "relative" = "absolute";
  let interp: "rapid" | "linear" = "linear";
  let currentJoints = initialJoints.slice();
  let currentPose: Pose6D = fkPose6DFromJointsDeg(currentJoints);

  const lines = String(source ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    const code = stripComments(rawLine).toUpperCase();
    if (!code || code === "%") return;

    // Homing command ($H or G28)
    if (code === "$H" || code.startsWith("$H ")) {
      currentJoints = HOME_JOINTS.slice();
      currentPose = fkPose6DFromJointsDeg(currentJoints);
      steps.push({ type: "HOME", sourceLine: lineNum, label: "Home ($H)" });
      return;
    }

    const words = extractWords(code);
    if (!words.length) {
      errors.push({ line: lineNum, message: t("err.gcodeSyntax", { text: rawLine.trim() }) });
      return;
    }

    const mCodes = words.filter((w) => w.letter === "M").map((w) => w.value);
    const gCodes = words.filter((w) => w.letter === "G").map((w) => w.value);

    // G28 Home
    if (gCodes.includes(28)) {
      currentJoints = HOME_JOINTS.slice();
      currentPose = fkPose6DFromJointsDeg(currentJoints);
      steps.push({ type: "HOME", sourceLine: lineNum, label: "Home (G28)" });
      return;
    }

    // G4 Dwell / Delay (P = seconds in WLKATA/Grbl, or S = seconds)
    if (gCodes.includes(4)) {
      const pVal = words.find((w) => w.letter === "P")?.value;
      const sVal = words.find((w) => w.letter === "S")?.value;
      const sec = pVal ?? sVal ?? 0.5;
      if (sec < 0 || sec > 60) {
        errors.push({ line: lineNum, message: t("err.g4Range") });
        return;
      }
      steps.push({
        type: "WAIT",
        durationMs: Math.round(sec * 1000),
        sourceLine: lineNum,
        label: `Wait ${sec.toFixed(2)}s`,
      });
      return;
    }

    // M3 / M4 / M5: tool action, meaning depends on the mounted end-effector
    if (mCodes.includes(3) || mCodes.includes(4) || mCodes.includes(5)) {
      const codeKind = mCodes.includes(3) ? "M3" : mCodes.includes(4) ? "M4" : "M5";
      const value =
        codeKind === "M3"
          ? words.find((w) => w.letter === "S")?.value
          : codeKind === "M4"
            ? words.find((w) => w.letter === "E")?.value
            : undefined;
      const res = interpretToolCommand(tool, codeKind, value);
      steps.push({
        type: "GRIPPER",
        state: res.state,
        pwm: res.state === "CLOSE" ? Math.max(1, res.pwm) : 0,
        sourceLine: lineNum,
        label: res.label,
      });
      return;
    }

    // G6 F<-100..100>: MS4220 conveyor continuous speed
    if (gCodes.includes(6)) {
      const f = Math.max(-100, Math.min(100, words.find((w) => w.letter === "F")?.value ?? 0));
      steps.push({
        type: "CONVEYOR",
        mode: "SPEED",
        value: f,
        sourceLine: lineNum,
        label: f === 0 ? "Conveyor stop (G6 F0)" : `Conveyor speed ${f}% (G6 F${f})`,
      });
      return;
    }

    // Modal state updates
    if (mCodes.includes(20)) space = "cartesian";
    if (mCodes.includes(21)) space = "joint";
    if (gCodes.includes(90)) coordMode = "absolute";
    if (gCodes.includes(91)) coordMode = "relative";
    if (gCodes.includes(0)) interp = "rapid";
    if (gCodes.includes(1)) interp = "linear";

    const axes: Partial<Record<"x" | "y" | "z" | "a" | "b" | "c", number>> = {};
    words.forEach(({ letter, value }) => {
      if ("XYZABC".includes(letter)) {
        axes[letter.toLowerCase() as keyof typeof axes] = value;
      }
    });

    if (!Object.keys(axes).length) {
      // Conveyor / sliding rail 7th axis: G90 G00 D100 / G91 G01 D-20
      const dWord = words.find((w) => w.letter === "D");
      if (dWord) {
        const absolute = coordMode === "absolute";
        steps.push({
          type: "CONVEYOR",
          mode: "MOVE",
          value: dWord.value,
          absolute,
          feed: words.find((w) => w.letter === "F")?.value,
          sourceLine: lineNum,
          label: absolute ? `Conveyor to D${dWord.value}` : `Conveyor by D${dWord.value}`,
        });
      }
      return;
    }

    if (!space) {
      errors.push({
        line: lineNum,
        message: t("err.missingMode"),
      });
      return;
    }

    const feed = words.find((w) => w.letter === "F")?.value;

    if (space === "joint") {
      const axisMap: Record<keyof typeof axes, number> = { x: 0, y: 1, z: 2, a: 3, b: 4, c: 5 };
      const next = currentJoints.slice();
      (Object.keys(axes) as Array<keyof typeof axes>).forEach((ax) => {
        const idxJ = axisMap[ax];
        const v = axes[ax]!;
        next[idxJ] = coordMode === "relative" ? next[idxJ] + v : v;
      });

      for (let i = 0; i < 6; i++) {
        const lim = JOINT_LIMITS[i];
        if (next[i] < lim.min - 1e-4 || next[i] > lim.max + 1e-4) {
          errors.push({
            line: lineNum,
            message: t("err.jointLimits", { j: i + 1, v: next[i].toFixed(1), min: lim.min, max: lim.max }),
          });
          return;
        }
      }

      currentJoints = next;
      currentPose = fkPose6DFromJointsDeg(next);
      steps.push({
        type: "MOVE_JOINT",
        joints: next,
        feedDegPerMin: feed && feed > 0 ? feed : 2700,
        sourceLine: lineNum,
        label: `MoveJ [${next.map((n) => n.toFixed(0)).join(", ")}]`,
      });
    } else {
      const poseMap: Record<keyof typeof axes, keyof Pose6D> = {
        x: "x",
        y: "y",
        z: "z",
        a: "rx",
        b: "ry",
        c: "rz",
      };
      const nextPose: Pose6D = { ...currentPose };
      (Object.keys(axes) as Array<keyof typeof axes>).forEach((ax) => {
        const k = poseMap[ax];
        const v = axes[ax]!;
        nextPose[k] = coordMode === "relative" ? nextPose[k] + v : v;
      });

      const ws = checkWorkspaceXYZ(nextPose.x, nextPose.y, nextPose.z, DEFAULT_WORKSPACE);
      if (!ws.ok) {
        errors.push({ line: lineNum, message: ws.message });
        return;
      }

      currentPose = nextPose;
      steps.push({
        type: "MOVE_CARTESIAN",
        pose: nextPose,
        interpolation: interp,
        feedMmPerMin: feed && feed > 0 ? feed : 4800,
        sourceLine: lineNum,
        label: `MoveL (${nextPose.x.toFixed(0)}, ${nextPose.y.toFixed(0)}, ${nextPose.z.toFixed(0)})`,
      });
    }
  });

  if (!steps.length && !errors.length) {
    warnings.push(t("warn.noCommandsProgram"));
  }

  return { steps, errors, warnings };
}

/**
 * Formats any compiled ProgramStep[] back to clean WLKATA G-code text.
 */
export function stepsToGcode(
  steps: readonly ProgramStep[],
  projectName = "Mirobot Program",
  toolType?: ToolType
): string {
  const lines: string[] = [
    `; PROJECT: ${projectName}`,
    `; Generated by ${APP_NAME}`,
  ];
  let tool = toolType;
  if (tool) lines.push(`; TOOL: ${TOOL_DEFS[tool].label}`);

  steps.forEach((step) => {
    switch (step.type) {
      case "HOME":
        lines.push("M21 G90 X0 Y0 Z0 A0 B0 C0 F2700 ; Home");
        break;
      case "MOVE_JOINT":
        lines.push(formatWlkataJointMove(step.joints, step.feedDegPerMin));
        break;
      case "MOVE_CARTESIAN":
        lines.push(formatWlkataCartesianMove(step.pose, step.feedMmPerMin, step.interpolation));
        break;
      case "WAIT":
        lines.push(`G4 P${(step.durationMs / 1000).toFixed(2)}`);
        break;
      case "GRIPPER":
        if (tool && tool !== "NONE") lines.push(toolCodeFor(tool, step.state));
        else lines.push(step.state === "CLOSE" ? `M3 S${step.pwm || 1000}` : "M5");
        break;
      case "WAIT_SENSOR":
        lines.push(`; wait for light sensor ${step.until === "CLEAR" ? "clear" : "box"} (simulator / PLC logic)`);
        break;
      case "CONVEYOR":
        if (step.mode === "AUTO") {
          lines.push(`; conveyor auto-feed ${step.value > 0 ? `ON ${step.value}% (stop at light sensor)` : "OFF"}`);
        } else if (step.mode === "SPEED") {
          lines.push(`G6 F${Math.round(step.value)}`);
        } else {
          lines.push(`${step.absolute ? "G90" : "G91"} G01 D${Number(step.value.toFixed(2))}${step.feed ? ` F${step.feed}` : ""}`);
        }
        break;
      case "TOOL":
        // Skip when the header already announced this tool (avoids a duplicate "; TOOL:" line)
        if (step.tool !== tool) lines.push(`; TOOL: ${TOOL_DEFS[step.tool].label}`);
        tool = step.tool;
        break;
      case "LOG":
        lines.push(`; ${step.message}`);
        break;
    }
  });

  return `${lines.join("\n")}\n`;
}

export const SAMPLE_GCODE_PROGRAMS: Record<string, { name: string; code: string }> = {
  conveyorSuction: {
    name: "Conveyor Pick (Suction, D-axis)",
    code: `; PROJECT: Conveyor Pick & Place
; Tools tab: select "Suction Cup" and load the "Conveyor Feed" workcell.
; M3 S1000 = suck, M3 S500 = blow (WLKATA pump). G91 G01 D = conveyor (7th axis).
M21 G90 X0 Y0 Z0 A0 B0 C0 F2700
M3 S0
G91 G01 D-80 F1800 ; bring box to the end stop
M20 G90 G1 X132.5 Y-150 Z130 A0 B0 C0 F5400
M20 G90 G1 X132.5 Y-150 Z86 A0 B0 C0 F2400
M3 S1000 ; suck
G4 P0.3
M20 G90 G1 X132.5 Y-150 Z130 A0 B0 C0 F5400
M20 G90 G1 X200 Y110 Z110 A0 B0 C0 F6000
M20 G90 G1 X200 Y110 Z47 A0 B0 C0 F2400
M3 S500 ; blow / release
G4 P0.3
M3 S0
M20 G90 G1 X200 Y110 Z110 A0 B0 C0 F5400
M21 G90 X0 Y0 Z0 A0 B0 C0 F3000
`,
  },
  pickAndPlace: {
    name: "Pick & Place (Gripper)",
    code: `; PROJECT: Pick & Place Demo
; Move to Home
M21 G90 X0 Y0 Z0 A0 B0 C0 F2700
M5 ; Open gripper

; Approach pick position
M21 G90 X-35 Y22 Z-28 A0 B-15 C0 F3000
G4 P0.4
M3 S1000 ; Close gripper
G4 P0.4

; Lift and move to place position
M21 G90 X15 Y5 Z-10 A10 B-20 C20 F3200
M21 G90 X45 Y26 Z-32 A0 B-12 C-20 F3000
G4 P0.4
M5 ; Release object
G4 P0.4

; Return Home
M21 G90 X0 Y0 Z0 A0 B0 C0 F3000
`,
  },
  linearSquare: {
    name: "Cartesian Square (M20)",
    code: `; PROJECT: Linear Square
M21 G90 X0 Y0 Z0 A0 B0 C0 F3000
M20 G90 G1 X190 Y-50 Z190 A0 B0 C0 F4800
M20 G90 G1 X240 Y-50 Z190 A0 B0 C0 F4800
M20 G90 G1 X240 Y50 Z190 A0 B0 C0 F4800
M20 G90 G1 X190 Y50 Z190 A0 B0 C0 F4800
M20 G90 G1 X190 Y-50 Z190 A0 B0 C0 F4800
M21 G90 X0 Y0 Z0 A0 B0 C0 F3000
`,
  },
};
