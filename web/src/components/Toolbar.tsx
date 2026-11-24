"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Cable,
  Check,
  ChevronDown,
  Clock,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Home,
  Monitor,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RotateCcw,
  Save,
  Sun,
} from "lucide-react";
import { useCodeStore } from "@/stores/useCodeStore";
import { useHardwareStore } from "@/stores/useHardwareStore";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { usePathStore } from "@/stores/usePathStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useThemeStore, type ThemeMode } from "@/stores/useThemeStore";
import { APP_NAME } from "@/lib/appConfig";
import { useEscapeKey } from "./ui";

interface ToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onRequestRenameProject: () => void;
  onRequestNewProgram: () => void;
  onRequestDownloadRobot: () => void;
  onRequestOpenHistory: () => void;
  onRequestOpenHardware: () => void;
  onRequestResetWorkspace: () => void;
}

export function triggerTextDownload(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "auto"];

export function Toolbar({
  sidebarOpen,
  onToggleSidebar,
  onRequestRenameProject,
  onRequestNewProgram,
  onRequestDownloadRobot,
  onRequestOpenHistory,
  onRequestOpenHardware,
  onRequestResetWorkspace,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  const projectName = useProjectStore((s) => s.name);
  const fileName = useProjectStore((s) => s.fileName);
  const dirty = useProjectStore((s) => s.dirty);
  const setDirty = useProjectStore((s) => s.setDirty);
  const setFileMeta = useProjectStore((s) => s.setFileMeta);

  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const historyCount = useHistoryStore((s) => s.entries.length);
  const saveToHistory = useHistoryStore((s) => s.saveToHistory);
  const hwConnected = useHardwareStore((s) => s.connected);
  const hwRxCount = useHardwareStore((s) => s.rxCount);

  const targetsCount = usePathStore((s) => s.targets.length);
  const blocksCount = useCodeStore((s) => s.blocks.length);
  const scriptNonEmpty = useCodeStore((s) => s.scriptText.trim().length > 0);
  const gcodeNonEmpty = useCodeStore((s) => s.gcodeText.trim().length > 0);
  const getCodeGcode = useCodeStore((s) => s.getExportableGcode);
  const importProgramText = usePathStore((s) => s.importProgramText);
  const exportJsonString = usePathStore((s) => s.exportJsonString);
  const exportGcodeString = usePathStore((s) => s.exportGcodeString);
  const cancelPath = usePathStore((s) => s.cancelForManualControl);
  const setHome = useRobotStore((s) => s.setHome);
  const appendLog = useSerialStore((s) => s.appendLog);

  const hasExportableGcode = targetsCount > 0 || blocksCount > 0 || scriptNonEmpty || gcodeNonEmpty;

  useEscapeKey(fileMenuOpen, () => setFileMenuOpen(false));

  useEffect(() => {
    if (!fileMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [fileMenuOpen]);

  const safeSlug =
    (projectName || fileName || "mirobot-program")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "mirobot-program";

  const handleSaveFile = (fmt: "json" | "gcode") => {
    setFileMenuOpen(false);
    if (fmt === "gcode") {
      const content = targetsCount > 0 ? exportGcodeString() : getCodeGcode();
      if (!content) {
        appendLog({ dir: "error", text: "[EXPORT] Nothing valid to export as G-code." });
        return;
      }
      triggerTextDownload(`${safeSlug}.gcode`, content, "text/plain");
      setFileMeta({ fileName: safeSlug, fileFormat: "gcode", dirty: false });
      saveToHistory("Exported G-code");
      appendLog({ dir: "ok", text: `[EXPORT] Saved ${safeSlug}.gcode` });
    } else {
      triggerTextDownload(`${safeSlug}.json`, exportJsonString(), "application/json");
      setFileMeta({ fileName: safeSlug, fileFormat: "json", dirty: false });
      setDirty(false);
      saveToHistory("Saved JSON");
      appendLog({ dir: "ok", text: `[PATH] Saved ${safeSlug}.json` });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      importProgramText(file.name, text);
      saveToHistory(`Opened ${file.name}`);
    } catch (err) {
      appendLog({
        dir: "error",
        text: `ERROR: ${err instanceof Error ? err.message : "Failed to load file"}`,
      });
    }
  };

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(themeMode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setThemeMode(next);
  };

  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "dark" ? Moon : Monitor;
  const themeLabel =
    themeMode === "light" ? "Light theme" : themeMode === "dark" ? "Dark theme" : "Auto theme";

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white px-4 dark:border-slate-800 dark:bg-slate-900/95">
      {/* Left: Brand & Editable Project Title */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <span
            className="hidden max-w-[16rem] truncate text-[13px] font-bold tracking-tight text-slate-900 sm:inline lg:max-w-[24rem] dark:text-white"
            title={APP_NAME}
          >
            {APP_NAME}
          </span>
        </div>

        <div className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-800" />

        <button
          type="button"
          onClick={onRequestRenameProject}
          title="Click to rename project"
          className="group inline-flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-200/80 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-700/80 dark:hover:bg-slate-800/70"
        >
          <span className="max-w-32 truncate sm:max-w-48">{projectName}</span>
          {dirty ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-500/20"
              title="Unsaved changes — press Ctrl+S or click Save"
            />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Saved" />
          )}
          <Pencil className="h-3 w-3 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />
        </button>
      </div>

      {/* Right: Cleanly Grouped Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.gcode,.nc,.tap,.g"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Hardware / RS485 Link */}
        <button
          type="button"
          onClick={onRequestOpenHardware}
          title="Connect USB-RS485 or ESP32 Wi-Fi"
          className={`inline-flex h-8.5 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
            hwConnected
              ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              : "border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              hwConnected ? "animate-pulse bg-emerald-500" : "bg-slate-400"
            }`}
          />
          <Cable className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">RS485</span>
          {hwConnected && hwRxCount > 0 && (
            <span className="font-mono text-[10px] tabular-nums opacity-80">{hwRxCount}</span>
          )}
        </button>

        {/* Save & History Group */}
        <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-50/70 p-0.5 dark:border-slate-800 dark:bg-slate-900/70">
          <button
            type="button"
            onClick={() => saveToHistory("Manual save")}
            title="Save snapshot to Work History (Ctrl+S)"
            className={`inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
              dirty
                ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
                : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{dirty ? "Save" : "Saved"}</span>
          </button>

          <div className="mx-0.5 h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

          <button
            type="button"
            onClick={onRequestOpenHistory}
            title="Work History — view and restore snapshots"
            className="inline-flex h-7.5 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Clock className="h-3.5 w-3.5" />
            {historyCount > 0 && (
              <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {historyCount}
              </span>
            )}
          </button>
        </div>

        {/* File / Program Menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-expanded={fileMenuOpen}
            aria-haspopup="menu"
            onClick={() => setFileMenuOpen((v) => !v)}
            className={`inline-flex h-8.5 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
              fileMenuOpen
                ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5 text-sky-500" />
            <span className="hidden sm:inline">Program</span>
            <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform ${fileMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {fileMenuOpen && (
            <div
              role="menu"
              className="animate-ui-in absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl dark:border-slate-700/80 dark:bg-slate-900"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  onRequestNewProgram();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="flex-1">New Program</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                <span className="flex-1">Open JSON / G-code…</span>
              </button>
              <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSaveFile("json")}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Save className="h-3.5 w-3.5 text-slate-400" />
                <span className="flex-1">Download Project (.json)</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasExportableGcode}
                onClick={() => handleSaveFile("gcode")}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="flex-1">Export WLKATA G-code</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasExportableGcode}
                onClick={() => {
                  setFileMenuOpen(false);
                  onRequestDownloadRobot();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-40 dark:text-sky-400 dark:hover:bg-sky-950/50"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="flex-1">Send to Robot (USB / File)</span>
              </button>
              <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-800" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  onRequestResetWorkspace();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="flex-1">Reset Workspace…</span>
              </button>
            </div>
          )}
        </div>

        <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-800" />

        {/* Primary Home Action */}
        <button
          type="button"
          onClick={() => {
            cancelPath();
            setHome();
          }}
          title="Return robot to Home position (0, 0, 0, 0, 0, 0)"
          className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-500"
        >
          <Home className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Home</span>
        </button>

        {/* Compact Theme Toggle (single clean button cycling Light / Dark / Auto) */}
        <button
          type="button"
          onClick={cycleTheme}
          title={`${themeLabel} — click to switch`}
          aria-label={`${themeLabel} — click to switch`}
          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ThemeIcon className="h-4 w-4" />
        </button>

        {/* Sidebar Collapse / Expand Toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Hide control panel (Ctrl+B)" : "Show control panel (Ctrl+B)"}
          aria-label={sidebarOpen ? "Hide control panel" : "Show control panel"}
          className={`inline-flex h-8.5 w-8.5 items-center justify-center rounded-lg transition ${
            sidebarOpen
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              : "bg-sky-500/15 text-sky-600 hover:bg-sky-500/25 dark:text-sky-400"
          }`}
        >
          {sidebarOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
}
