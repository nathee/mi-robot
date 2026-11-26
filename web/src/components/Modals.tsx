"use client";

import { useState } from "react";
import { AlertTriangle, Bot, Clock, Download, ExternalLink, RotateCcw, Save, Trash2, Usb, X } from "lucide-react";
import { APP_NAME } from "@/lib/appConfig";
import {
  formatRelativeTime,
  type WorkspaceHistoryEntry,
} from "@/lib/storage/workspaceStorage";
import { useEscapeKey } from "./ui";
import { useT } from "@/lib/i18n/useT";

interface TextPromptModalProps {
  open: boolean;
  title: string;
  description: string;
  initialValue: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

function TextPromptModalInner({
  title,
  description,
  initialValue,
  confirmLabel,
  onConfirm,
  onClose,
}: Omit<TextPromptModalProps, "open">) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");

  useEscapeKey(true, onClose);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t("modal.nameEmpty"));
      return;
    }
    onConfirm(trimmed);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-ui-in w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
            >
              {confirmLabel ?? t("toolbar.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TextPromptModal(props: TextPromptModalProps) {
  if (!props.open) return null;
  return <TextPromptModalInner key={props.initialValue} {...props} />;
}

interface IntroModalProps {
  open: boolean;
  onClose: () => void;
}

/** Welcome dialog shown every time the site opens (above the robot selector). */
export function IntroModal({ open, onClose }: IntroModalProps) {
  const t = useT();
  useEscapeKey(open, onClose);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-ui-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-500">
          <Bot className="h-6 w-6" aria-hidden />
        </div>
        <h3 id="intro-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {APP_NAME}
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("intro.desc")}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("intro.author")}</p>
        <a
          href="https://cms.eleccom.in.th/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          cms.eleccom.in.th
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
        >
          {t("intro.start")}
        </button>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const t = useT();
  useEscapeKey(open, onClose);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-ui-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 rounded-xl p-2 ${
              danger ? "bg-rose-500/12 text-rose-500" : "bg-amber-500/12 text-amber-500"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition ${
              danger ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {confirmLabel ?? t("modal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

interface DownloadRobotModalProps {
  open: boolean;
  gcodePreview: string;
  targetCount: number;
  sourceLabel?: string;
  onDownloadGcode: () => void;
  onSendWebSerial: (baudRate: number) => Promise<void>;
  onClose: () => void;
}

function DownloadRobotModalInner({
  gcodePreview,
  targetCount,
  sourceLabel,
  onDownloadGcode,
  onSendWebSerial,
  onClose,
}: Omit<DownloadRobotModalProps, "open">) {
  const t = useT();
  const [sending, setSending] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [serialError, setSerialError] = useState("");
  const hasWebSerial = typeof navigator !== "undefined" && "serial" in navigator;

  useEscapeKey(true, onClose);

  const handleSerial = async () => {
    setSending(true);
    setSerialError("");
    try {
      await onSendWebSerial(baudRate);
      onClose();
    } catch (err) {
      setSerialError(err instanceof Error ? err.message : t("modal.serialFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("modal.sendTitle")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-ui-in w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("modal.sendTitleCount", { n: targetCount, source: sourceLabel ?? t("modal.sourceWaypoints") })}
          </h3>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("modal.sendHintBefore")}<code>.gcode</code>{t("modal.sendHintAfter")}
        </p>

        <pre className="selectable mt-3 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-400 dark:border-slate-800">
          {gcodePreview || `; ${t("modal.noCommands")}`}
        </pre>

        {serialError && (
          <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-500">
            {serialError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            disabled={!targetCount}
            onClick={() => {
              onDownloadGcode();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-400"
          >
            <Download className="h-3.5 w-3.5" />
            {t("modal.saveGcode")}
          </button>
          <select
            aria-label={t("hw.baud")}
            title={t("hw.baud")}
            disabled={sending}
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            {BAUD_RATES.map((b) => (
              <option key={b} value={b}>
                {b} bps
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!targetCount || !hasWebSerial || sending}
            onClick={handleSerial}
            title={
              hasWebSerial
                ? t("modal.serialTitle")
                : t("modal.serialUnsupported")
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
          >
            <Usb className="h-3.5 w-3.5" />
            {sending ? t("modal.sending") : t("modal.streamUsb")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DownloadRobotModal(props: DownloadRobotModalProps) {
  if (!props.open) return null;
  return <DownloadRobotModalInner {...props} />;
}

interface HistoryModalProps {
  open: boolean;
  entries: WorkspaceHistoryEntry[];
  isDirty: boolean;
  onSaveNow: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

function HistoryModalInner({
  entries,
  isDirty,
  onSaveNow,
  onRestore,
  onDelete,
  onClearAll,
  onClose,
}: Omit<HistoryModalProps, "open">) {
  const t = useT();
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  useEscapeKey(true, onClose);

  const handleRestoreClick = (id: string) => {
    if (isDirty) {
      setConfirmRestoreId(id);
    } else {
      onRestore(id);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("modal.history")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-ui-in flex max-h-[82vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("modal.historyCount", { n: entries.length })}
            </h3>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Strip */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/50">
          <span className="text-slate-500 dark:text-slate-400">
            {t("modal.autoSaved")}
          </span>
          <button
            type="button"
            onClick={onSaveNow}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
          >
            <Save className="h-3.5 w-3.5" />
            {t("modal.saveSnapshot")}
          </button>
        </div>

        {/* Unsaved Confirmation Banner */}
        {confirmRestoreId && (
          <div className="mx-5 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <p className="font-semibold">{t("modal.unsaved")}</p>
            <p className="mt-0.5 text-[11px] opacity-90">
              {t("modal.unsavedQuestion")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onSaveNow();
                  onRestore(confirmRestoreId);
                  setConfirmRestoreId(null);
                  onClose();
                }}
                className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
              >
                {t("modal.saveRestore")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestore(confirmRestoreId);
                  setConfirmRestoreId(null);
                  onClose();
                }}
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
              >
                {t("modal.discardRestore")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestoreId(null)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* History List */}
        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-700">
              {t("modal.noSnapshotsBefore")}<strong>{t("modal.saveSnapshot")}</strong>{t("modal.noSnapshotsMid")}{" "}
              <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Ctrl+S
              </kbd>
              .
            </div>
          ) : (
            entries.map((entry) => {
              const dt = new Date(entry.savedAt);
              const dateStr = dt.toLocaleString();
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 transition hover:border-sky-400/60 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {entry.data.projectName}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {entry.note}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{formatRelativeTime(entry.savedAt)}</span>
                      <span>·</span>
                      <span className="font-mono text-[10px]">{dateStr}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-[10px] text-slate-500">
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-600 dark:text-sky-400">
                        {t("modal.nWaypoints", { n: entry.data.pathTargets.length })}
                      </span>
                      <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-purple-600 dark:text-purple-400">
                        {t("modal.nBlocks", { n: entry.data.blocks.length })}
                      </span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                        {entry.data.codeMode}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRestoreClick(entry.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-400"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t("modal.restore")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      title={t("modal.deleteSnapshot")}
                      aria-label={`${t("modal.deleteSnapshot")} ${entry.data.projectName}`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button
            type="button"
            disabled={entries.length === 0}
            onClick={onClearAll}
            className="text-xs font-medium text-rose-500 transition hover:text-rose-400 disabled:opacity-40"
          >
            {t("modal.clearHistory")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HistoryModal(props: HistoryModalProps) {
  if (!props.open) return null;
  return <HistoryModalInner {...props} />;
}
