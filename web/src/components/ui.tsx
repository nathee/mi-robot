"use client";

import { useEffect, useState } from "react";

/**
 * Calls `onClose` when the user presses Escape while `enabled` is true.
 */
export function useEscapeKey(enabled: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onClose]);
}

export interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  title?: string;
}

function formatNumber(val: number, precision: number): string {
  if (!Number.isFinite(val)) return "0";
  const rounded = Number(val.toFixed(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Controlled numeric input that preserves an editable string draft while focused,
 * allowing users to freely clear the field, type a leading `-`, or type decimals
 * without snapping back to `0` on every keystroke.
 */
export function NumericInput({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  precision = 1,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
  title,
}: NumericInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatNumber(value, precision));

  const clamp = (n: number): number => {
    let next = n;
    if (typeof min === "number" && next < min) next = min;
    if (typeof max === "number" && next > max) next = max;
    return next;
  };

  const displayValue = focused ? draft : formatNumber(value, precision);

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim();
    const parsed = trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-." ? NaN : Number(trimmed);
    if (Number.isFinite(parsed)) {
      const clamped = clamp(parsed);
      onChange(clamped);
      onCommit?.(clamped);
      setDraft(formatNumber(clamped, precision));
    } else {
      setDraft(formatNumber(value, precision));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      value={displayValue}
      onFocus={(e) => {
        setFocused(true);
        setDraft(formatNumber(value, precision));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow intermediate typing states: empty, "-", ".", "-."
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        setDraft(raw);
        if (raw !== "" && raw !== "-" && raw !== "." && raw !== "-.") {
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) {
            onChange(clamp(parsed));
          }
        }
      }}
      onBlur={() => {
        setFocused(false);
        commitDraft(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commitDraft(draft);
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(formatNumber(value, precision));
          setFocused(false);
          e.currentTarget.blur();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const base = Number.isFinite(Number(draft)) && draft !== "" ? Number(draft) : value;
          const delta = (e.key === "ArrowUp" ? 1 : -1) * step;
          const next = clamp(Number((base + delta).toFixed(precision)));
          setDraft(formatNumber(next, precision));
          onChange(next);
          onCommit?.(next);
        }
      }}
      className={`no-spin tabular-nums ${className}`}
    />
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 disabled:cursor-not-allowed disabled:opacity-45 ${
        checked ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
