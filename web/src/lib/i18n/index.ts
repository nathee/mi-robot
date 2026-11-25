import { en, type MessageKey, type Messages } from "./en";
import { th } from "./th";

export type { MessageKey, Messages };
export type Locale = "en" | "th";
export type TranslateParams = Record<string, string | number>;

export const LOCALES: readonly Locale[] = ["en", "th"];
export const LOCALE_STORAGE_KEY = "locale";
export const DICTIONARIES: Record<Locale, Messages> = { en, th };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "th";
}

/** Browser-language rule. Must match LOCALE_BOOT_SCRIPT in app/layout.tsx. */
export function detectLocale(saved: string | null | undefined, navLang: string | undefined): Locale {
  if (isLocale(saved)) return saved;
  return navLang?.toLowerCase().startsWith("th") ? "th" : "en";
}

function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m,
  );
}

/** Pure lookup: falls back to English, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const text = DICTIONARIES[locale][key] || en[key] || key;
  return interpolate(text, params);
}

// Current locale for non-React code (stores, lib). Kept here, not in a store, so lib/ never
// imports stores/. `useLocaleStore` keeps it in sync.
let currentLocale: Locale = "en";
export function getLocale(): Locale {
  return currentLocale;
}
export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale;
}

/** Translate with the current locale — for stores/log messages. Components use `useT()`. */
export function t(key: MessageKey, params?: TranslateParams): string {
  return translate(currentLocale, key, params);
}
