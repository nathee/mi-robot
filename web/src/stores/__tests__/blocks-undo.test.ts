import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramBlock } from "@/lib/program/types";
import { BLOCKS_HISTORY_LIMIT, useCodeStore } from "../useCodeStore";
import { useHistoryStore } from "../useHistoryStore";

const wait = (id: string, ms = 100): ProgramBlock => ({ id, kind: "WAIT", seconds: ms });
const ids = () => useCodeStore.getState().blocks.map((b) => b.id);
const code = () => useCodeStore.getState();

describe("Blocks editor undo / redo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCodeStore.setState({ status: "IDLE", blocks: [wait("a"), wait("b"), wait("c")] });
    code().clearBlocksHistory();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores a deleted block and redoes the delete", () => {
    code().removeBlock("b");
    expect(ids()).toEqual(["a", "c"]);
    expect(code().undoBlocks()).toBe(true);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(code().redoBlocks()).toBe(true);
    expect(ids()).toEqual(["a", "c"]);
  });

  it("undoes add, duplicate and move one step at a time", () => {
    code().addBlock(wait("d"));
    code().duplicateBlock("a");
    code().moveBlock(0, 2);
    const afterAll = ids();
    expect(afterAll).toHaveLength(5);

    code().undoBlocks();
    code().undoBlocks();
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    code().undoBlocks();
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(code().undoBlocks()).toBe(false);

    code().redoBlocks();
    code().redoBlocks();
    code().redoBlocks();
    expect(ids()).toEqual(afterAll);
  });

  it("restores a block nested inside a REPEAT", () => {
    useCodeStore.setState({
      blocks: [{ id: "r", kind: "REPEAT", count: 2, children: [wait("x"), wait("y")] } as ProgramBlock],
    });
    code().clearBlocksHistory();
    code().removeBlock("x");
    const repeat = () => code().blocks[0] as Extract<ProgramBlock, { kind: "REPEAT" }>;
    expect(repeat().children.map((b) => b.id)).toEqual(["y"]);
    code().undoBlocks();
    expect(repeat().children.map((b) => b.id)).toEqual(["x", "y"]);
  });

  it("merges rapid edits of one block into a single undo step", () => {
    const setMs = (ms: number) =>
      code().updateBlock("a", (b) => (b.kind === "WAIT" ? { ...b, seconds: ms } : b));
    const ms = () => (code().blocks[0] as Extract<ProgramBlock, { kind: "WAIT" }>).seconds;

    setMs(1);
    vi.advanceTimersByTime(200);
    setMs(15);
    vi.advanceTimersByTime(200);
    setMs(150);
    expect(code().blocksUndoStack).toHaveLength(1);

    vi.advanceTimersByTime(2000); // a later edit is its own step
    setMs(900);
    expect(code().blocksUndoStack).toHaveLength(2);

    code().undoBlocks();
    expect(ms()).toBe(150);
    code().undoBlocks();
    expect(ms()).toBe(100);
  });

  it("a new edit clears the redo stack", () => {
    code().removeBlock("a");
    code().undoBlocks();
    expect(code().blocksRedoStack).toHaveLength(1);
    code().removeBlock("c");
    expect(code().blocksRedoStack).toHaveLength(0);
    expect(code().redoBlocks()).toBe(false);
  });

  it("refuses to undo while a program is running", () => {
    code().removeBlock("a");
    useCodeStore.setState({ status: "RUNNING" });
    expect(code().undoBlocks()).toBe(false);
    expect(ids()).toEqual(["b", "c"]);
    useCodeStore.setState({ status: "IDLE" });
  });

  it("caps the history length", () => {
    for (let i = 0; i < BLOCKS_HISTORY_LIMIT + 20; i++) code().addBlock(wait(`n${i}`));
    expect(code().blocksUndoStack).toHaveLength(BLOCKS_HISTORY_LIMIT);
  });

  it("restoring a saved snapshot forgets the block history", () => {
    code().removeBlock("a");
    const snap = useHistoryStore.getState().captureCurrentSnapshot();
    useHistoryStore.getState().applySnapshot(snap);
    expect(code().blocksUndoStack).toHaveLength(0);
    expect(code().undoBlocks()).toBe(false);
  });
});
