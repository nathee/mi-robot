import { create } from "zustand";

export type ProjectFileFormat = "json" | "gcode";

interface ProjectState {
  name: string;
  fileName: string;
  fileFormat: ProjectFileFormat;
  dirty: boolean;
  setName: (nextName: string, markDirty?: boolean) => void;
  setFileMeta: (meta: { fileName?: string; fileFormat?: ProjectFileFormat; dirty?: boolean }) => void;
  setDirty: (dirty: boolean) => void;
  resetProject: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  name: "Untitled Project",
  fileName: "Untitled",
  fileFormat: "json",
  dirty: false,

  setName(nextName, markDirty = true) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    set((state) => ({
      name: trimmed,
      dirty: markDirty ? true : state.dirty,
    }));
  },

  setFileMeta(meta) {
    set((state) => ({
      fileName: meta.fileName ?? state.fileName,
      fileFormat: meta.fileFormat ?? state.fileFormat,
      dirty: meta.dirty ?? state.dirty,
    }));
  },

  setDirty(dirty) {
    set({ dirty });
  },

  resetProject() {
    set({
      name: "Untitled Project",
      fileName: "Untitled",
      fileFormat: "json",
      dirty: false,
    });
  },
}));
