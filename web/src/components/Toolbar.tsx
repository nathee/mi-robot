"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
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
  Pencil,
  Save,
  Sun,
} from "lucide-react";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { usePathStore } from "@/stores/usePathStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useThemeStore, type ThemeMode } from "@/stores/useThemeStore";

interface ToolbarProps {
  onRequestRenameProject: () => void;
  onRequestNewProgram: () => void;
  onRequestDownloadRobot: () => void;
  onRequestOpenHistory: () => void;
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

export function Toolbar({
  onRequestRenameProject,
  onRequestNewProgram,
  onRequestDownloadRobot,
  onRequestOpenHistory,
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

  const targetsCount = usePathStore((s) => s.targets.length);
  const importProgramText = usePathStore((s) => s.importProgramText);
  const exportJsonString = usePathStore((s) => s.exportJsonString);
  const exportGcodeString = usePathStore((s) => s.exportGcodeString);
  const cancelPath = usePathStore((s) => s.cancelForManualControl);
  const setHome = useRobotStore((s) => s.setHome);
  const appendLog = useSerialStore((s) => s.appendLog);

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
      triggerTextDownload(`${safeSlug}.gcode`, exportGcodeString(), "text/plain");
      setFileMeta({ fileName: safeSlug, fileFormat: "gcode", dirty: false });
      saveToHistory("Exported G-code");
      appendLog({ dir: "ok", text: `[PATH] Exported ${safeSlug}.gcode` });
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

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      {/* Left: Brand & Editable Project Title */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-xs">
            <Bot className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-wide text-slate-900 dark:text-white">
            MIROBOT
          </span>
          <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline dark:bg-slate-800 dark:text-slate-400">
            6-DOF SIM
          </span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={onRequestRenameProject}
          title="Click to rename project"
          className="group inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span className="max-w-44 truncate">{projectName}</span>
          {dirty ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
              title="Unsaved changes — press Ctrl+S or click Save"
            />
          ) : (
            <Check className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Saved" />
          )}
          <Pencil className="h-3 w-3 text-slate-400 opacity-50 transition group-hover:opacity-100" />
        </button>
      </div>

      {/* Right: Save, History, Program File Menu, Home & Theme */}
      <div className="flex items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.gcode,.nc,.tap,.g"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Quick Save Snapshot (Ctrl+S) */}
        <button
          type="button"
          onClick={() => saveToHistory("Manual save")}
          title="Save snapshot to Work History (Ctrl+S)"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            dirty
              ? "border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Save className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{dirty ? "Save*" : "Saved"}</span>
        </button>

        {/* Work History Modal Trigger */}
        <button
          type="button"
          onClick={onRequestOpenHistory}
          title="View and restore previous saved work"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Clock className="h-3.5 w-3.5 text-sky-500" />
          <span className="hidden md:inline">History</span>
          {historyCount > 0 && (
            <span className="rounded-full bg-sky-500/15 px-1.5 font-mono text-[10px] font-bold text-sky-600 dark:text-sky-400">
              {historyCount}
            </span>
          )}
        </button>

        {/* File Menu Dropdown */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setFileMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FolderOpen className="h-3.5 w-3.5 text-sky-500" />
            <span className="hidden sm:inline">Program</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>

          {fileMenuOpen && (
            <div className="absolute right-0 z-40 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setFileMenuOpen(false);
                  onRequestNewProgram();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />
                New Program
              </button>
              <button
                type="button"
                onClick={() => {
                  setFileMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                Open JSON / G-code...
              </button>
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
              <button
                type="button"
                onClick={() => handleSaveFile("json")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Save className="h-3.5 w-3.5 text-slate-400" />
                Download Project (.json)
              </button>
              <button
                type="button"
                disabled={targetsCount === 0}
                onClick={() => handleSaveFile("gcode")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                Export WLKATA G-code
              </button>
              <button
                type="button"
                disabled={targetsCount === 0}
                onClick={() => {
                  setFileMenuOpen(false);
                  onRequestDownloadRobot();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-40 dark:text-sky-400 dark:hover:bg-sky-950/50"
              >
                <Download className="h-3.5 w-3.5" />
                Send to Robot (USB / File)
              </button>
            </div>
          )}
        </div>

        {/* Instant Home Button */}
        <button
          type="button"
          onClick={() => {
            cancelPath();
            setHome();
          }}
          title="Return robot to Home position (0,0,0,0,0,0)"
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-500"
        >
          <Home className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Home</span>
        </button>

        {/* Clean Icon Theme Toggle */}
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
          role="group"
          aria-label="Theme mode"
        >
          {(
            [
              { mode: "light", icon: Sun, title: "Light theme" },
              { mode: "dark", icon: Moon, title: "Dark theme" },
              { mode: "auto", icon: Monitor, title: "Auto theme (by time of day)" },
            ] as Array<{ mode: ThemeMode; icon: typeof Sun; title: string }>
          ).map(({ mode, icon: Icon, title }) => (
            <button
              key={mode}
              type="button"
              title={title}
              onClick={() => setThemeMode(mode)}
              className={`rounded-md p-1.5 transition ${
                themeMode === mode
                  ? "bg-white text-sky-600 shadow-xs dark:bg-slate-900 dark:text-sky-400"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
