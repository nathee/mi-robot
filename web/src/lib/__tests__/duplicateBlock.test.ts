import { describe, expect, it } from "vitest";
import { blocksToScript, duplicateBlockInList } from "../program/blocks";
import type { ProgramBlock } from "../program/types";

const program = (): ProgramBlock[] => [
  { id: "h", kind: "HOME" },
  { id: "m", kind: "MOVE_JOINT", joints: [10, 0, 0, 0, 0, 0], speedDegPerSec: 40 },
  {
    id: "r",
    kind: "REPEAT",
    count: 2,
    children: [
      { id: "g", kind: "GRIPPER", state: "CLOSE", pwm: 1000 },
      { id: "w", kind: "WAIT", seconds: 0.5 },
    ],
  },
];

describe("duplicateBlockInList", () => {
  it("inserts an independent copy right after a top-level block", () => {
    const src = program();
    const { blocks, newId } = duplicateBlockInList(src, "m");
    expect(blocks.map((b) => b.kind)).toEqual(["HOME", "MOVE_JOINT", "MOVE_JOINT", "REPEAT"]);
    expect(newId).not.toBe("m");
    expect(blocks[2]).toMatchObject({ id: newId, joints: [10, 0, 0, 0, 0, 0], speedDegPerSec: 40 });
    // Editing the copy must not touch the original
    (blocks[2] as Extract<ProgramBlock, { kind: "MOVE_JOINT" }>).joints[0] = 99;
    expect((blocks[1] as Extract<ProgramBlock, { kind: "MOVE_JOINT" }>).joints[0]).toBe(10);
    expect(src).toEqual(program()); // input untouched
  });

  it("duplicates a block inside a Repeat, in place", () => {
    const { blocks } = duplicateBlockInList(program(), "g");
    const rep = blocks[2] as Extract<ProgramBlock, { kind: "REPEAT" }>;
    expect(rep.children.map((b) => b.kind)).toEqual(["GRIPPER", "GRIPPER", "WAIT"]);
    expect(blocks).toHaveLength(3);
  });

  it("duplicates a whole Repeat with fresh ids for its children", () => {
    const { blocks } = duplicateBlockInList(program(), "r");
    expect(blocks).toHaveLength(4);
    const [a, b] = [blocks[2], blocks[3]] as Extract<ProgramBlock, { kind: "REPEAT" }>[];
    const ids = [a, b, ...a.children, ...b.children].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(blocksToScript(blocks).match(/repeat 2:/g)).toHaveLength(2);
  });

  it("returns the list unchanged for an unknown id", () => {
    const { blocks, newId } = duplicateBlockInList(program(), "nope");
    expect(newId).toBeNull();
    expect(blocks).toEqual(program());
  });
});
