import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "auto";

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  init: () => void;
  setMode: (next: ThemeMode) => void;
  apply: () => void;
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  const hour = new Date().getHours();
  return !(hour >= 7 && hour < 18);
}

function applyDomTheme(isDark: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.toggle("light", !isDark);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "auto",
  isDark: true,

  init() {
    let saved: ThemeMode = "auto";
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("themeMode");
      if (raw === "dark" || raw === "light" || raw === "auto") {
        saved = raw;
      }
    }
    const isDark = resolveIsDark(saved);
    set({ mode: saved, isDark });
    applyDomTheme(isDark);
  },

  setMode(next) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("themeMode", next);
    }
    const isDark = resolveIsDark(next);
    set({ mode: next, isDark });
    applyDomTheme(isDark);
  },

  apply() {
    const isDark = resolveIsDark(get().mode);
    set({ isDark });
    applyDomTheme(isDark);
  },
}));
