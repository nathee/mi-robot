"use client";

import { Code2, Route, Sliders, Wrench } from "lucide-react";
import { useCodeStore } from "@/stores/useCodeStore";
import { usePathStore } from "@/stores/usePathStore";
import { useViewerStore, type SidebarPanel } from "@/stores/useViewerStore";
import { CodePanel } from "./CodePanel";
import { JogPanel } from "./JogPanel";
import { PathPanel } from "./PathPanel";
import { ToolPanel } from "./ToolPanel";

interface ControlSidebarProps {
  onRequestRenameTarget: (index: number, currentName: string) => void;
  onRequestClearTargets: () => void;
}

const TABS: Array<{ id: SidebarPanel; label: string; icon: typeof Sliders }> = [
  { id: "JOG", label: "Manual", icon: Sliders },
  { id: "TOOLS", label: "Tools", icon: Wrench },
  { id: "PATH", label: "Path", icon: Route },
  { id: "CODE", label: "Code", icon: Code2 },
];

export function ControlSidebar({
  onRequestRenameTarget,
  onRequestClearTargets,
}: ControlSidebarProps) {
  const sidebarPanel = useViewerStore((s) => s.sidebarPanel);
  const setField = useViewerStore((s) => s.setField);
  const targetsCount = usePathStore((s) => s.targets.length);
  const pathPlaying = usePathStore((s) => s.status === "PLAYING");
  const codeRunning = useCodeStore((s) => s.status === "RUNNING");

  return (
    <aside className="flex h-full flex-col border-t border-slate-200/90 bg-white md:border-t-0 md:border-l dark:border-slate-800 dark:bg-slate-950">
      {/* Segmented Navigation: Manual | Tools | Path | Code */}
      <div className="shrink-0 border-b border-slate-200/80 bg-slate-50/70 p-1.5 dark:border-slate-800/90 dark:bg-slate-900/50">
        <div role="tablist" aria-label="Control panels" className="grid grid-cols-4 gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = sidebarPanel === id;
            const isLive = (id === "PATH" && pathPlaying) || (id === "CODE" && codeRunning);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setField("sidebarPanel", id)}
                className={`relative inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-white text-sky-600 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-sky-400 dark:ring-slate-700/70"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
                {id === "PATH" && targetsCount > 0 && !isLive && (
                  <span className="rounded-full bg-sky-500/15 px-1.5 font-mono text-[10px] font-bold tabular-nums text-sky-600 dark:text-sky-400">
                    {targetsCount}
                  </span>
                )}
                {isLive && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
                    title="Running"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {sidebarPanel === "JOG" ? (
          <JogPanel />
        ) : sidebarPanel === "TOOLS" ? (
          <ToolPanel />
        ) : sidebarPanel === "PATH" ? (
          <PathPanel
            onRequestRenameTarget={onRequestRenameTarget}
            onRequestClearTargets={onRequestClearTargets}
          />
        ) : (
          <CodePanel />
        )}
      </div>
    </aside>
  );
}
