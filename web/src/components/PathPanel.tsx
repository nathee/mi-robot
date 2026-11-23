"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  Crosshair,
  GripVertical,
  Navigation,
  Pencil,
  Redo2,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import type { MotionType, TrajectoryProfileType } from "@/lib/kinematics/constants";
import {
  pathTrajectoryEquation,
  TRAJECTORY_PROFILES,
} from "@/lib/path/trajectory";
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useViewerStore } from "@/stores/useViewerStore";

interface PathPanelProps {
  onRequestRenameTarget: (index: number, currentName: string) => void;
  onRequestClearTargets: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  IDLE: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
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

  const eePose = useRobotStore((s) => s.eePose);
  const syncIk = useRobotStore((s) => s.syncIkTargetFromJoints);
  const applyIk = useRobotStore((s) => s.applyIk);

  const poseMode = useViewerStore((s) => s.poseMode);
  const setViewerField = useViewerStore((s) => s.setField);

  const targets = usePathStore((s) => s.targets);
  const activeTargetIndex = usePathStore((s) => s.activeTargetIndex);
  const status = usePathStore((s) => s.status);
  const settings = usePathStore((s) => s.settings);
  const telemetry = usePathStore((s) => s.trajectoryTelemetry);
  const undoCount = usePathStore((s) => s.undoStack.length);
  const redoCount = usePathStore((s) => s.redoStack.length);
  const hasClipboard = usePathStore((s) => Boolean(s.clipboard));

  const updateSettings = usePathStore((s) => s.updateSettings);
  const setActiveTargetIndex = usePathStore((s) => s.setActiveTargetIndex);
  const goToTarget = usePathStore((s) => s.goToTarget);
  const reorderTarget = usePathStore((s) => s.reorderTarget);
  const moveTarget = usePathStore((s) => s.moveTarget);
  const removeTarget = usePathStore((s) => s.removeTarget);
  const copySelectedTarget = usePathStore((s) => s.copySelectedTarget);
  const pasteTarget = usePathStore((s) => s.pasteTarget);
  const undo = usePathStore((s) => s.undo);
  const redo = usePathStore((s) => s.redo);
  const stopPlayback = usePathStore((s) => s.stopPlayback);
  const resetPlayback = usePathStore((s) => s.resetPlayback);

  const isLocked = status === "PLAYING" || status === "PAUSED";

  const motionHint =
    settings.motionType === "MOVEJ"
      ? "Joint-space interpolation between ≥ 2 targets."
      : settings.motionType === "MOVEL"
        ? "Linear TCP interpolation + continuous IK (≥ 2 targets)."
        : "3-point circular arc: Start → Via → End (odd count ≥ 3).";

  const targetRole = (idx: number): string | null => {
    if (settings.motionType !== "MOVEC" || targets.length < 3) return null;
    if (idx === 0) return "Start";
    if (idx % 2 === 1) return "Via";
    return "End";
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Status & Live TCP */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Path Planner</span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_BADGE[status] ?? STATUS_BADGE.IDLE}`}
          >
            {status}
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          TCP {eePose.x.toFixed(1)}, {eePose.y.toFixed(1)}, {eePose.z.toFixed(1)} mm
        </div>

        {/* Teach Mode & Playback Stop/Reset */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setViewerField("poseMode", "JOINT")}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                poseMode === "JOINT"
                  ? "bg-sky-600 text-white"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Joint
            </button>
            <button
              type="button"
              onClick={() => setViewerField("poseMode", "IK")}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                poseMode === "IK"
                  ? "bg-sky-600 text-white"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Linear
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => syncIk()}
              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="Sync IK target from current joints"
            >
              Sync
            </button>
            <button
              type="button"
              onClick={() => applyIk({ withLog: true })}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title="Solve IK"
            >
              <Crosshair className="h-3 w-3" />
              IK
            </button>
            <button
              type="button"
              disabled={status === "IDLE"}
              onClick={() => stopPlayback("Stopped playback")}
              className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-400"
            >
              <Square className="h-2.5 w-2.5" />
              Stop
            </button>
            <button
              type="button"
              disabled={!targets.length}
              onClick={resetPlayback}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Motion & Profile Settings */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
        {/* Motion Type */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Motion</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950">
            {(["MOVEJ", "MOVEL", "MOVEC"] as MotionType[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={isLocked}
                onClick={() => updateSettings({ motionType: m })}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                  settings.motionType === m
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {m === "MOVEJ" ? "MoveJ" : m === "MOVEL" ? "MoveL" : "MoveC"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-slate-400">{motionHint}</p>

        {/* Time Profile */}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Time Profile</span>
            <select
              disabled={isLocked}
              value={settings.trajectoryProfile}
              onChange={(e) =>
                updateSettings({ trajectoryProfile: e.target.value as TrajectoryProfileType })
              }
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-sky-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {TRAJECTORY_PROFILES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Segment Time</span>
            <select
              disabled={isLocked}
              value={settings.durationMode}
              onChange={(e) =>
                updateSettings({ durationMode: e.target.value as "AUTO" | "FIXED" })
              }
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-sky-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="AUTO">Auto</option>
              <option value="FIXED">Fixed</option>
            </select>
          </label>
        </div>

        <code className="block rounded bg-slate-100 px-2 py-1 font-mono text-[10px] text-sky-700 dark:bg-slate-950 dark:text-sky-400">
          {pathTrajectoryEquation(settings.trajectoryProfile, settings.trapezoidAccelPercent)}
        </code>

        {/* Numeric Kinematics Limits */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {settings.durationMode === "FIXED" ? (
            <label className="space-y-0.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Duration (s)</span>
              <input
                type="number"
                step={0.25}
                min={0.25}
                max={30}
                disabled={isLocked}
                value={settings.fixedDurationSec}
                onChange={(e) => updateSettings({ fixedDurationSec: Number(e.target.value) })}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
          ) : (
            <>
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Max dq/dt (°/s)</span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  disabled={isLocked}
                  value={settings.speedDegPerSec}
                  onChange={(e) => updateSettings({ speedDegPerSec: Number(e.target.value) })}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Max Acc (°/s²)</span>
                <input
                  type="number"
                  min={10}
                  max={2000}
                  disabled={isLocked}
                  value={settings.maxAccelerationDegPerSec2}
                  onChange={(e) =>
                    updateSettings({ maxAccelerationDegPerSec2: Number(e.target.value) })
                  }
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </>
          )}

          {settings.motionType !== "MOVEJ" && settings.durationMode === "AUTO" && (
            <>
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">TCP Speed (mm/s)</span>
                <input
                  type="number"
                  min={5}
                  max={500}
                  disabled={isLocked}
                  value={settings.linearSpeedMmPerSec}
                  onChange={(e) => updateSettings({ linearSpeedMmPerSec: Number(e.target.value) })}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">IK Branch</span>
                <select
                  disabled={isLocked}
                  value={settings.ikBranchMode}
                  onChange={(e) =>
                    updateSettings({
                      ikBranchMode: e.target.value as "CLOSEST" | "ELBOW_UP" | "ELBOW_DOWN",
                    })
                  }
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="CLOSEST">Closest</option>
                  <option value="ELBOW_UP">Elbow +</option>
                  <option value="ELBOW_DOWN">Elbow -</option>
                </select>
              </label>
            </>
          )}

          {settings.trajectoryProfile === "TRAPEZOIDAL" && (
            <label className="space-y-0.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Accel Time (%)</span>
              <input
                type="number"
                min={10}
                max={45}
                disabled={isLocked}
                value={settings.trapezoidAccelPercent}
                onChange={(e) =>
                  updateSettings({ trapezoidAccelPercent: Number(e.target.value) })
                }
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
          )}
        </div>
      </div>

      {/* Trajectory Monitor */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Trajectory Monitor
          </span>
          <select
            value={settings.monitorJoint}
            onChange={(e) => updateSettings({ monitorJoint: Number(e.target.value) })}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold dark:border-slate-700 dark:bg-slate-950"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <option key={i} value={i}>
                J{i + 1}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
          <div className="rounded bg-white p-1.5 dark:bg-slate-950/70">
            <div className="text-slate-400">q(t)</div>
            <div className="font-semibold text-slate-800 dark:text-slate-100">
              {telemetry.q.toFixed(1)}°
            </div>
          </div>
          <div className="rounded bg-white p-1.5 dark:bg-slate-950/70">
            <div className="text-slate-400">dq/dt</div>
            <div className="font-semibold text-sky-600 dark:text-sky-400">
              {telemetry.velocity.toFixed(1)} °/s
            </div>
          </div>
          <div className="rounded bg-white p-1.5 dark:bg-slate-950/70">
            <div className="text-slate-400">d²q/dt²</div>
            <div className="font-semibold text-indigo-600 dark:text-indigo-400">
              {telemetry.acceleration.toFixed(0)} °/s²
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400">
          <span className="truncate">{telemetry.segment}</span>
          <span>
            {telemetry.elapsedSec.toFixed(2)} / {telemetry.durationSec.toFixed(2)} s (
            {Math.round(telemetry.progress * 100)}%)
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-sky-500 transition-all duration-75"
            style={{ width: `${Math.min(100, Math.max(0, telemetry.progress * 100))}%` }}
          />
        </div>
      </div>

      {/* Target Tools */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Targets ({targets.length})
          </span>
          <button
            type="button"
            disabled={!targets.length || isLocked}
            onClick={onRequestClearTargets}
            className="text-[11px] font-medium text-rose-500 hover:text-rose-400 disabled:opacity-40"
          >
            Clear All
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={activeTargetIndex < 0 || isLocked}
            onClick={() => removeTarget()}
            title="Delete selected target (Delete)"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={activeTargetIndex < 0 || isLocked}
            onClick={() => {
              const t = targets[activeTargetIndex];
              if (t) onRequestRenameTarget(activeTargetIndex, t.name);
            }}
            title="Rename selected target"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={activeTargetIndex <= 0 || isLocked}
            onClick={() => moveTarget(activeTargetIndex, -1)}
            title="Move selected target up"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={activeTargetIndex < 0 || activeTargetIndex >= targets.length - 1 || isLocked}
            onClick={() => moveTarget(activeTargetIndex, 1)}
            title="Move selected target down"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={undoCount === 0 || isLocked}
            onClick={() => undo()}
            title="Undo (Ctrl+Z)"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={redoCount === 0 || isLocked}
            onClick={() => redo()}
            title="Redo (Ctrl+Y)"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={activeTargetIndex < 0}
            onClick={() => copySelectedTarget()}
            title="Copy selected target (Ctrl+C)"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!hasClipboard || isLocked}
            onClick={() => pasteTarget()}
            title="Paste target (Ctrl+V)"
            className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Target List with Drag & Drop */}
        {targets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
            No targets taught yet. Move the arm and click <strong>Add</strong> (or press{" "}
            <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Ctrl+I
            </kbd>
            ).
          </div>
        ) : (
          <div className="space-y-1">
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
                  className={`group flex cursor-pointer items-center gap-1.5 rounded-lg border p-2 transition ${
                    isSelected
                      ? "border-sky-500 bg-sky-500/10"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
                  } ${hoverIndex === idx && dragIndex !== idx ? "ring-2 ring-sky-400" : ""}`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-400">#{idx + 1}</span>
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                        {target.name}
                      </span>
                      {role && (
                        <span className="rounded bg-purple-500/15 px-1 py-0.2 font-mono text-[9px] font-bold text-purple-600 dark:text-purple-400">
                          {role}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      X {target.x.toFixed(1)} / Y {target.y.toFixed(1)} / Z {target.z.toFixed(1)} mm
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToTarget(idx);
                    }}
                    title={`Move robot to ${target.name}`}
                    className="rounded p-1 text-slate-400 opacity-75 hover:bg-sky-500/15 hover:text-sky-500 group-hover:opacity-100"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
