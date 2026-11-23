import { describe, expect, it } from "vitest";
import { DEFAULT_PATH_PROGRAM_SETTINGS } from "../kinematics/constants";
import { createDemoBlocks } from "../program/blocks";
import {
  loadAutosaveFromStorage,
  loadHistoryFromStorage,
  MAX_HISTORY_ENTRIES,
  saveAutosaveToStorage,
  saveHistoryToStorage,
  type WorkspaceHistoryEntry,
  type WorkspaceSnapshotData,
} from "../storage/workspaceStorage";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

function sampleSnapshot(name: string): WorkspaceSnapshotData {
  return {
    projectName: name,
    joints: [10, 5, -10, 0, -5, 0],
    gripperState: "OPEN",
    pathTargets: [],
    pathSettings: DEFAULT_PATH_PROGRAM_SETTINGS,
    pathRepeatCount: 1,
    codeMode: "BLOCKS",
    blocks: createDemoBlocks(),
    scriptText: "home()",
    gcodeText: "M21 G90 X0 Y0 Z0 A0 B0 C0 F2700",
  };
}

describe("Workspace Autosave & Work History Storage", () => {
  it("saves and restores autosave draft cleanly", () => {
    const mem = createMemoryStorage();
    const snap = sampleSnapshot("Lab Arm Session");
    expect(saveAutosaveToStorage(snap, mem)).toBe(true);

    const loaded = loadAutosaveFromStorage(mem);
    expect(loaded).not.toBeNull();
    expect(loaded!.projectName).toBe("Lab Arm Session");
    expect(loaded!.joints).toEqual([10, 5, -10, 0, -5, 0]);
    expect(loaded!.blocks.length).toBeGreaterThan(0);
  });

  it("persists work history and caps at MAX_HISTORY_ENTRIES", () => {
    const mem = createMemoryStorage();
    const entries: WorkspaceHistoryEntry[] = Array.from({ length: 40 }, (_, i) => ({
      id: `h_${i}`,
      savedAt: Date.now() - i * 1000,
      note: `Snapshot #${i}`,
      data: sampleSnapshot(`Project ${i}`),
    }));

    expect(saveHistoryToStorage(entries, mem)).toBe(true);
    const loaded = loadHistoryFromStorage(mem);
    expect(loaded).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(loaded[0].data.projectName).toBe("Project 0");
  });
});
