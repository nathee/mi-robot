import type { PathProgramSettings, PathTarget } from "@/lib/kinematics/constants";
import { nextBlockId } from "./blocks";
import type { ProgramBlock } from "./types";
import { t } from "@/lib/i18n";

export interface PathToBlocksResult {
  blocks: ProgramBlock[];
  warnings: string[];
}

/**
 * Converts taught Path waypoints into Visual Blocks.
 * Mirrors exportPathProgramGcode(): a waypoint's own G-code space wins, otherwise
 * MOVEJ → MoveJ blocks and MOVEL/MOVEC → MoveL blocks.
 */
export function pathTargetsToBlocks(params: {
  targets: readonly PathTarget[];
  settings: PathProgramSettings;
  repeatCount?: number;
}): PathToBlocksResult {
  const { targets, settings } = params;
  const warnings: string[] = [];
  const preferCartesian = settings.motionType !== "MOVEJ";
  const jointSpeed = Number(settings.speedDegPerSec.toFixed(1));
  const linearSpeed = Number(settings.linearSpeedMmPerSec.toFixed(1));

  if (settings.motionType === "MOVEC") {
    warnings.push(t("warn.movecToBlocks"));
  }

  const moves: ProgramBlock[] = targets.map((t) => {
    const useCartesian = t.gcode?.space === "cartesian" || (!t.gcode && preferCartesian);
    if (useCartesian) {
      return {
        id: nextBlockId(),
        kind: "MOVE_LINEAR",
        pose: { x: t.x, y: t.y, z: t.z, rx: t.rx, ry: t.ry, rz: t.rz },
        speedMmPerSec: linearSpeed,
      };
    }
    return {
      id: nextBlockId(),
      kind: "MOVE_JOINT",
      joints: t.joints.slice(0, 6),
      speedDegPerSec: jointSpeed,
    };
  });

  const repeat = Math.max(1, Math.round(params.repeatCount ?? 1));
  const blocks: ProgramBlock[] =
    repeat > 1 && moves.length > 0
      ? [{ id: nextBlockId(), kind: "REPEAT", count: repeat, children: moves }]
      : moves;

  return { blocks, warnings };
}
