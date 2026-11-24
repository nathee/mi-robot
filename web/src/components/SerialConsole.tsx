"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Download, Terminal, Trash2 } from "lucide-react";
import {
  formatLogLine,
  useSerialStore,
  type SerialLogDirection,
} from "@/stores/useSerialStore";
import { triggerTextDownload } from "./Toolbar";

function logToneClass(dir: SerialLogDirection): string {
  if (dir === "error") return "text-rose-400";
  if (dir === "ok") return "text-emerald-400";
  if (dir === "in") return "text-amber-300";
  if (dir === "out") return "text-sky-400";
  return "text-slate-300";
}

function previewToneClass(dir: SerialLogDirection): string {
  if (dir === "error") return "text-rose-600 dark:text-rose-400";
  if (dir === "ok") return "text-emerald-600 dark:text-emerald-400";
  if (dir === "in") return "text-amber-600 dark:text-amber-300";
  if (dir === "out") return "text-sky-600 dark:text-sky-400";
  return "text-slate-500 dark:text-slate-400";
}

interface SerialConsoleProps {
  expanded: boolean;
  onToggleExpand: () => void;
}

export function SerialConsole({ expanded, onToggleExpand }: SerialConsoleProps) {
  const logs = useSerialStore((s) => s.logs);
  const showTimeline = useSerialStore((s) => s.showTimeline);
  const showMilliseconds = useSerialStore((s) => s.showMilliseconds);
  const clear = useSerialStore((s) => s.clear);
  const setShowTimeline = useSerialStore((s) => s.setShowTimeline);
  const setShowMilliseconds = useSerialStore((s) => s.setShowMilliseconds);
  const formatConsoleText = useSerialStore((s) => s.formatConsoleText);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  const handleSaveText = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    triggerTextDownload(`mirobot-console-${ts}.txt`, formatConsoleText(), "text/plain");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatConsoleText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable in insecure context
    }
  };

  const latest = logs[logs.length - 1];

  return (
    <section className="flex h-full flex-col border-t border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/95">
      {/* Compact Header / Collapsed Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Terminal className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          <span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Console
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {logs.length}
          </span>
          {!expanded && latest && (
            <span className={`flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] ${previewToneClass(latest.dir)}`}>
              {latest.dir === "error" && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              )}
              <span className="truncate">{latest.text}</span>
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {expanded && (
            <>
              <label className="hidden cursor-pointer items-center gap-1 text-[11px] text-slate-500 sm:inline-flex dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showTimeline}
                  onChange={(e) => setShowTimeline(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-sky-500"
                />
                Time
              </label>
              <label className="mr-1 hidden cursor-pointer items-center gap-1 text-[11px] text-slate-500 sm:inline-flex dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showMilliseconds}
                  disabled={!showTimeline}
                  onChange={(e) => setShowMilliseconds(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-sky-500 disabled:opacity-40"
                />
                ms
              </label>
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={logs.length === 0}
                title="Copy Console Log"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={logs.length === 0}
                title="Clear Console"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Trash2 className="h-3 w-3" />
                <span className="hidden sm:inline">Clear</span>
              </button>
              <button
                type="button"
                onClick={handleSaveText}
                disabled={logs.length === 0}
                title="Export Console Log (.txt)"
                className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
              >
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse console" : "Expand console"}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Log Body */}
      {expanded && (
        <div
          ref={listRef}
          className="selectable mx-2.5 mb-2 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed dark:border-slate-800"
        >
          {logs.length === 0 ? (
            <div className="text-slate-500">Console is empty.</div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className={logToneClass(entry.dir)}>
                {formatLogLine(entry, showTimeline, showMilliseconds)}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
