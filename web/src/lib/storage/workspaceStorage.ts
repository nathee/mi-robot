import type { PathProgramSettings, PathTarget } from "@/lib/kinematics/constants";
import type { CodeEditorMode, GripperState, ProgramBlock } from "@/lib/program/types";
import type { ToolType } from "@/lib/tools/toolDefs";
import type { WorkcellSnapshot } from "@/lib/sim/workcell";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";
import { isRobotModelId, type RobotModelId } from "@/lib/robots";

export const AUTOSAVE_STORAGE_KEY = "mirobot:autosave:v1";
export const HISTORY_STORAGE_KEY = "mirobot:history:v1";
export const MAX_HISTORY_ENTRIES = 30;
export const ROBOT_MODEL_STORAGE_KEY = "mirobot:robot-model:v1";
/** sessionStorage: model to open straight away after a robot switch reloads the page. */
export const PENDING_ROBOT_MODEL_KEY = "mirobot:robot-model:pending";

/**
 * Each robot keeps its own session draft and history (programs are tied to a robot's links
 * and limits). The Mirobot keeps the original keys so existing sessions survive the upgrade.
 */
export function autosaveStorageKey(model: RobotModelId = getActiveRobotProfile().id): string {
  return model === "mirobot" ? AUTOSAVE_STORAGE_KEY : `${AUTOSAVE_STORAGE_KEY}:${model}`;
}

export function historyStorageKey(model: RobotModelId = getActiveRobotProfile().id): string {
  return model === "mirobot" ? HISTORY_STORAGE_KEY : `${HISTORY_STORAGE_KEY}:${model}`;
}

export interface RobotModelPreference {
  model: RobotModelId;
  /** Skip the selection screen and open this robot directly. */
  remember: boolean;
}

export function loadRobotModelPreference(storage?: Storage): RobotModelPreference | null {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return null;
  try {
    const raw = store.getItem(ROBOT_MODEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RobotModelPreference>;
    if (!isRobotModelId(parsed?.model)) return null;
    return { model: parsed.model, remember: parsed.remember === true };
  } catch {
    return null;
  }
}

export function saveRobotModelPreference(pref: RobotModelPreference, storage?: Storage): boolean {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return false;
  try {
    store.setItem(ROBOT_MODEL_STORAGE_KEY, JSON.stringify(pref));
    return true;
  } catch {
    return false;
  }
}

export interface WorkspaceSnapshotData {
  projectName: string;
  /** Robot the snapshot was made with. Missing = saved before robot selection existed (Mirobot). */
  robotModel?: RobotModelId;
  joints: number[];
  gripperState: GripperState;
  /** Optional for snapshots saved before end-effectors were selectable. */
  toolType?: ToolType;
  workcell?: WorkcellSnapshot;
  pathTargets: PathTarget[];
  pathSettings: PathProgramSettings;
  pathRepeatCount: number;
  codeMode: CodeEditorMode;
  blocks: ProgramBlock[];
  scriptText: string;
  gcodeText: string;
}

export interface WorkspaceHistoryEntry {
  id: string;
  savedAt: number;
  note: string;
  data: WorkspaceSnapshotData;
}

export function isValidSnapshotData(raw: unknown): raw is WorkspaceSnapshotData {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Record<string, unknown>;
  return (
    typeof d.projectName === "string" &&
    Array.isArray(d.joints) &&
    d.joints.length === 6 &&
    Array.isArray(d.pathTargets) &&
    typeof d.scriptText === "string" &&
    typeof d.gcodeText === "string" &&
    Array.isArray(d.blocks)
  );
}

export function loadAutosaveFromStorage(storage?: Storage): WorkspaceSnapshotData | null {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return null;
  try {
    const raw = store.getItem(autosaveStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSnapshotData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearAutosaveFromStorage(storage?: Storage): boolean {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return false;
  try {
    store.removeItem(autosaveStorageKey());
    return true;
  } catch {
    return false;
  }
}

export function saveAutosaveToStorage(data: WorkspaceSnapshotData, storage?: Storage): boolean {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return false;
  try {
    store.setItem(autosaveStorageKey(), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadHistoryFromStorage(storage?: Storage): WorkspaceHistoryEntry[] {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return [];
  try {
    const raw = store.getItem(historyStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WorkspaceHistoryEntry =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.savedAt === "number" &&
        isValidSnapshotData(item.data)
    );
  } catch {
    return [];
  }
}

export function saveHistoryToStorage(
  entries: readonly WorkspaceHistoryEntry[],
  storage?: Storage
): boolean {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return false;
  try {
    store.setItem(historyStorageKey(), JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

export function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
