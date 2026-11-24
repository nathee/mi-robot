"use client";

import { useEffect, useState } from "react";

function getUtcOffsetString(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const hrs = Math.floor(absMin / 60);
  const mins = absMin % 60;
  return mins === 0 ? `UTC${sign}${hrs}` : `UTC${sign}${hrs}:${String(mins).padStart(2, "0")}`;
}

function formatClock(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function StatusBar() {
  const [clock, setClock] = useState("");
  const [utcOffset, setUtcOffset] = useState("UTC");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(formatClock(now));
      setUtcOffset(getUtcOffsetString(now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-slate-200/90 bg-white px-4 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-400">
      <div className="hidden items-center gap-2 truncate sm:flex">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            LMB
          </kbd>
          Orbit
        </span>
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            RMB
          </kbd>
          Pan
        </span>
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Scroll
          </kbd>
          Zoom
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 sm:flex-initial">
        <span className="truncate">
          <a
            href="https://www.wlkata.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sky-600 hover:underline dark:hover:text-sky-400"
          >
            WLKATA Robotics
          </a>
          {" · "}
          <a
            href="https://www.inex.co.th/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sky-600 hover:underline dark:hover:text-sky-400"
          >
            inex
          </a>
          <span className="hidden md:inline">
            {" · "}
            <a
              href="https://cms.eleccom.in.th/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-600 hover:underline dark:hover:text-sky-400"
            >
              Eleccom, Thailand
            </a>
          </span>
        </span>

        <span className="hidden h-3 w-px bg-slate-200 sm:inline-block dark:bg-slate-800" />

        <span className="hidden shrink-0 font-mono text-[10px] tabular-nums text-slate-400 sm:inline">
          {clock || "--:--:--"} ({utcOffset})
        </span>
      </div>
    </footer>
  );
}
