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
import {
  getActiveRobotProfile,
  type MotionType,
  type TrajectoryProfileType,
} from "@/lib/kinematics/constants";
import {
  pathTrajectoryEquation,
  TRAJECTORY_PROFILES,
} from "@/lib/path/trajectory";
import { useCodeStore } from "@/stores/useCodeStore";
import { usePathStore } from "@/stores/usePathStore";
import { useViewerStore } from "@/stores/useViewerStore";
import { NumericInput } from "./ui";
import { useT } from "@/lib/i18n/useT";

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
  const t = useT();
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
    if (idx === 0) return t("path.roleStart");
    if (idx % 2 === 1) return t("path.roleVia");
    return t("path.roleEnd");
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Playback Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800/90 dark:bg-slate-900/75">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t("path.playback")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_BADGE[status] ?? STATUS_BADGE.IDLE}`}
            >
              {status}
            </span>
          </div>

          <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span>{t("path.repeat")}</span>
            <NumericInput
              aria-label={t("path.repeatCount")}
              min={1}
              max={100}
              step={1}
              precision={0}
              disabled={isPlaying}
              value={repeatCount}
              onChange={(v) => setRepeatCount(Math.max(1, Math.round(v)))}
              className="h-7 w-12 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-center font-mono text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={targets.length < 2}
            onClick={togglePlayback}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white shadow-xs transition disabled:opacity-40 ${
              isPlaying ? "bg-amber-500 hover:bg-amber-400" : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{isPlaying ? t("path.pause") : t("path.play")}</span>
          </button>

          <button
            type="button"
            disabled={targets.length === 0}
            onClick={stepProgram}
            title={t("path.step")}
            aria-label={t("path.step")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <SkipForward className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={status === "IDLE"}
            onClick={() => stopPlayback(t("log.stoppedPlayback"))}
            title={t("path.stop")}
            aria-label={t("path.stopPlayback")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-35 dark:text-rose-400"
          >
            <Square className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={targets.length === 0}
            onClick={resetPlayback}
            title={t("path.reset")}
            aria-label={t("path.reset")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Progress Bar */}
        {targets.length >= 2 && (
          <div className="mt-3">
            <div className="flex justify-between font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="truncate">{telemetry.segment}</span>
              <span>{Math.round(telemetry.progress * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, telemetry.progress * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Motion Mode & Teach Controls */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 rounded-xl border border-slate-200/80 bg-slate-200/60 p-1 dark:border-slate-800 dark:bg-slate-900">
          {(["MOVEJ", "MOVEL", "MOVEC"] as MotionType[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={isLocked}
              onClick={() => updateSettings({ motionType: m })}
              className={`rounded-lg py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                settings.motionType === m
                  ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {m === "MOVEJ" ? "MoveJ" : m === "MOVEL" ? "MoveL" : "MoveC"}
            </button>
          ))}
        </div>

        {settings.motionType === "MOVEC" && targets.length < 3 && (
          <p className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-[11px] text-purple-700 dark:text-purple-300">
            {t("path.movecHint")}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={isLocked}
            onClick={() => teachTarget()}
            title={t("path.addTitle")}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            <span>{t("path.add")}</span>
          </button>

          <button
            type="button"
            disabled={isLocked || activeTargetIndex < 0}
            onClick={() => updateSelectedTarget()}
            title={t("path.updateTitle")}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t("path.update")}</span>
          </button>
        </div>
      </div>

      {/* Waypoints Section */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("path.waypoints", { n: targets.length })}
          </span>
          <div className="flex items-center gap-1">
            <div className="inline-flex items-center rounded-lg border border-slate-200/80 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                disabled={undoCount === 0 || isLocked}
                onClick={() => undo()}
                title={`${t("common.undo")} (Ctrl+Z)`}
                aria-label={t("common.undo")}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={redoCount === 0 || isLocked}
                onClick={() => redo()}
                title={`${t("common.redo")} (Ctrl+Y)`}
                aria-label={t("common.redo")}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <span className="mx-0.5 h-3.5 w-px bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                disabled={activeTargetIndex < 0}
                onClick={() => copySelectedTarget()}
                title={t("path.copyTitle")}
                aria-label={t("path.copyAria")}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!hasClipboard || isLocked}
                onClick={() => pasteTarget()}
                title={t("path.pasteTitle")}
                aria-label={t("path.pasteAria")}
                className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </button>
            </div>
            {targets.length > 0 && (
              <button
                type="button"
                disabled={isLocked}
                onClick={onRequestClearTargets}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-35 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                {t("common.clear")}
              </button>
            )}
          </div>
        </div>

        {targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-center dark:border-slate-700/80 dark:bg-slate-900/40">
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t("path.emptyBefore")}<strong>{t("path.add")}</strong>{t("path.emptyAfter")}
            </p>
            <button
              type="button"
              onClick={loadDemoPath}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("path.loadDemo")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
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
                  className={`group flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 shadow-2xs transition ${
                    isSelected
                      ? "border-sky-500/80 bg-sky-50/80 ring-1 ring-sky-500/20 dark:bg-sky-950/35"
                      : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/75 dark:hover:border-slate-700"
                  } ${hoverIndex === idx && dragIndex !== idx ? "ring-2 ring-sky-400" : ""}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-400" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        #{idx + 1}
                      </span>
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {target.name}
                      </span>
                      {role && (
                        <span className="rounded bg-purple-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-purple-600 dark:text-purple-400">
                          {role}
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      X {target.x.toFixed(0)} · Y {target.y.toFixed(0)} · Z {target.z.toFixed(0)} mm
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToTarget(idx);
                      }}
                      title={t("path.moveTo", { name: target.name })}
                      aria-label={t("path.moveTo", { name: target.name })}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-sky-500/15 hover:text-sky-600 dark:hover:text-sky-400"
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
                      title={t("path.rename")}
                      aria-label={t("path.renameAria", { name: target.name })}
                      className={`rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
                        isSelected
                          ? "opacity-100"
                          : "opacity-75 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTarget(idx);
                      }}
                      title={t("path.delete")}
                      aria-label={t("path.deleteAria", { name: target.name })}
                      className={`rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-20 dark:hover:bg-rose-950/50 ${
                        isSelected
                          ? "opacity-100"
                          : "opacity-75 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Generate Code from Path — placed cleanly below waypoints */}
      {targets.length > 0 && (
        <button
          type="button"
          disabled={isLocked}
          onClick={() => {
            generateFromPath();
            setViewerField("sidebarPanel", "CODE");
          }}
          title={t("path.generateTitle")}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-400"
        >
          <Code2 className="h-4 w-4" />
          <span>{t("path.generate")}</span>
        </button>
      )}

      {/* Collapsible Advanced Trajectory & Telemetry */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800/90 dark:bg-slate-900/75">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            {t("path.speedTelemetry")}
          </span>
          {showAdvanced ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-3 border-t border-slate-100 p-3.5 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t("path.timeProfile")}
                </span>
                <select
                  disabled={isLocked}
                  value={settings.trajectoryProfile}
                  onChange={(e) =>
                    updateSettings({ trajectoryProfile: e.target.value as TrajectoryProfileType })
                  }
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium outline-none dark:border-slate-700 dark:bg-slate-950"
                >
                  {TRAJECTORY_PROFILES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(`traj.${p.value}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t("path.segmentTime")}
                </span>
                <select
                  disabled={isLocked}
                  value={settings.durationMode}
                  onChange={(e) =>
                    updateSettings({ durationMode: e.target.value as "AUTO" | "FIXED" })
                  }
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium outline-none dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="AUTO">{t("path.auto")}</option>
                  <option value="FIXED">{t("path.fixed")}</option>
                </select>
              </label>
            </div>

            <code className="block rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[11px] text-sky-700 dark:bg-slate-950 dark:text-sky-400">
              {pathTrajectoryEquation(settings.trajectoryProfile, settings.trapezoidAccelPercent)}
            </code>

            <div className="grid grid-cols-2 gap-2.5">
              {settings.durationMode === "FIXED" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t("path.duration")}
                  </span>
                  <NumericInput
                    min={0.25}
                    max={30}
                    step={0.25}
                    precision={2}
                    disabled={isLocked}
                    value={settings.fixedDurationSec}
                    onChange={(v) => updateSettings({ fixedDurationSec: v })}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t("path.jointSpeed")}
                    </span>
                    <NumericInput
                      min={5}
                      max={180}
                      step={5}
                      precision={0}
                      disabled={isLocked}
                      value={settings.speedDegPerSec}
                      onChange={(v) => updateSettings({ speedDegPerSec: v })}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t("path.jointAcc")}
                    </span>
                    <NumericInput
                      min={10}
                      max={2000}
                      step={10}
                      precision={0}
                      disabled={isLocked}
                      value={settings.maxAccelerationDegPerSec2}
                      onChange={(v) => updateSettings({ maxAccelerationDegPerSec2: v })}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                </>
              )}

              {settings.motionType !== "MOVEJ" && settings.durationMode === "AUTO" && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t("path.tcpSpeed")}
                    </span>
                    <NumericInput
                      min={5}
                      max={500}
                      step={5}
                      precision={0}
                      disabled={isLocked}
                      value={settings.linearSpeedMmPerSec}
                      onChange={(v) => updateSettings({ linearSpeedMmPerSec: v })}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t("path.ikBranch")}
                    </span>
                    <select
                      disabled={isLocked}
                      value={settings.ikBranchMode}
                      onChange={(e) =>
                        updateSettings({
                          ikBranchMode: e.target.value as "CLOSEST" | "ELBOW_UP" | "ELBOW_DOWN",
                        })
                      }
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="CLOSEST">{t("path.closest")}</option>
                      <option value="ELBOW_UP">{t("path.elbowUp")}</option>
                      <option value="ELBOW_DOWN">{t("path.elbowDown")}</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {/* Live Telemetry Readout */}
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {t("path.liveTelemetry")}
                </span>
                <select
                  aria-label={t("path.monitoredJoint")}
                  value={settings.monitorJoint}
                  onChange={(e) => updateSettings({ monitorJoint: Number(e.target.value) })}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
                >
                  {Array.from({ length: getActiveRobotProfile().activeJointCount }, (_, i) => i).map((i) => (
                    <option key={i} value={i}>
                      J{i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                <div className="rounded-lg bg-white px-2 py-1.5 text-center dark:bg-slate-900">
                  <div className="text-[10px] text-slate-400">{t("path.posQ")}</div>
                  <strong className="text-slate-800 dark:text-slate-100">
                    {telemetry.q.toFixed(1)}°
                  </strong>
                </div>
                <div className="rounded-lg bg-white px-2 py-1.5 text-center dark:bg-slate-900">
                  <div className="text-[10px] text-slate-400">{t("path.velV")}</div>
                  <strong className="text-sky-600 dark:text-sky-400">
                    {telemetry.velocity.toFixed(1)}°/s
                  </strong>
                </div>
                <div className="rounded-lg bg-white px-2 py-1.5 text-center dark:bg-slate-900">
                  <div className="text-[10px] text-slate-400">{t("path.accA")}</div>
                  <strong className="text-indigo-600 dark:text-indigo-400">
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
