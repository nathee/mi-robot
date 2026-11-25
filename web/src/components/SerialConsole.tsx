"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Download, Terminal, Trash2 } from "lucide-react";
import {
  formatLogLine,
  useSerialStore,
  type SerialLogDirection,
} from "@/stores/useSerialStore";
import { triggerTextDownload } from "./Toolbar";
import { useT } from "@/lib/i18n/useT";

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
  const t = useT();
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
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <Terminal className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          <span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("console.title")}
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
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

        <div className="flex shrink-0 items-center gap-2">
          {expanded && (
            <>
              <label className="hidden cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 sm:inline-flex dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showTimeline}
                  onChange={(e) => setShowTimeline(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-sky-500"
                />
                {t("console.time")}
              </label>
              <label className="mr-1 hidden cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 sm:inline-flex dark:text-slate-400">
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
                title={t("console.copy")}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span className="hidden sm:inline">{copied ? t("common.copied") : t("common.copy")}</span>
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={logs.length === 0}
                title={t("console.clear")}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Trash2 className="h-3 w-3" />
                <span className="hidden sm:inline">{t("common.clear")}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveText}
                disabled={logs.length === 0}
                title={t("console.export")}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-sky-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
              >
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">{t("toolbar.save")}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? t("console.collapse") : t("console.expand")}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Log Body */}
      {expanded && (
        <div
          ref={listRef}
          className="selectable mx-4 mb-3 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-950 px-3.5 py-2.5 font-mono text-xs leading-relaxed dark:border-slate-800"
        >
          {logs.length === 0 ? (
            <div className="text-slate-500">{t("console.empty")}</div>
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
