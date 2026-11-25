import { create } from "zustand";
import { ROBOT_PROFILES, isRobotModelId, setActiveRobotModel, type RobotModelId } from "@/lib/robots";
import {
  PENDING_ROBOT_MODEL_KEY,
  loadRobotModelPreference,
  saveRobotModelPreference,
} from "@/lib/storage/workspaceStorage";
import { useHistoryStore } from "./useHistoryStore";
import { useProjectStore } from "./useProjectStore";
import { useRobotStore } from "./useRobotStore";
import { useSerialStore } from "./useSerialStore";
import { useViewerStore } from "./useViewerStore";

interface RobotModelState {
  /** Robot the simulator is running, or null until one has been chosen. */
  loadedModel: RobotModelId | null;
  /** Selection screen visible (always true while loadedModel is null). */
  selecting: boolean;
  /** Pre-selected card on the selection screen. */
  suggestedModel: RobotModelId;
  remember: boolean;
  initialized: boolean;

  /** Reads the saved choice; opens the remembered robot directly when asked to. */
  init: () => void;
  chooseModel: (model: RobotModelId, remember: boolean) => void;
  openSelector: () => void;
  closeSelector: () => void;
}

/** Points FK/IK and the stores at a robot. Called once, before the simulator first renders. */
export function activateRobotModel(model: RobotModelId): void {
  const profile = setActiveRobotModel(model);
  useViewerStore.setState({ workspace: { ...profile.workspace } });
  const robot = useRobotStore.getState();
  if (!profile.allowedTools.includes(robot.toolType)) {
    robot.setToolType(profile.defaultTool, { log: false });
  }
  robot.setJoints(profile.home, { syncIk: true });
  useSerialStore.getState().appendLog({ dir: "sys", text: `Robot: ${profile.name}` });
}

function readPendingModel(): RobotModelId | null {
  try {
    const pending = window.sessionStorage.getItem(PENDING_ROBOT_MODEL_KEY);
    window.sessionStorage.removeItem(PENDING_ROBOT_MODEL_KEY);
    return isRobotModelId(pending) ? pending : null;
  } catch {
    return null;
  }
}

export const useRobotModelStore = create<RobotModelState>((set, get) => ({
  loadedModel: null,
  selecting: true,
  suggestedModel: "mirobot",
  remember: false,
  initialized: false,

  init() {
    if (get().initialized) return;
    const pref = loadRobotModelPreference();
    const pending = typeof window !== "undefined" ? readPendingModel() : null;
    const direct = pending ?? (pref?.remember ? pref.model : null);
    set({
      initialized: true,
      suggestedModel: pending ?? pref?.model ?? "mirobot",
      remember: pref?.remember ?? false,
    });
    if (direct) {
      activateRobotModel(direct);
      set({ loadedModel: direct, selecting: false });
    }
  },

  chooseModel(model, remember) {
    saveRobotModelPreference({ model, remember });
    set({ remember, suggestedModel: model });
    const loaded = get().loadedModel;

    if (loaded === null) {
      activateRobotModel(model);
      set({ loadedModel: model, selecting: false });
      return;
    }
    if (loaded === model) {
      set({ selecting: false });
      return;
    }

    // Switching robots: keep this robot's draft (stored per robot), then start clean.
    useHistoryStore.getState().saveAutosave();
    useProjectStore.getState().setDirty(false);
    try {
      window.sessionStorage.setItem(PENDING_ROBOT_MODEL_KEY, model);
    } catch {
      // Without sessionStorage the selection screen simply shows again after the reload.
    }
    useSerialStore
      .getState()
      .appendLog({ dir: "sys", text: `Switching robot to ${ROBOT_PROFILES[model].name}…` });
    window.location.reload();
  },

  openSelector() {
    set({ selecting: true, suggestedModel: get().loadedModel ?? get().suggestedModel });
  },

  closeSelector() {
    if (get().loadedModel) set({ selecting: false });
  },
}));
