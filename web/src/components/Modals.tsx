"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Download, RotateCcw, Save, Trash2, Usb, X } from "lucide-react";
import {
  formatRelativeTime,
  type WorkspaceHistoryEntry,
} from "@/lib/storage/workspaceStorage";

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
  confirmLabel = "Save",
  onConfirm,
  onClose,
}: Omit<TextPromptModalProps, "open">) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    onConfirm(trimmed);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              {confirmLabel}
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
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 rounded-lg p-2 ${
              danger
                ? "bg-rose-500/10 text-rose-500"
                : "bg-amber-500/10 text-amber-500"
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
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white ${
              danger ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DownloadRobotModalProps {
  open: boolean;
  gcodePreview: string;
  targetCount: number;
  onDownloadGcode: () => void;
  onSendWebSerial: () => Promise<void>;
  onClose: () => void;
}

export function DownloadRobotModal({
  open,
  gcodePreview,
  targetCount,
  onDownloadGcode,
  onSendWebSerial,
  onClose,
}: DownloadRobotModalProps) {
  const [sending, setSending] = useState(false);
  const [serialError, setSerialError] = useState("");
  const hasWebSerial = typeof navigator !== "undefined" && "serial" in navigator;

  if (!open) return null;

  const handleSerial = async () => {
    setSending(true);
    setSerialError("");
    try {
      await onSendWebSerial();
      onClose();
    } catch (err) {
      setSerialError(err instanceof Error ? err.message : "Failed to send over Web Serial");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Download Program to Robot ({targetCount} targets)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Preview generated WLKATA G-code below. You can save it as a <code>.gcode</code> file or
          stream directly to a connected WLKATA Mirobot over USB Web Serial (115200 baud).
        </p>

        <pre className="selectable mt-3 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-400 dark:border-slate-800">
          {gcodePreview || "; No targets taught yet"}
        </pre>

        {serialError && (
          <p className="mt-2 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-500">
            {serialError}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!targetCount}
            onClick={() => {
              onDownloadGcode();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-400"
          >
            <Download className="h-3.5 w-3.5" />
            Save .gcode File
          </button>
          <button
            type="button"
            disabled={!targetCount || !hasWebSerial || sending}
            onClick={handleSerial}
            title={
              hasWebSerial
                ? "Connect to WLKATA Mirobot via Web Serial (115200 baud)"
                : "Web Serial API is only supported in Chromium-based browsers"
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
          >
            <Usb className="h-3.5 w-3.5" />
            {sending ? "Sending..." : "Stream via USB Serial"}
          </button>
        </div>
      </div>
    </div>
  );
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

export function HistoryModal({
  open,
  entries,
  isDirty,
  onSaveNow,
  onRestore,
  onDelete,
  onClearAll,
  onClose,
}: HistoryModalProps) {
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  if (!open) return null;

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-sky-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Work History ({entries.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Strip */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/50">
          <span className="text-slate-500 dark:text-slate-400">
            Your workspace auto-saves locally on every change.
          </span>
          <button
            type="button"
            onClick={onSaveNow}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            <Save className="h-3.5 w-3.5" />
            Save Snapshot
          </button>
        </div>

        {/* Unsaved Confirmation Banner inside modal */}
        {confirmRestoreId && (
          <div className="mx-5 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <p className="font-semibold">You have unsaved changes in the current project.</p>
            <p className="mt-0.5 text-[11px] opacity-90">
              Save a snapshot of your current work before restoring, or discard and restore now?
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
                className="rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
              >
                Save Current & Restore
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestore(confirmRestoreId);
                  setConfirmRestoreId(null);
                  onClose();
                }}
                className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
              >
                Discard & Restore
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestoreId(null)}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* History List */}
        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-700">
              No saved snapshots yet. Click <strong>Save Snapshot</strong> (or press{" "}
              <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Ctrl+S
              </kbd>
              ) to store a version you can return to anytime.
            </div>
          ) : (
            entries.map((entry) => {
              const dt = new Date(entry.savedAt);
              const dateStr = dt.toLocaleString();
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-sky-400/60 dark:border-slate-800 dark:bg-slate-950/60"
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
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{formatRelativeTime(entry.savedAt)}</span>
                      <span>·</span>
                      <span className="font-mono text-[10px]">{dateStr}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px] text-slate-500">
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-600 dark:text-sky-400">
                        {entry.data.pathTargets.length} waypoints
                      </span>
                      <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-purple-600 dark:text-purple-400">
                        {entry.data.blocks.length} blocks
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
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-600 hover:bg-sky-500/20 dark:text-sky-400"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      title="Delete snapshot"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50"
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
            className="text-xs font-medium text-rose-500 hover:text-rose-400 disabled:opacity-40"
          >
            Clear History
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
