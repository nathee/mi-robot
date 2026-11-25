import { DEFAULT_WORKSPACE, JOINT_LIMITS } from "@/lib/kinematics/constants";
import { checkWorkspaceXYZ } from "@/lib/kinematics/fk";
import { stepsToGcode } from "./gcodeCompiler";
import { TOOL_DEFS, type ToolType } from "@/lib/tools/toolDefs";
import type { CompileError, CompileResult, ProgramBlock, ProgramStep } from "./types";
import { t } from "@/lib/i18n";

let blockSeq = 1;
export function nextBlockId(): string {
  return `blk_${Date.now().toString(36)}_${blockSeq++}`;
}

/** Deep copy of a block (and a Repeat's children) with fresh ids. */
export function cloneBlockWithNewIds(block: ProgramBlock): ProgramBlock {
  const copy = structuredClone(block);
  copy.id = nextBlockId();
  if (copy.kind === "REPEAT") copy.children = copy.children.map(cloneBlockWithNewIds);
  return copy;
}

/**
 * Inserts a copy of the block with this id right after it, at whatever nesting level it lives
 * (top level or inside a Repeat). Returns the new list and the copy's id (null if not found).
 */
export function duplicateBlockInList(
  blocks: readonly ProgramBlock[],
  id: string
): { blocks: ProgramBlock[]; newId: string | null } {
  let newId: string | null = null;
  const visit = (list: readonly ProgramBlock[]): ProgramBlock[] => {
    const out: ProgramBlock[] = [];
    for (const b of list) {
      if (newId === null && b.kind === "REPEAT" && b.id !== id) {
        out.push({ ...b, children: visit(b.children) });
      } else {
        out.push(b);
      }
      if (newId === null && b.id === id) {
        const copy = cloneBlockWithNewIds(b);
        newId = copy.id;
        out.push(copy);
      }
    }
    return out;
  };
  const next = visit(blocks);
  return { blocks: newId ? next : blocks.slice(), newId };
}

export function compileBlocksProgram(blocks: readonly ProgramBlock[]): CompileResult {
  const steps: ProgramStep[] = [];
  const errors: CompileError[] = [];
  const warnings: string[] = [];
  const MAX_STEPS = 500;

  const visit = (list: readonly ProgramBlock[]) => {
    for (let idx = 0; idx < list.length; idx++) {
      if (steps.length >= MAX_STEPS) {
        errors.push({ line: idx + 1, message: t("err.maxSteps", { n: MAX_STEPS }) });
        return;
      }
      const blk = list[idx];
      switch (blk.kind) {
        case "HOME":
          steps.push({ type: "HOME", blockId: blk.id, label: "Home" });
          break;
        case "MOVE_JOINT": {
          for (let j = 0; j < 6; j++) {
            const lim = JOINT_LIMITS[j];
            if (blk.joints[j] < lim.min || blk.joints[j] > lim.max) {
              errors.push({
                line: idx + 1,
                message: t("err.blockJointRange", { i: idx + 1, j: j + 1, v: blk.joints[j], min: lim.min, max: lim.max }),
              });
              return;
            }
          }
          steps.push({
            type: "MOVE_JOINT",
            joints: blk.joints.slice(),
            feedDegPerMin: Math.max(5, Math.min(180, blk.speedDegPerSec)) * 60,
            blockId: blk.id,
            label: `MoveJ [${blk.joints.map((v) => v.toFixed(0)).join(", ")}]`,
          });
          break;
        }
        case "MOVE_LINEAR": {
          const ws = checkWorkspaceXYZ(blk.pose.x, blk.pose.y, blk.pose.z, DEFAULT_WORKSPACE);
          if (!ws.ok) {
            errors.push({ line: idx + 1, message: t("err.blockWs", { i: idx + 1, reason: ws.message }) });
            return;
          }
          steps.push({
            type: "MOVE_CARTESIAN",
            pose: { ...blk.pose },
            interpolation: "linear",
            feedMmPerMin: Math.max(5, Math.min(500, blk.speedMmPerSec)) * 60,
            blockId: blk.id,
            label: `MoveL (${blk.pose.x.toFixed(0)}, ${blk.pose.y.toFixed(0)}, ${blk.pose.z.toFixed(0)})`,
          });
          break;
        }
        case "WAIT":
          steps.push({
            type: "WAIT",
            durationMs: Math.round(Math.max(0, Math.min(60, blk.seconds)) * 1000),
            blockId: blk.id,
            label: `Wait ${blk.seconds}s`,
          });
          break;
        case "GRIPPER":
          steps.push({
            type: "GRIPPER",
            state: blk.state,
            pwm: blk.state === "CLOSE" ? blk.pwm || 1000 : 0,
            blockId: blk.id,
            label: `Gripper ${blk.state}`,
          });
          break;
        case "WAIT_SENSOR":
          steps.push({
            type: "WAIT_SENSOR",
            until: blk.until,
            timeoutMs: Math.round(Math.max(1, Math.min(300, blk.timeoutSec)) * 1000),
            blockId: blk.id,
            label: blk.until === "CLEAR" ? "Wait sensor clear" : "Wait for box at sensor",
          });
          break;
        case "CONVEYOR":
          if (blk.mode === "AUTO") {
            const v = blk.value > 0 ? Math.max(5, Math.min(100, blk.value)) : 0;
            steps.push({
              type: "CONVEYOR",
              mode: "AUTO",
              value: v,
              blockId: blk.id,
              label: v ? `Conveyor auto-feed ${v}%` : "Conveyor auto-feed off",
            });
            break;
          }
          steps.push(
            blk.mode === "SPEED"
              ? {
                  type: "CONVEYOR",
                  mode: "SPEED",
                  value: Math.max(-100, Math.min(100, blk.value)),
                  blockId: blk.id,
                  label: `Conveyor speed ${blk.value}%`,
                }
              : {
                  type: "CONVEYOR",
                  mode: "MOVE",
                  value: blk.value,
                  absolute: false,
                  blockId: blk.id,
                  label: `Conveyor move ${blk.value} mm`,
                }
          );
          break;
        case "TOOL":
          steps.push({ type: "TOOL", tool: blk.tool, blockId: blk.id, label: `Tool: ${TOOL_DEFS[blk.tool].label}` });
          break;
        case "REPEAT": {
          const times = Math.max(1, Math.min(50, Math.round(blk.count)));
          for (let r = 0; r < times; r++) {
            visit(blk.children);
            if (errors.length) return;
          }
          break;
        }
      }
    }
  };

  visit(blocks);
  if (!steps.length && !errors.length) {
    warnings.push(t("warn.addBlock"));
  }
  return { steps, errors, warnings };
}

export function blocksToScript(blocks: readonly ProgramBlock[], indent = ""): string {
  const lines: string[] = [];
  for (const blk of blocks) {
    switch (blk.kind) {
      case "HOME":
        lines.push(`${indent}home()`);
        break;
      case "MOVE_JOINT":
        lines.push(
          `${indent}moveJ(${blk.joints.map((v) => Number(v.toFixed(1))).join(", ")}, speed=${blk.speedDegPerSec})`
        );
        break;
      case "MOVE_LINEAR":
        lines.push(
          `${indent}moveL(${[blk.pose.x, blk.pose.y, blk.pose.z, blk.pose.rx, blk.pose.ry, blk.pose.rz]
            .map((v) => Number(v.toFixed(1)))
            .join(", ")}, speed=${blk.speedMmPerSec})`
        );
        break;
      case "WAIT":
        lines.push(`${indent}wait(${blk.seconds})`);
        break;
      case "GRIPPER":
        lines.push(`${indent}gripper("${blk.state.toLowerCase()}")`);
        break;
      case "CONVEYOR":
        lines.push(
          blk.mode === "AUTO"
            ? blk.value > 0
              ? `${indent}conveyorAuto("on", speed=${blk.value})`
              : `${indent}conveyorAuto("off")`
            : blk.mode === "SPEED"
              ? `${indent}conveyorSpeed(${blk.value})`
              : `${indent}conveyor(${blk.value})`
        );
        break;
      case "WAIT_SENSOR":
        lines.push(
          `${indent}waitSensor(${blk.until === "CLEAR" ? `"clear", ` : ""}timeout=${blk.timeoutSec})`
        );
        break;
      case "TOOL":
        lines.push(`${indent}tool("${blk.tool}")`);
        break;
      case "REPEAT":
        lines.push(`${indent}repeat ${blk.count}:`);
        lines.push(blocksToScript(blk.children, `${indent}  `));
        lines.push(`${indent}end`);
        break;
    }
  }
  return lines.join("\n");
}

export function blocksToGcode(
  blocks: readonly ProgramBlock[],
  projectName?: string,
  toolType?: ToolType
): string {
  const res = compileBlocksProgram(blocks);
  return stepsToGcode(res.steps, projectName, toolType);
}

export function createDemoBlocks(): ProgramBlock[] {
  return [
    { id: nextBlockId(), kind: "HOME" },
    { id: nextBlockId(), kind: "GRIPPER", state: "OPEN", pwm: 0 },
    {
      id: nextBlockId(),
      kind: "REPEAT",
      count: 2,
      children: [
        {
          id: nextBlockId(),
          kind: "MOVE_JOINT",
          joints: [-35, 22, -28, 0, -15, 0],
          speedDegPerSec: 55,
        },
        { id: nextBlockId(), kind: "GRIPPER", state: "CLOSE", pwm: 1000 },
        { id: nextBlockId(), kind: "WAIT", seconds: 0.4 },
        {
          id: nextBlockId(),
          kind: "MOVE_JOINT",
          joints: [45, 26, -32, 0, -12, -20],
          speedDegPerSec: 55,
        },
        { id: nextBlockId(), kind: "GRIPPER", state: "OPEN", pwm: 0 },
        { id: nextBlockId(), kind: "WAIT", seconds: 0.4 },
      ],
    },
    { id: nextBlockId(), kind: "HOME" },
  ];
}
