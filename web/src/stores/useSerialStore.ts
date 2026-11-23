import { create } from "zustand";

export type SerialLogDirection = "sys" | "in" | "out" | "ok" | "error";

export interface SerialLogEntry {
  id: number;
  dir: SerialLogDirection;
  text: string;
  ts: number;
}

interface SerialState {
  logs: SerialLogEntry[];
  showTimeline: boolean;
  showMilliseconds: boolean;
  initReady: () => void;
  appendLog: (entry: { dir?: SerialLogDirection; text: string; ts?: number }) => void;
  clear: () => void;
  setShowTimeline: (v: boolean) => void;
  setShowMilliseconds: (v: boolean) => void;
  formatConsoleText: () => string;
}

let nextLogId = 1;

export function formatConsoleTimestamp(ts: number, withMs: boolean): string {
  const d = new Date(ts);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return withMs ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
}

export function formatLogLine(
  entry: SerialLogEntry,
  showTimeline: boolean,
  showMilliseconds: boolean
): string {
  const prefix = showTimeline ? `[${formatConsoleTimestamp(entry.ts, showMilliseconds)}] ` : "";
  const dirTag =
    entry.dir === "in" ? "RX " : entry.dir === "out" ? "TX " : "";
  return `${prefix}${dirTag}${entry.text}`;
}

export const useSerialStore = create<SerialState>((set, get) => ({
  logs: [],
  showTimeline: true,
  showMilliseconds: true,

  initReady() {
    if (get().logs.length > 0) return;
    set({
      logs: [
        {
          id: nextLogId++,
          dir: "ok",
          text: "Console ready.",
          ts: Date.now(),
        },
      ],
    });
  },

  appendLog({ dir = "sys", text, ts = Date.now() }) {
    const inferredDir: SerialLogDirection =
      dir === "sys" && /^ERROR:/i.test(text) ? "error" : dir;
    set((state) => {
      const next = [...state.logs, { id: nextLogId++, dir: inferredDir, text, ts }];
      // Cap log history at 1,500 lines to keep UI snappy
      return { logs: next.length > 1500 ? next.slice(next.length - 1500) : next };
    });
  },

  clear() {
    set({
      logs: [
        {
          id: nextLogId++,
          dir: "ok",
          text: "Console cleared.",
          ts: Date.now(),
        },
      ],
    });
  },

  setShowTimeline(v) {
    set({ showTimeline: v });
  },

  setShowMilliseconds(v) {
    set({ showMilliseconds: v });
  },

  formatConsoleText() {
    const { logs, showTimeline, showMilliseconds } = get();
    return logs.map((entry) => formatLogLine(entry, showTimeline, showMilliseconds)).join("\n") + "\n";
  },
}));
