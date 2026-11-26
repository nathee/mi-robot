"use client";

import { Eye } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useVisitStore } from "@/stores/useVisitStore";

/** Site-wide visit total. Counting starts in RobotGate via useVisitStore.init(). */
export function VisitCounter({ className = "" }: { className?: string }) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const count = useVisitStore((s) => s.count);
  if (count === null) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 tabular-nums ${className}`}
      title={t("visits.title")}
    >
      <Eye className="h-3 w-3" aria-hidden />
      {t("visits.label", { n: count.toLocaleString(locale === "th" ? "th-TH" : "en-US") })}
    </span>
  );
}
