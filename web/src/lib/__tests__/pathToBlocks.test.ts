import { describe, expect, it } from "vitest";
import type { PathTarget } from "../kinematics/constants";
import { normalizePathProgramSettings } from "../path/gcode";
import { blocksToGcode, blocksToScript, compileBlocksProgram } from "../program/blocks";
import { pathTargetsToBlocks } from "../program/pathToBlocks";

const target = (id: number, joints: number[], xyz: [number, number, number]): PathTarget => ({
  id,
  name: `P${id}`,
  joints,
  x: xyz[0],
  y: xyz[1],
  z: xyz[2],
  rx: 0,
  ry: 0,
  rz: 0,
});

const TARGETS = [
  target(1, [0, 0, 0, 0, 0, 0], [198.7, 0, 230.4]),
  target(2, [30, 10, -20, 0, -10, 0], [180, 60, 200]),
];

describe("pathTargetsToBlocks", () => {
  it("MOVEJ produces MoveJ blocks that compile to Script and G-code", () => {
    const settings = normalizePathProgramSettings({ motionType: "MOVEJ", speedDegPerSec: 40 });
    const { blocks, warnings } = pathTargetsToBlocks({ targets: TARGETS, settings });
    expect(warnings).toEqual([]);
    expect(blocks.map((b) => b.kind)).toEqual(["MOVE_JOINT", "MOVE_JOINT"]);
    expect(blocks[1]).toMatchObject({ joints: [30, 10, -20, 0, -10, 0], speedDegPerSec: 40 });

    expect(compileBlocksProgram(blocks).errors).toEqual([]);
    expect(blocksToScript(blocks)).toContain("moveJ(30, 10, -20, 0, -10, 0, speed=40)");
    const gcode = blocksToGcode(blocks, "T");
    expect(gcode).toContain("M21 G90");
    expect(gcode).toContain("X30");
  });

  it("MOVEL produces MoveL blocks with the waypoint pose", () => {
    const settings = normalizePathProgramSettings({ motionType: "MOVEL", linearSpeedMmPerSec: 50 });
    const { blocks } = pathTargetsToBlocks({ targets: TARGETS, settings });
    expect(blocks.map((b) => b.kind)).toEqual(["MOVE_LINEAR", "MOVE_LINEAR"]);
    expect(blocks[1]).toMatchObject({ pose: { x: 180, y: 60, z: 200 }, speedMmPerSec: 50 });
  });

  it("per-waypoint G-code space overrides the motion type", () => {
    const settings = normalizePathProgramSettings({ motionType: "MOVEJ" });
    const targets = [TARGETS[0], { ...TARGETS[1], gcode: { space: "cartesian" as const, interpolation: "linear" as const } }];
    const { blocks } = pathTargetsToBlocks({ targets, settings });
    expect(blocks.map((b) => b.kind)).toEqual(["MOVE_JOINT", "MOVE_LINEAR"]);
  });

  it("wraps moves in REPEAT when repeatCount > 1 and warns for MOVEC", () => {
    const settings = normalizePathProgramSettings({ motionType: "MOVEC" });
    const { blocks, warnings } = pathTargetsToBlocks({ targets: TARGETS, settings, repeatCount: 3 });
    expect(warnings).toHaveLength(1);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "REPEAT", count: 3 });
    expect(blocks[0].kind === "REPEAT" && blocks[0].children).toHaveLength(2);
  });
});
