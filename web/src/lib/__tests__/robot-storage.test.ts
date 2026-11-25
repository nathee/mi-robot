import { afterEach, describe, expect, it } from "vitest";
import { setActiveRobotModel } from "../robots";
import {
  AUTOSAVE_STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  autosaveStorageKey,
  historyStorageKey,
  loadRobotModelPreference,
  saveRobotModelPreference,
} from "../storage/workspaceStorage";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe("per-robot storage", () => {
  afterEach(() => setActiveRobotModel("mirobot"));

  it("keeps the Mirobot's original keys and namespaces other robots", () => {
    expect(autosaveStorageKey()).toBe(AUTOSAVE_STORAGE_KEY);
    expect(historyStorageKey()).toBe(HISTORY_STORAGE_KEY);
    setActiveRobotModel("xarm2");
    expect(autosaveStorageKey()).toBe(`${AUTOSAVE_STORAGE_KEY}:xarm2`);
    expect(historyStorageKey()).toBe(`${HISTORY_STORAGE_KEY}:xarm2`);
  });

  it("round-trips the robot preference and ignores unknown models", () => {
    const store = new MemoryStorage() as unknown as Storage;
    expect(loadRobotModelPreference(store)).toBeNull();
    saveRobotModelPreference({ model: "xarm2", remember: true }, store);
    expect(loadRobotModelPreference(store)).toEqual({ model: "xarm2", remember: true });
    store.setItem("mirobot:robot-model:v1", JSON.stringify({ model: "ur5", remember: true }));
    expect(loadRobotModelPreference(store)).toBeNull();
  });
});
