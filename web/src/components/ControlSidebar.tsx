"use client";

import { Code2, Route, Sliders, Wrench } from "lucide-react";
import { useCodeStore } from "@/stores/useCodeStore";
import { usePathStore } from "@/stores/usePathStore";
import { useViewerStore, type SidebarPanel } from "@/stores/useViewerStore";
import { CodePanel } from "./CodePanel";
import { JogPanel } from "./JogPanel";
import { PathPanel } from "./PathPanel";
import { ToolPanel } from "./ToolPanel";
import { useT } from "@/lib/i18n/useT";
import type { MessageKey } from "@/lib/i18n";

interface ControlSidebarProps {
  onRequestRenameTarget: (index: number, currentName: string) => void;
  onRequestClearTargets: () => void;
}

const TABS: Array<{ id: SidebarPanel; label: MessageKey; icon: typeof Sliders }> = [
  { id: "JOG", label: "sidebar.manual", icon: Sliders },
  { id: "TOOLS", label: "sidebar.tools", icon: Wrench },
  { id: "PATH", label: "sidebar.path", icon: Route },
  { id: "CODE", label: "sidebar.code", icon: Code2 },
];

export function ControlSidebar({
  onRequestRenameTarget,
  onRequestClearTargets,
}: ControlSidebarProps) {
  const t = useT();
  const sidebarPanel = useViewerStore((s) => s.sidebarPanel);
  const setField = useViewerStore((s) => s.setField);
  const targetsCount = usePathStore((s) => s.targets.length);
  const pathPlaying = usePathStore((s) => s.status === "PLAYING");
  const codeRunning = useCodeStore((s) => s.status === "RUNNING");

  return (
    <aside className="flex h-full flex-col border-t border-slate-200/90 bg-slate-50/70 md:border-t-0 md:border-l dark:border-slate-800 dark:bg-slate-950">
      {/* Primary Underline Navigation: Manual | Tools | Path | Code */}
      <nav
        role="tablist"
        aria-label={t("sidebar.panels")}
        className="grid shrink-0 grid-cols-4 border-b border-slate-200/90 bg-white px-1 dark:border-slate-800 dark:bg-slate-900/95"
      >
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
              className={`relative inline-flex h-11 items-center justify-center gap-1.5 border-b-2 px-1 text-xs font-semibold transition ${
                active
                  ? "border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t(label)}</span>
              {id === "PATH" && targetsCount > 0 && !isLive && (
                <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none tabular-nums text-sky-600 dark:text-sky-400">
                  {targetsCount}
                </span>
              )}
              {isLive && (
                <span
                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
                  title={t("common.running")}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
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
