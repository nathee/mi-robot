import { create } from "zustand";

const SESSION_FLAG = "mirobot:visited";

interface VisitState {
  /** Site-wide visit total; null until loaded or when the counter backend is unavailable. */
  count: number | null;
  /** Counts this page load once per browser session (POST), otherwise just reads (GET). */
  init: () => void;
}

let started = false;

export const useVisitStore = create<VisitState>((set) => ({
  count: null,

  init() {
    if (started) return;
    started = true;

    let firstInSession = false;
    try {
      firstInSession = window.sessionStorage.getItem(SESSION_FLAG) !== "1";
      if (firstInSession) window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* storage blocked: read only, never double count */
    }

    fetch("/api/visits", { method: firstInSession ? "POST" : "GET", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { count: null }))
      .then((data: { count?: unknown }) => {
        if (typeof data.count === "number") set({ count: data.count });
      })
      .catch(() => {});
  },
}));
