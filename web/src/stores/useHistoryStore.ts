import { create } from "zustand";
import { isToolType } from "@/lib/tools/toolDefs";
import { useWorkcellStore } from "./useWorkcellStore";
import { clonePathTarget, normalizePathProgramSettings } from "@/lib/path/gcode";
import {
  loadAutosaveFromStorage,
  loadHistoryFromStorage,
  MAX_HISTORY_ENTRIES,
  saveAutosaveToStorage,
  saveHistoryToStorage,
  type WorkspaceHistoryEntry,
  type WorkspaceSnapshotData,
} from "@/lib/storage/workspaceStorage";
import { useCodeStore } from "./useCodeStore";
import { usePathStore } from "./usePathStore";
import { useProjectStore } from "./useProjectStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";

interface HistoryState {
  entries: WorkspaceHistoryEntry[];
  hydrated: boolean;
  lastSavedAt: number | null;

  hydrate: () => void;
  captureCurrentSnapshot: () => WorkspaceSnapshotData;
  applySnapshot: (data: WorkspaceSnapshotData, logLabel?: string) => void;
  saveAutosave: () => void;
  saveToHistory: (note?: string) => WorkspaceHistoryEntry;
  restoreFromHistory: (id: string) => boolean;
  deleteFromHistory: (id: string) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  hydrated: false,
  lastSavedAt: null,

  captureCurrentSnapshot() {
    const project = useProjectStore.getState();
    const robot = useRobotStore.getState();
    const path = usePathStore.getState();
    const code = useCodeStore.getState();

    return {
      projectName: project.name,
      joints: robot.joints.slice(),
      gripperState: robot.gripperState,
      toolType: robot.toolType,
      workcell: useWorkcellStore.getState().snapshot(),
      pathTargets: path.targets.map(clonePathTarget),
      pathSettings: normalizePathProgramSettings(path.settings),
      pathRepeatCount: path.repeatCount,
      codeMode: code.mode,
      blocks: structuredClone(code.blocks),
      scriptText: code.scriptText,
      gcodeText: code.gcodeText,
    };
  },

  applySnapshot(data, logLabel) {
    usePathStore.getState().stopPlayback();
    useCodeStore.getState().stop();

    useRobotStore.getState().setJoints(data.joints, { syncIk: true });
    if (isToolType(data.toolType)) {
      useRobotStore.getState().setToolType(data.toolType, { log: false });
    }
    useRobotStore.getState().setGripper(data.gripperState, undefined, { log: false });
    if (data.workcell) useWorkcellStore.getState().loadSnapshot(data.workcell);

    const targets = data.pathTargets.map(clonePathTarget);
    const nextId = Math.max(0, ...targets.map((t) => t.id)) + 1;
    usePathStore.setState({
      targets,
      nextId,
      activeTargetIndex: targets.length ? 0 : -1,
      status: "IDLE",
      settings: normalizePathProgramSettings(data.pathSettings),
      repeatCount: Math.max(1, Math.min(100, data.pathRepeatCount || 1)),
      currentSegment: 0,
      segmentElapsedMs: 0,
      undoStack: [],
      redoStack: [],
    });

    useCodeStore.setState({
      mode: data.codeMode,
      blocks: structuredClone(data.blocks),
      scriptText: data.scriptText,
      gcodeText: data.gcodeText,
      status: "IDLE",
      errors: [],
      activeStepIndex: -1,
      activeLine: null,
      activeBlockId: null,
      runtime: null,
    });

    useProjectStore.getState().setName(data.projectName || "Untitled Project", false);
    useProjectStore.getState().setDirty(false);

    if (logLabel) {
      useSerialStore.getState().appendLog({ dir: "ok", text: logLabel });
    }
  },

  hydrate() {
    if (get().hydrated) return;
    const entries = loadHistoryFromStorage();
    const draft = loadAutosaveFromStorage();

    if (draft) {
      get().applySnapshot(draft, `Restored previous session "${draft.projectName}"`);
    }

    set({
      entries,
      hydrated: true,
      lastSavedAt: entries[0]?.savedAt ?? null,
    });
  },

  saveAutosave() {
    if (!get().hydrated) return;
    const snap = get().captureCurrentSnapshot();
    saveAutosaveToStorage(snap);
  },

  saveToHistory(note = "Manual save") {
    const snap = get().captureCurrentSnapshot();
    const now = Date.now();
    const entry: WorkspaceHistoryEntry = {
      id: `hist_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      savedAt: now,
      note,
      data: snap,
    };

    const nextEntries = [entry, ...get().entries].slice(0, MAX_HISTORY_ENTRIES);
    saveHistoryToStorage(nextEntries);
    saveAutosaveToStorage(snap);
    useProjectStore.getState().setDirty(false);

    set({ entries: nextEntries, lastSavedAt: now });
    useSerialStore.getState().appendLog({
      dir: "ok",
      text: `Saved "${snap.projectName}" to work history (${note})`,
    });
    return entry;
  },

  restoreFromHistory(id) {
    const entry = get().entries.find((e) => e.id === id);
    if (!entry) return false;
    get().applySnapshot(entry.data, `Restored "${entry.data.projectName}" from history`);
    saveAutosaveToStorage(entry.data);
    return true;
  },

  deleteFromHistory(id) {
    const next = get().entries.filter((e) => e.id !== id);
    saveHistoryToStorage(next);
    set({ entries: next });
  },

  clearHistory() {
    saveHistoryToStorage([]);
    set({ entries: [] });
    useSerialStore.getState().appendLog({ dir: "sys", text: "Cleared local work history" });
  },
}));
