"use client";

import { useEffect, useRef } from "react";
import { Download, Trash2 } from "lucide-react";
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

export function SerialConsole() {
  const logs = useSerialStore((s) => s.logs);
  const showTimeline = useSerialStore((s) => s.showTimeline);
  const showMilliseconds = useSerialStore((s) => s.showMilliseconds);
  const clear = useSerialStore((s) => s.clear);
  const setShowTimeline = useSerialStore((s) => s.setShowTimeline);
  const setShowMilliseconds = useSerialStore((s) => s.setShowMilliseconds);
  const formatConsoleText = useSerialStore((s) => s.formatConsoleText);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSaveText = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    triggerTextDownload(`mirobot-console-${ts}.txt`, formatConsoleText(), "text/plain");
  };

  return (
    <section className="flex h-full flex-col bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 pb-1.5">
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Trash2 className="h-3 w-3" />
          Clear Console
        </button>

        <button
          type="button"
          onClick={handleSaveText}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
        >
          <Download className="h-3 w-3" />
          Save Text
        </button>

        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showTimeline}
            onChange={(e) => setShowTimeline(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-sky-500"
          />
          Timeline
        </label>

        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showMilliseconds}
            disabled={!showTimeline}
            onChange={(e) => setShowMilliseconds(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-sky-500 disabled:opacity-40"
          />
          Milliseconds
        </label>
      </div>

      <div
        ref={listRef}
        className="selectable flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-950 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed dark:border-slate-800"
      >
        {logs.map((entry) => (
          <div key={entry.id} className={logToneClass(entry.dir)}>
            {formatLogLine(entry, showTimeline, showMilliseconds)}
          </div>
        ))}
      </div>
    </section>
  );
}
