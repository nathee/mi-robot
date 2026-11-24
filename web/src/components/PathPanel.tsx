"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Code2,
  Copy,
  GripVertical,
  Navigation,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import type { MotionType, TrajectoryProfileType } from "@/lib/kinematics/constants";
import {
  pathTrajectoryEquation,
  TRAJECTORY_PROFILES,
} from "@/lib/path/trajectory";
import { useCodeStore } from "@/stores/useCodeStore";
import { usePathStore } from "@/stores/usePathStore";
import { useViewerStore } from "@/stores/useViewerStore";
import { NumericInput } from "./ui";

interface PathPanelProps {
  onRequestRenameTarget: (index: number, currentName: string) => void;
  onRequestClearTargets: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  IDLE: "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  PLAYING: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-sky-500/20 text-sky-600 dark:text-sky-400",
  ERROR: "bg-rose-500/20 text-rose-600 dark:text-rose-400",
};

export function PathPanel({
  onRequestRenameTarget,
  onRequestClearTargets,
}: PathPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const targets = usePathStore((s) => s.targets);
  const activeTargetIndex = usePathStore((s) => s.activeTargetIndex);
  const status = usePathStore((s) => s.status);
  const settings = usePathStore((s) => s.settings);
  const repeatCount = usePathStore((s) => s.repeatCount);
  const telemetry = usePathStore((s) => s.trajectoryTelemetry);
  const undoCount = usePathStore((s) => s.undoStack.length);
  const redoCount = usePathStore((s) => s.redoStack.length);
  const hasClipboard = usePathStore((s) => Boolean(s.clipboard));

  const updateSettings = usePathStore((s) => s.updateSettings);
  const setRepeatCount = usePathStore((s) => s.setRepeatCount);
  const setActiveTargetIndex = usePathStore((s) => s.setActiveTargetIndex);
  const teachTarget = usePathStore((s) => s.teachTarget);
  const updateSelectedTarget = usePathStore((s) => s.updateSelectedTarget);
  const goToTarget = usePathStore((s) => s.goToTarget);
  const reorderTarget = usePathStore((s) => s.reorderTarget);
  const removeTarget = usePathStore((s) => s.removeTarget);
  const copySelectedTarget = usePathStore((s) => s.copySelectedTarget);
  const pasteTarget = usePathStore((s) => s.pasteTarget);
  const undo = usePathStore((s) => s.undo);
  const redo = usePathStore((s) => s.redo);
  const togglePlayback = usePathStore((s) => s.togglePlayback);
  const stopPlayback = usePathStore((s) => s.stopPlayback);
  const resetPlayback = usePathStore((s) => s.resetPlayback);
  const stepProgram = usePathStore((s) => s.stepProgram);
  const loadDemoPath = usePathStore((s) => s.loadDemoPath);
  const generateFromPath = useCodeStore((s) => s.generateFromPath);
  const setViewerField = useViewerStore((s) => s.setField);

  const isPlaying = status === "PLAYING";
  const isLocked = status === "PLAYING" || status === "PAUSED";

  const targetRole = (idx: number): string | null => {
    if (settings.motionType !== "MOVEC" || targets.length < 3) return null;
    if (idx === 0) return "Start";
    if (idx % 2 === 1) return "Via";
    return "End";
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Playback Card */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800/90 dark:bg-slate-900/60">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Playback</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_BADGE[status] ?? STATUS_BADGE.IDLE}`}
            >
              {status}
            </span>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Repeat</span>
            <NumericInput
              aria-label="Repeat count"
              min={1}
              max={100}
              step={1}
              precision={0}
              disabled={isPlaying}
              value={repeatCount}
              onChange={(v) => setRepeatCount(Math.max(1, Math.round(v)))}
              className="w-11 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-center font-mono text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={targets.length < 2}
            onClick={togglePlayback}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-40 ${
              isPlaying ? "bg-amber-500 hover:bg-amber-400" : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? "Pause" : "Play Path"}</span>
          </button>

          <button
            type="button"
            disabled={targets.length === 0}
            onClick={stepProgram}
            title="Step to next waypoint"
            aria-label="Step to next waypoint"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={status === "IDLE"}
            onClick={() => stopPlayback("Stopped playback")}
            title="Stop"
            aria-label="Stop playback"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-35 dark:text-rose-400"
          >
            <Square className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={targets.length === 0}
            onClick={resetPlayback}
            title="Reset to first waypoint"
            aria-label="Reset to first waypoint"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Progress Bar */}
        {targets.length >= 2 && (
          <div className="mt-2.5">
            <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="truncate">{telemetry.segment}</span>
              <span>{Math.round(telemetry.progress * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, telemetry.progress * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Motion Mode Switcher */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-3 rounded-xl border border-slate-200/90 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          {(["MOVEJ", "MOVEL", "MOVEC"] as MotionType[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={isLocked}
              onClick={() => updateSettings({ motionType: m })}
              className={`rounded-lg py-1 text-xs font-semibold transition disabled:opacity-50 ${
                settings.motionType === m
                  ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {m === "MOVEJ" ? "MoveJ" : m === "MOVEL" ? "MoveL" : "MoveC"}
            </button>
          ))}
        </div>
        {settings.motionType === "MOVEC" && targets.length < 3 && (
          <p className="rounded-lg bg-purple-500/10 px-2.5 py-1.5 text-[11px] text-purple-700 dark:text-purple-300">
            Circular arc (MoveC) requires at least 3 waypoints: Start → Via → End.
          </p>
        )}
      </div>

      {/* Teach Actions */}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={isLocked}
          onClick={() => teachTarget()}
          title="Save current robot pose as a waypoint (Ctrl+I)"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          <span>Add Current Pose</span>
        </button>

        <button
          type="button"
          disabled={isLocked || activeTargetIndex < 0}
          onClick={() => updateSelectedTarget()}
          title="Overwrite selected waypoint with current robot pose"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Update</span>
        </button>
      </div>

      {/* Generate Code */}
      <button
        type="button"
        disabled={isLocked || targets.length === 0}
        onClick={() => {
          generateFromPath();
          setViewerField("sidebarPanel", "CODE");
        }}
        title="Replace the Code program with Blocks, Script and G-code generated from these waypoints"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-400"
      >
        <Code2 className="h-3.5 w-3.5" />
        <span>Generate Code from Path</span>
      </button>

      {/* Waypoints Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            Waypoints ({targets.length})
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={undoCount === 0 || isLocked}
              onClick={() => undo()}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={redoCount === 0 || isLocked}
              onClick={() => redo()}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={activeTargetIndex < 0}
              onClick={() => copySelectedTarget()}
              title="Copy selected (Ctrl+C)"
              aria-label="Copy selected waypoint"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!hasClipboard || isLocked}
              onClick={() => pasteTarget()}
              title="Paste waypoint (Ctrl+V)"
              aria-label="Paste waypoint"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
            </button>
            {targets.length > 0 && (
              <button
                type="button"
                disabled={isLocked}
                onClick={onRequestClearTargets}
                className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-rose-500 transition hover:bg-rose-50 disabled:opacity-35 dark:hover:bg-rose-950/40"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center dark:border-slate-700/80 dark:bg-slate-900/40">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pose the robot and click <strong>Add Current Pose</strong>, or try a demo:
            </p>
            <button
              type="button"
              onClick={loadDemoPath}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Load Demo Path
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {targets.map((target, idx) => {
              const isSelected = idx === activeTargetIndex;
              const role = targetRole(idx);
              return (
                <div
                  key={target.id}
                  draggable={!isLocked}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverIndex(idx);
                  }}
                  onDragLeave={() => setHoverIndex((prev) => (prev === idx ? null : prev))}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== idx) {
                      reorderTarget(dragIndex, idx);
                    }
                    setDragIndex(null);
                    setHoverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setHoverIndex(null);
                  }}
                  onClick={() => setActiveTargetIndex(idx)}
                  onDoubleClick={() => goToTarget(idx)}
                  className={`group flex cursor-pointer items-center gap-1.5 rounded-xl border px-2 py-2 transition ${
                    isSelected
                      ? "border-sky-500/80 bg-sky-500/10"
                      : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/60 dark:hover:border-slate-700"
                  } ${hoverIndex === idx && dragIndex !== idx ? "ring-2 ring-sky-400" : ""}`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] tabular-nums text-slate-400">
                        #{idx + 1}
                      </span>
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                        {target.name}
                      </span>
                      {role && (
                        <span className="rounded bg-purple-500/15 px-1 font-mono text-[9px] font-bold text-purple-600 dark:text-purple-400">
                          {role}
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                      X {target.x.toFixed(0)} · Y {target.y.toFixed(0)} · Z {target.z.toFixed(0)} mm
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToTarget(idx);
                      }}
                      title={`Move arm to ${target.name}`}
                      aria-label={`Move arm to ${target.name}`}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-sky-500/15 hover:text-sky-500"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestRenameTarget(idx, target.name);
                      }}
                      title="Rename waypoint"
                      aria-label={`Rename ${target.name}`}
                      className={`rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
                        isSelected
                          ? "opacity-100"
                          : "opacity-70 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTarget(idx);
                      }}
                      title="Delete waypoint"
                      aria-label={`Delete ${target.name}`}
                      className={`rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-20 dark:hover:bg-rose-950/50 ${
                        isSelected
                          ? "opacity-100"
                          : "opacity-70 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible Advanced Trajectory & Telemetry */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/90 dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            Speed & Telemetry
          </span>
          {showAdvanced ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-2.5 border-t border-slate-100 p-3 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500">Time Profile</span>
                <select
                  disabled={isLocked}
                  value={settings.trajectoryProfile}
                  onChange={(e) =>
                    updateSettings({ trajectoryProfile: e.target.value as TrajectoryProfileType })
                  }
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium outline-none dark:border-slate-700 dark:bg-slate-950"
                >
                  {TRAJECTORY_PROFILES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500">Segment Time</span>
                <select
                  disabled={isLocked}
                  value={settings.durationMode}
                  onChange={(e) =>
                    updateSettings({ durationMode: e.target.value as "AUTO" | "FIXED" })
                  }
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium outline-none dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="AUTO">Auto</option>
                  <option value="FIXED">Fixed</option>
                </select>
              </label>
            </div>

            <code className="block rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-sky-700 dark:bg-slate-950 dark:text-sky-400">
              {pathTrajectoryEquation(settings.trajectoryProfile, settings.trapezoidAccelPercent)}
            </code>

            <div className="grid grid-cols-2 gap-2">
              {settings.durationMode === "FIXED" ? (
                <label className="space-y-0.5">
                  <span className="text-[10px] text-slate-500">Duration (s)</span>
                  <NumericInput
                    min={0.25}
                    max={30}
                    step={0.25}
                    precision={2}
                    disabled={isLocked}
                    value={settings.fixedDurationSec}
                    onChange={(v) => updateSettings({ fixedDurationSec: v })}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              ) : (
                <>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500">Joint Speed (°/s)</span>
                    <NumericInput
                      min={5}
                      max={180}
                      step={5}
                      precision={0}
                      disabled={isLocked}
                      value={settings.speedDegPerSec}
                      onChange={(v) => updateSettings({ speedDegPerSec: v })}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500">Joint Acc (°/s²)</span>
                    <NumericInput
                      min={10}
                      max={2000}
                      step={10}
                      precision={0}
                      disabled={isLocked}
                      value={settings.maxAccelerationDegPerSec2}
                      onChange={(v) => updateSettings({ maxAccelerationDegPerSec2: v })}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                </>
              )}

              {settings.motionType !== "MOVEJ" && settings.durationMode === "AUTO" && (
                <>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500">TCP Speed (mm/s)</span>
                    <NumericInput
                      min={5}
                      max={500}
                      step={5}
                      precision={0}
                      disabled={isLocked}
                      value={settings.linearSpeedMmPerSec}
                      onChange={(v) => updateSettings({ linearSpeedMmPerSec: v })}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500">IK Branch</span>
                    <select
                      disabled={isLocked}
                      value={settings.ikBranchMode}
                      onChange={(e) =>
                        updateSettings({
                          ikBranchMode: e.target.value as "CLOSEST" | "ELBOW_UP" | "ELBOW_DOWN",
                        })
                      }
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="CLOSEST">Closest</option>
                      <option value="ELBOW_UP">Elbow +</option>
                      <option value="ELBOW_DOWN">Elbow -</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {/* Live Telemetry Readout */}
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/70">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500">Live Telemetry</span>
                <select
                  aria-label="Monitored joint"
                  value={settings.monitorJoint}
                  onChange={(e) => updateSettings({ monitorJoint: Number(e.target.value) })}
                  className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-900"
                >
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <option key={i} value={i}>
                      J{i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-1 font-mono text-[10px] tabular-nums">
                <div>
                  <span className="text-slate-400">q:</span>{" "}
                  <strong>{telemetry.q.toFixed(1)}°</strong>
                </div>
                <div>
                  <span className="text-slate-400">v:</span>{" "}
                  <strong className="text-sky-500">{telemetry.velocity.toFixed(1)}°/s</strong>
                </div>
                <div>
                  <span className="text-slate-400">a:</span>{" "}
                  <strong className="text-indigo-500">
                    {telemetry.acceleration.toFixed(0)}°/s²
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
