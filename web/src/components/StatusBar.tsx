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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="truncate">
        <span className="font-semibold text-slate-700 dark:text-slate-300">INSTRUCTION:</span>{" "}
        Hold and drag the <strong className="text-slate-800 dark:text-slate-200">LEFT MOUSE BUTTON</strong> to{" "}
        <strong className="text-slate-800 dark:text-slate-200">ROTATE</strong>;{" "}
        <strong className="text-slate-800 dark:text-slate-200">RIGHT MOUSE BUTTON</strong> to{" "}
        <strong className="text-slate-800 dark:text-slate-200">PAN</strong>.
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span>
          Credits:{" "}
          <a
            href="https://www.wlkata.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:underline dark:text-sky-400"
          >
            WLKATA Robotics
          </a>{" "}
          • Produced by{" "}
          <a
            href="https://www.inex.co.th/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:underline dark:text-sky-400"
          >
            Innovative Experiment Co., Ltd., Thailand
          </a>
        </span>

        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
          DateTime ({utcOffset}) : {clock || "----"}
        </span>

        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          V2.4.7
        </span>
      </div>
    </footer>
  );
}
