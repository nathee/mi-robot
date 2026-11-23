"use client";

import { useViewerStore } from "@/stores/useViewerStore";
import { JogPanel } from "./JogPanel";
import { PathPanel } from "./PathPanel";

interface ControlSidebarProps {
  onRequestRenameTarget: (index: number, currentName: string) => void;
  onRequestClearTargets: () => void;
}

export function ControlSidebar({
  onRequestRenameTarget,
  onRequestClearTargets,
}: ControlSidebarProps) {
  const sidebarPanel = useViewerStore((s) => s.sidebarPanel);
  const setField = useViewerStore((s) => s.setField);

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <span className="text-xs font-bold tracking-wide text-slate-700 uppercase dark:text-slate-200">
          Control
        </span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setField("sidebarPanel", "JOG")}
            className={`rounded-md px-3 py-0.5 text-xs font-semibold transition ${
              sidebarPanel === "JOG"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            Jog
          </button>
          <button
            type="button"
            onClick={() => setField("sidebarPanel", "PATH")}
            className={`rounded-md px-3 py-0.5 text-xs font-semibold transition ${
              sidebarPanel === "PATH"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            Path
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {sidebarPanel === "JOG" ? (
          <JogPanel />
        ) : (
          <PathPanel
            onRequestRenameTarget={onRequestRenameTarget}
            onRequestClearTargets={onRequestClearTargets}
          />
        )}
      </div>
    </aside>
  );
}
