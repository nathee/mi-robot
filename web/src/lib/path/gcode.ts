import { MathUtils } from "three";
import {
  DEFAULT_PATH_PROGRAM_SETTINGS,
  DEFAULT_WORKSPACE,
  HOME_JOINTS,
  JOINT_LIMITS,
  type IkSolverType,
  type PathProgramSettings,
  type PathTarget,
  type PathTargetGcodeMeta,
  type Pose6D,
} from "../kinematics/constants";
import {
  checkWorkspaceXYZ,
  fkPose6DFromJointsDeg,
  pose6DToTargetMatrix,
} from "../kinematics/fk";
import { solveIKPoseCandidate } from "../kinematics/ik";

const NUMBER_PATTERN = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][-+]?\\d+)?";
const WORD_PATTERN = new RegExp(`([A-Z])\\s*=?\\s*(${NUMBER_PATTERN})`, "gi");
export const WLKATA_GCODE_EXTENSIONS = ["gcode", "nc", "tap", "g"] as const;

export interface ParsedGcodeCommand {
  lineNumber: number;
  raw: string;
  name: string;
  space: "joint" | "cartesian";
  coordinateMode: "absolute" | "relative";
  interpolation: "joint" | "rapid" | "linear";
  axes: Partial<Record<"x" | "y" | "z" | "a" | "b" | "c", number>>;
  feed: number | null;
}

export interface ParsedWlkataGcode {
  projectName: string;
  commands: ParsedGcodeCommand[];
  warnings: string[];
}

export interface PathProgramDocument {
  format: "mirobot-path-program";
  version: 1;
  projectName: string;
  savedAt: string;
  settings: PathProgramSettings;
  repeatCount: number;
  targets: PathTarget[];
}

export interface ParsedPathProgram {
  projectName: string;
  settings: PathProgramSettings;
  repeatCount: number;
  targets: PathTarget[];
  nextId: number;
  warnings: string[];
}

export function isWlkataGcodeFile(filePath = ""): boolean {
  const extension = String(filePath).split(".").pop()?.toLowerCase() ?? "";
  return (WLKATA_GCODE_EXTENSIONS as readonly string[]).includes(extension);
}

function stripInlineComments(line: string): string {
  return line.replace(/\([^)]*\)/g, " ").split(";", 1)[0].trim();
}

function commentText(line: string): string {
  const semicolon = line.indexOf(";");
  if (semicolon >= 0) return line.slice(semicolon + 1).trim();
  const match = line.match(/^\s*\((.*)\)\s*$/);
  return match?.[1]?.trim() ?? "";
}

function targetNameFromComment(comment: string): string {
  const explicit = comment.match(/^TARGET\s*:\s*(.+?)\s*$/i);
  if (explicit) return explicit[1].trim();
  const point = comment.match(/^(P\d+(?:[-_.][A-Z0-9]+)?)\b/i);
  return point?.[1] ?? "";
}

function projectNameFromComment(comment: string): string {
  return comment.match(/^PROJECT\s*:\s*(.+?)\s*$/i)?.[1]?.trim() ?? "";
}

function wordsFromLine(line: string): Array<{ letter: string; value: number }> {
  const words: Array<{ letter: string; value: number }> = [];
  WORD_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_PATTERN.exec(line))) {
    const value = Number(match[2]);
    if (Number.isFinite(value)) {
      words.push({ letter: match[1].toUpperCase(), value });
    }
  }
  return words;
}

export function parseWlkataGcode(content: string): ParsedWlkataGcode {
  const commands: ParsedGcodeCommand[] = [];
  const warnings: string[] = [];
  let projectName = "";
  let pendingTargetName = "";
  let space: "" | "joint" | "cartesian" = "";
  let coordinateMode: "absolute" | "relative" = "absolute";
  let interpolation: "rapid" | "linear" = "rapid";

  String(content ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const lineNumber = index + 1;
      const comment = commentText(rawLine);
      if (comment) {
        projectName ||= projectNameFromComment(comment);
        pendingTargetName ||= targetNameFromComment(comment);
      }

      const code = stripInlineComments(rawLine).toUpperCase();
      if (!code || code === "%") return;

      const words = wordsFromLine(code);
      if (!words.length) return;

      const mCodes = words.filter((w) => w.letter === "M").map((w) => w.value);
      const gCodes = words.filter((w) => w.letter === "G").map((w) => w.value);

      if (mCodes.includes(20)) space = "cartesian";
      if (mCodes.includes(21)) space = "joint";
      if (gCodes.includes(90)) coordinateMode = "absolute";
      if (gCodes.includes(91)) coordinateMode = "relative";
      if (gCodes.includes(0)) interpolation = "rapid";
      if (gCodes.includes(1)) interpolation = "linear";

      const axes: Partial<Record<"x" | "y" | "z" | "a" | "b" | "c", number>> = {};
      words.forEach(({ letter, value }) => {
        if ("XYZABC".includes(letter)) {
          axes[letter.toLowerCase() as "x" | "y" | "z" | "a" | "b" | "c"] = value;
        }
      });
      if (!Object.keys(axes).length) return;

      if (!space) {
        warnings.push(`Line ${lineNumber}: axis values ignored because M20/M21 is missing`);
        return;
      }

      const feed = words.find((w) => w.letter === "F")?.value ?? null;
      commands.push({
        lineNumber,
        raw: rawLine,
        name: pendingTargetName,
        space,
        coordinateMode,
        interpolation: space === "joint" ? "joint" : interpolation,
        axes,
        feed: feed !== null && Number.isFinite(feed) && feed > 0 ? feed : null,
      });
      pendingTargetName = "";
    });

  if (!commands.length) {
    throw new Error("No WLKATA M20/M21 motion commands were found");
  }
  return { projectName, commands, warnings };
}

function formatNumber(value: number, decimals = 3): string {
  const rounded = Number(Number(value).toFixed(decimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function positiveInteger(value: number, fallback: number): number {
  const n = Number(value);
  return Math.max(1, Math.round(Number.isFinite(n) ? n : fallback));
}

export function formatWlkataJointMove(joints: readonly number[], feedDegPerMin: number): string {
  const axes = ["X", "Y", "Z", "A", "B", "C"];
  const values = axes.map((axis, index) => `${axis}${formatNumber(joints[index] ?? 0)}`);
  return `M21 G90 ${values.join(" ")} F${positiveInteger(feedDegPerMin, 2700)}`;
}

export function formatWlkataCartesianMove(
  pose: Pose6D,
  feedMmPerMin: number,
  interpolation: "rapid" | "linear" = "linear"
): string {
  const gCode = interpolation === "rapid" ? "G0" : "G1";
  const values: Array<[string, number]> = [
    ["X", pose.x],
    ["Y", pose.y],
    ["Z", pose.z],
    ["A", pose.rx],
    ["B", pose.ry],
    ["C", pose.rz],
  ];
  const encoded = values.map(([axis, val]) => `${axis}${formatNumber(val)}`).join(" ");
  return `M20 G90 ${gCode} ${encoded} F${positiveInteger(feedMmPerMin, 4800)}`;
}

function clampProgramNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return MathUtils.clamp(n, min, max);
}

export function normalizePathProgramSettings(
  settings: Partial<PathProgramSettings> = {}
): PathProgramSettings {
  return {
    motionType:
      settings.motionType && ["MOVEJ", "MOVEL", "MOVEC"].includes(settings.motionType)
        ? settings.motionType
        : DEFAULT_PATH_PROGRAM_SETTINGS.motionType,
    trajectoryProfile:
      settings.trajectoryProfile &&
      ["LINEAR", "CUBIC", "QUINTIC", "TRAPEZOIDAL", "SCURVE"].includes(settings.trajectoryProfile)
        ? settings.trajectoryProfile
        : DEFAULT_PATH_PROGRAM_SETTINGS.trajectoryProfile,
    durationMode:
      settings.durationMode && ["AUTO", "FIXED"].includes(settings.durationMode)
        ? settings.durationMode
        : DEFAULT_PATH_PROGRAM_SETTINGS.durationMode,
    speedDegPerSec: clampProgramNumber(settings.speedDegPerSec, 45, 5, 180),
    maxAccelerationDegPerSec2: clampProgramNumber(
      settings.maxAccelerationDegPerSec2,
      180,
      10,
      2000
    ),
    linearSpeedMmPerSec: clampProgramNumber(settings.linearSpeedMmPerSec, 80, 5, 500),
    linearAccelerationMmPerSec2: clampProgramNumber(
      settings.linearAccelerationMmPerSec2,
      250,
      10,
      3000
    ),
    orientationSpeedDegPerSec: clampProgramNumber(settings.orientationSpeedDegPerSec, 45, 5, 180),
    ikBranchMode:
      settings.ikBranchMode && ["CLOSEST", "ELBOW_UP", "ELBOW_DOWN"].includes(settings.ikBranchMode)
        ? settings.ikBranchMode
        : DEFAULT_PATH_PROGRAM_SETTINGS.ikBranchMode,
    fixedDurationSec: clampProgramNumber(settings.fixedDurationSec, 2, 0.25, 30),
    trapezoidAccelPercent: clampProgramNumber(settings.trapezoidAccelPercent, 25, 10, 45),
    monitorJoint: Math.round(clampProgramNumber(settings.monitorJoint, 0, 0, 5)),
  };
}

function normalizedTargetGcode(source: unknown): PathTargetGcodeMeta | null {
  if (!source || typeof source !== "object") return null;
  const s = source as { space?: string; interpolation?: string };
  if (s.space !== "joint" && s.space !== "cartesian") return null;
  return {
    space: s.space,
    interpolation:
      s.interpolation === "rapid" ? "rapid" : s.space === "joint" ? "joint" : "linear",
  };
}

function validatedPathJoints(joints: unknown): number[] | null {
  if (!Array.isArray(joints) || joints.length !== 6) return null;
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const n = Number(joints[i]);
    const limit = JOINT_LIMITS[i];
    if (!Number.isFinite(n) || n < limit.min - 1e-6 || n > limit.max + 1e-6) {
      return null;
    }
    out.push(MathUtils.clamp(n, limit.min, limit.max));
  }
  return out;
}

export function clonePathTarget(target: PathTarget): PathTarget {
  return {
    id: target.id,
    name: target.name,
    joints: target.joints.slice(),
    x: target.x,
    y: target.y,
    z: target.z,
    rx: target.rx,
    ry: target.ry,
    rz: target.rz,
    ...(target.gcode ? { gcode: { ...target.gcode } } : {}),
  };
}

export function serializePathProgramJson(params: {
  projectName: string;
  settings: PathProgramSettings;
  repeatCount: number;
  targets: readonly PathTarget[];
}): string {
  const doc: PathProgramDocument = {
    format: "mirobot-path-program",
    version: 1,
    projectName: params.projectName,
    savedAt: new Date().toISOString(),
    settings: normalizePathProgramSettings(params.settings),
    repeatCount: Math.round(clampProgramNumber(params.repeatCount, 1, 1, 100)),
    targets: params.targets.map(clonePathTarget),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parsePathProgramJson(content: string): ParsedPathProgram {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(String(content || ""));
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("Path program must be a JSON object");
  }
  if (doc.format && doc.format !== "mirobot-path-program") {
    throw new Error(`Unsupported path program format: ${String(doc.format)}`);
  }
  if (Number(doc.version || 1) > 1) {
    throw new Error(`Path program version ${String(doc.version)} is not supported`);
  }
  if (!Array.isArray(doc.targets)) {
    throw new Error("Path program has no target list");
  }
  if (doc.targets.length > 500) {
    throw new Error("Path program exceeds the 500 target limit");
  }

  const hasProjectName = Object.prototype.hasOwnProperty.call(doc, "projectName");
  const projectName = hasProjectName ? String(doc.projectName ?? "").trim() : "Untitled Project";
  if (!projectName) throw new Error("Project name cannot be empty");

  const usedIds = new Set<number>();
  const targets: PathTarget[] = doc.targets.map((rawSource, index) => {
    const source = rawSource as Record<string, unknown>;
    const name = String(source?.name ?? "").trim();
    if (!name) throw new Error(`Target ${index + 1} name cannot be empty`);

    const joints = validatedPathJoints(source?.joints);
    if (!joints) throw new Error(`Target ${name} contains invalid or out-of-limit joints`);

    const pose = fkPose6DFromJointsDeg(joints);
    const workspace = checkWorkspaceXYZ(pose.x, pose.y, pose.z, DEFAULT_WORKSPACE);
    if (!workspace.ok) {
      throw new Error(`Target ${name} is outside workspace: ${workspace.message}`);
    }

    let id = Math.trunc(Number(source?.id));
    if (!Number.isFinite(id) || id < 1 || usedIds.has(id)) id = index + 1;
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);

    const gcode = normalizedTargetGcode(source?.gcode);
    return {
      id,
      name,
      joints,
      ...pose,
      ...(gcode ? { gcode } : {}),
    };
  });

  return {
    projectName,
    settings: normalizePathProgramSettings(doc.settings as Partial<PathProgramSettings>),
    repeatCount: Math.round(clampProgramNumber(doc.repeatCount, 1, 1, 100)),
    targets,
    nextId: Math.max(0, ...targets.map((t) => t.id)) + 1,
    warnings: [],
  };
}

export function parseGcodePathProgram(
  content: string,
  options: {
    fallbackProjectName?: string;
    initialJoints?: readonly number[];
    solver?: IkSolverType;
  } = {}
): ParsedPathProgram {
  const parsed = parseWlkataGcode(content);
  const warnings = [...parsed.warnings];
  const solver = options.solver ?? "CONSTRAINED";

  let currentJoints = (options.initialJoints ?? HOME_JOINTS).slice();
  let currentPose = fkPose6DFromJointsDeg(currentJoints);

  const targets: PathTarget[] = [];
  let hasCartesian = false;
  let hasJoint = false;
  let lastJointFeedDegPerMin: number | null = null;
  let lastLinearFeedMmPerMin: number | null = null;

  const axisToJointIndex: Record<"x" | "y" | "z" | "a" | "b" | "c", number> = {
    x: 0,
    y: 1,
    z: 2,
    a: 3,
    b: 4,
    c: 5,
  };
  const axisToPoseKey: Record<"x" | "y" | "z" | "a" | "b" | "c", keyof Pose6D> = {
    x: "x",
    y: "y",
    z: "z",
    a: "rx",
    b: "ry",
    c: "rz",
  };

  for (let idx = 0; idx < parsed.commands.length; idx++) {
    const cmd = parsed.commands[idx];
    const name = cmd.name || `P${idx + 1}`;

    if (cmd.space === "joint") {
      hasJoint = true;
      if (cmd.feed) lastJointFeedDegPerMin = cmd.feed;
      const nextJoints = currentJoints.slice();
      (Object.keys(cmd.axes) as Array<keyof typeof cmd.axes>).forEach((axis) => {
        const val = cmd.axes[axis];
        if (val === undefined) return;
        const jIdx = axisToJointIndex[axis];
        nextJoints[jIdx] = cmd.coordinateMode === "relative" ? nextJoints[jIdx] + val : val;
      });
      const valid = validatedPathJoints(nextJoints);
      if (!valid) {
        throw new Error(`Line ${cmd.lineNumber} (${name}): joint values out of limits`);
      }
      const pose = fkPose6DFromJointsDeg(valid);
      const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, DEFAULT_WORKSPACE);
      if (!ws.ok) {
        throw new Error(`Line ${cmd.lineNumber} (${name}): ${ws.message}`);
      }
      currentJoints = valid;
      currentPose = pose;
      targets.push({
        id: idx + 1,
        name,
        joints: valid,
        ...pose,
        gcode: { space: "joint", interpolation: "joint" },
      });
    } else {
      hasCartesian = true;
      if (cmd.feed) lastLinearFeedMmPerMin = cmd.feed;
      const nextPose: Pose6D = { ...currentPose };
      (Object.keys(cmd.axes) as Array<keyof typeof cmd.axes>).forEach((axis) => {
        const val = cmd.axes[axis];
        if (val === undefined) return;
        const pKey = axisToPoseKey[axis];
        nextPose[pKey] = cmd.coordinateMode === "relative" ? nextPose[pKey] + val : val;
      });
      const ws = checkWorkspaceXYZ(nextPose.x, nextPose.y, nextPose.z, DEFAULT_WORKSPACE);
      if (!ws.ok) {
        throw new Error(`Line ${cmd.lineNumber} (${name}): ${ws.message}`);
      }
      const solved = solveIKPoseCandidate(currentJoints, pose6DToTargetMatrix(nextPose), solver);
      if (!solved || solved.err.posMm > 5 || solved.err.rotDeg > 10) {
        throw new Error(`Line ${cmd.lineNumber} (${name}): IK solution not found`);
      }
      currentJoints = solved.q;
      currentPose = fkPose6DFromJointsDeg(solved.q);
      targets.push({
        id: idx + 1,
        name,
        joints: solved.q,
        ...currentPose,
        gcode: {
          space: "cartesian",
          interpolation: cmd.interpolation === "rapid" ? "rapid" : "linear",
        },
      });
    }
  }

  const settings = normalizePathProgramSettings({
    motionType: hasCartesian && !hasJoint ? "MOVEL" : "MOVEJ",
    ...(lastJointFeedDegPerMin ? { speedDegPerSec: lastJointFeedDegPerMin / 60 } : {}),
    ...(lastLinearFeedMmPerMin ? { linearSpeedMmPerSec: lastLinearFeedMmPerMin / 60 } : {}),
  });

  return {
    projectName: parsed.projectName || options.fallbackProjectName || "Imported G-code",
    settings,
    repeatCount: 1,
    targets,
    nextId: targets.length + 1,
    warnings,
  };
}

export function exportPathProgramGcode(params: {
  projectName: string;
  settings: PathProgramSettings;
  targets: readonly PathTarget[];
}): string {
  const lines: string[] = [
    `; PROJECT: ${params.projectName}`,
    `; Generated by Mi Robot Simulator v0.0.1`,
    `; Motion: ${params.settings.motionType} | Profile: ${params.settings.trajectoryProfile}`,
  ];

  const jointFeed = params.settings.speedDegPerSec * 60;
  const linearFeed = params.settings.linearSpeedMmPerSec * 60;
  const preferCartesian = params.settings.motionType !== "MOVEJ";

  params.targets.forEach((target) => {
    lines.push(`; TARGET: ${target.name}`);
    const useCartesian =
      target.gcode?.space === "cartesian" || (!target.gcode && preferCartesian);
    if (useCartesian) {
      const interp = target.gcode?.interpolation === "rapid" ? "rapid" : "linear";
      lines.push(formatWlkataCartesianMove(target, linearFeed, interp));
    } else {
      lines.push(formatWlkataJointMove(target.joints, jointFeed));
    }
  });

  return `${lines.join("\n")}\n`;
}
