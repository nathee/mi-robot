import { DEFAULT_WORKSPACE, JOINT_LIMITS } from "@/lib/kinematics/constants";
import { checkWorkspaceXYZ } from "@/lib/kinematics/fk";
import { stepsToGcode } from "./gcodeCompiler";
import type { CompileError, CompileResult, ProgramBlock, ProgramStep } from "./types";

let blockSeq = 1;
export function nextBlockId(): string {
  return `blk_${Date.now().toString(36)}_${blockSeq++}`;
}

export function compileBlocksProgram(blocks: readonly ProgramBlock[]): CompileResult {
  const steps: ProgramStep[] = [];
  const errors: CompileError[] = [];
  const warnings: string[] = [];
  const MAX_STEPS = 500;

  const visit = (list: readonly ProgramBlock[]) => {
    for (let idx = 0; idx < list.length; idx++) {
      if (steps.length >= MAX_STEPS) {
        errors.push({ line: idx + 1, message: `Program exceeds ${MAX_STEPS} steps` });
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
                message: `Block #${idx + 1}: J${j + 1}=${blk.joints[j]}° outside [${lim.min}°, ${lim.max}°]`,
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
            errors.push({ line: idx + 1, message: `Block #${idx + 1}: ${ws.message}` });
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
    warnings.push("Add at least one block to run.");
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
      case "REPEAT":
        lines.push(`${indent}repeat ${blk.count}:`);
        lines.push(blocksToScript(blk.children, `${indent}  `));
        lines.push(`${indent}end`);
        break;
    }
  }
  return lines.join("\n");
}

export function blocksToGcode(blocks: readonly ProgramBlock[], projectName?: string): string {
  const res = compileBlocksProgram(blocks);
  return stepsToGcode(res.steps, projectName);
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
