"use client";

import { useRef } from "react";
import {
  Bot,
  Download,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  SkipForward,
  SunMoon,
} from "lucide-react";
import { usePathStore } from "@/stores/usePathStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useThemeStore, type ThemeMode } from "@/stores/useThemeStore";

interface ToolbarProps {
  onRequestRenameProject: () => void;
  onRequestNewProgram: () => void;
  onRequestDownloadRobot: () => void;
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
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const projectName = useProjectStore((s) => s.name);
  const fileName = useProjectStore((s) => s.fileName);
  const fileFormat = useProjectStore((s) => s.fileFormat);
  const dirty = useProjectStore((s) => s.dirty);
  const setDirty = useProjectStore((s) => s.setDirty);
  const setFileMeta = useProjectStore((s) => s.setFileMeta);

  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const pathStatus = usePathStore((s) => s.status);
  const targetsCount = usePathStore((s) => s.targets.length);
  const activeTargetIndex = usePathStore((s) => s.activeTargetIndex);
  const repeatCount = usePathStore((s) => s.repeatCount);
  const setRepeatCount = usePathStore((s) => s.setRepeatCount);
  const togglePlayback = usePathStore((s) => s.togglePlayback);
  const stepProgram = usePathStore((s) => s.stepProgram);
  const teachTarget = usePathStore((s) => s.teachTarget);
  const updateSelectedTarget = usePathStore((s) => s.updateSelectedTarget);
  const importProgramText = usePathStore((s) => s.importProgramText);
  const exportJsonString = usePathStore((s) => s.exportJsonString);
  const exportGcodeString = usePathStore((s) => s.exportGcodeString);
  const appendLog = useSerialStore((s) => s.appendLog);

  const isPlaying = pathStatus === "PLAYING";
  const isPaused = pathStatus === "PAUSED";
  const isLocked = isPlaying || isPaused;

  const safeSlug = (projectName || fileName || "mirobot-program")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "mirobot-program";

  const handleSave = (forceFormat?: "json" | "gcode") => {
    const fmt = forceFormat ?? fileFormat;
    if (fmt === "gcode") {
      triggerTextDownload(`${safeSlug}.gcode`, exportGcodeString(), "text/plain");
      setFileMeta({ fileName: safeSlug, fileFormat: "gcode", dirty: false });
      appendLog({ dir: "ok", text: `[PATH] Exported ${safeSlug}.gcode` });
    } else {
      triggerTextDownload(`${safeSlug}.json`, exportJsonString(), "application/json");
      setFileMeta({ fileName: safeSlug, fileFormat: "json", dirty: false });
      setDirty(false);
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
    } catch (err) {
      appendLog({
        dir: "error",
        text: `ERROR: ${err instanceof Error ? err.message : "Failed to load file"}`,
      });
    }
  };

  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
      {/* Left: Brand & Project */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
            <Bot className="h-4 w-4" />
          </div>
          <h1 className="text-sm font-bold tracking-wider text-slate-900 dark:text-white">
            MIROBOT SIMULATOR
          </h1>
        </div>

        <div className="hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />

        <div className="flex items-center gap-1.5">
          <span className="hidden text-[10px] font-semibold tracking-wider text-slate-400 uppercase md:inline">
            Project
          </span>
          <button
            type="button"
            onClick={onRequestRenameProject}
            title={`Rename ${projectName}`}
            className="max-w-44 truncate rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {projectName}
            {dirty && <span className="ml-0.5 text-sky-500">*</span>}
          </button>
          <button
            type="button"
            onClick={onRequestRenameProject}
            title="Rename Project"
            aria-label="Rename Project"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Center: Program Command Bar */}
      <div className="flex flex-wrap items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.gcode,.nc,.tap,.g"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          type="button"
          onClick={onRequestNewProgram}
          title="Create a new path program"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">New</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Open a JSON path project or WLKATA G-code program"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Open</span>
        </button>

        <button
          type="button"
          onClick={() => handleSave("json")}
          title="Save path program as JSON"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Save className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Save</span>
        </button>

        <button
          type="button"
          disabled={targetsCount === 0}
          onClick={() => handleSave("gcode")}
          title="Export the path as WLKATA G-code"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FileCode2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">G-code</span>
        </button>

        <button
          type="button"
          disabled={targetsCount === 0}
          onClick={onRequestDownloadRobot}
          title="Download or stream the path to a connected robot"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Download</span>
        </button>

        <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />

        <label
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
          title="Repeat cycle count"
        >
          <span className="hidden sm:inline">Repeat</span>
          <input
            type="number"
            min={1}
            max={100}
            value={repeatCount}
            disabled={isPlaying}
            onChange={(e) => setRepeatCount(Number(e.target.value))}
            className="w-10 bg-transparent text-center font-mono text-xs font-semibold text-slate-900 outline-none dark:text-white"
          />
        </label>

        <button
          type="button"
          onClick={togglePlayback}
          title={isPlaying ? "Pause program" : "Run program"}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs transition ${
            isPlaying
              ? "bg-amber-500 hover:bg-amber-400"
              : "bg-sky-600 hover:bg-sky-500"
          }`}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>{isPlaying ? "Pause" : "Run"}</span>
        </button>

        <button
          type="button"
          disabled={targetsCount === 0}
          onClick={stepProgram}
          title="Move to the next target"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <SkipForward className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Step</span>
        </button>

        <button
          type="button"
          disabled={isLocked}
          onClick={() => teachTarget()}
          title="Add the current robot pose as a target (Ctrl+I)"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-400"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </button>

        <button
          type="button"
          disabled={isLocked || activeTargetIndex < 0}
          onClick={() => updateSelectedTarget()}
          title="Update the selected target from the current robot pose"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" />
          <span className="hidden md:inline">Update</span>
        </button>
      </div>

      {/* Right: Theme Selector */}
      <div className="flex items-center gap-1.5">
        <SunMoon className="h-3.5 w-3.5 text-slate-400" />
        <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">Theme :</span>
        <select
          aria-label="Theme Mode"
          value={themeMode}
          onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="auto">Auto</option>
        </select>
      </div>
    </header>
  );
}
