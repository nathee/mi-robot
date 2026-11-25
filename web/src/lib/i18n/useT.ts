"use client";

import { useCallback } from "react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { translate, type MessageKey, type TranslateParams } from "./index";

/** `const t = useT(); t("toolbar.home")` — re-renders when the locale changes. */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback(
    (key: MessageKey, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );
}
