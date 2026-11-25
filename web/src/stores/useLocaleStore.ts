import { create } from "zustand";
import {
  detectLocale,
  LOCALE_STORAGE_KEY,
  setCurrentLocale,
  type Locale,
} from "@/lib/i18n";

interface LocaleState {
  locale: Locale;
  init: () => void;
  setLocale: (next: Locale) => void;
}

function applyDomLang(locale: Locale): void {
  setCurrentLocale(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  // Always "en" until init() runs in an effect, so server HTML and first client render match.
  locale: "en",

  init() {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
    const locale = detectLocale(saved, typeof navigator !== "undefined" ? navigator.language : undefined);
    applyDomLang(locale);
    set({ locale });
  },

  setLocale(next) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* storage blocked */
    }
    applyDomLang(next);
    set({ locale: next });
  },
}));
