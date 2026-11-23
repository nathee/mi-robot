"use client";

import { Route, Sliders } from "lucide-react";
import { usePathStore } from "@/stores/usePathStore";
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
  const targetsCount = usePathStore((s) => s.targets.length);

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Clean Full-Width Tabs */}
      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 p-1.5 dark:border-slate-800 dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => setField("sidebarPanel", "JOG")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            sidebarPanel === "JOG"
              ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Manual Control</span>
        </button>

        <button
          type="button"
          onClick={() => setField("sidebarPanel", "PATH")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            sidebarPanel === "PATH"
              ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Route className="h-3.5 w-3.5" />
          <span>Auto Path</span>
          {targetsCount > 0 && (
            <span className="rounded-full bg-sky-500/15 px-1.5 py-0.2 font-mono text-[10px] font-bold text-sky-600 dark:text-sky-400">
              {targetsCount}
            </span>
          )}
        </button>
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
