"use client";

import { useRef } from "react";
import { AlertTriangle, Crosshair, Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import { JOINT_LABELS, JOINT_LIMITS, getActiveRobotProfile, type Pose6D } from "@/lib/kinematics/constants";

/** "J2 (Shoulder)" -> "Shoulder" */
function jointShortName(i: number): string {
  return /\((.*)\)/.exec(JOINT_LABELS[i] ?? "")?.[1] ?? `Joint ${i + 1}`;
}
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useViewerStore } from "@/stores/useViewerStore";
import { NumericInput } from "./ui";


const POSITION_AXES: Array<{ key: keyof Pose6D; label: string; unit: string; step: number; badge: string }> = [
  { key: "x", label: "X", unit: "mm", step: 5, badge: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  { key: "y", label: "Y", unit: "mm", step: 5, badge: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  { key: "z", label: "Z", unit: "mm", step: 5, badge: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
];

const ORIENTATION_AXES: Array<{ key: keyof Pose6D; label: string; unit: string; step: number; badge: string }> = [
  { key: "rx", label: "Rx", unit: "°", step: 5, badge: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" },
  { key: "ry", label: "Ry", unit: "°", step: 5, badge: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" },
  { key: "rz", label: "Rz", unit: "°", step: 5, badge: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" },
];

export function JogPanel() {
  const { activeJointCount, jogPresets } = getActiveRobotProfile();
  const joints = useRobotStore((s) => s.joints);
  const ikTarget = useRobotStore((s) => s.ikTarget);
  const lastIkErr = useRobotStore((s) => s.lastIkErr);
  const workspaceStatus = useRobotStore((s) => s.workspaceStatus);
  const setJoint = useRobotStore((s) => s.setJoint);
  const setJoints = useRobotStore((s) => s.setJoints);
  const stepJoint = useRobotStore((s) => s.stepJoint);
  const setIkTarget = useRobotStore((s) => s.setIkTarget);
  const applyIk = useRobotStore((s) => s.applyIk);

  const poseMode = useViewerStore((s) => s.poseMode);
  const setControlMode = useViewerStore((s) => s.setControlMode);
  const ikAutoApply = useViewerStore((s) => s.ikAutoApply);
  const workspace = useViewerStore((s) => s.workspace);

  const cancelPath = usePathStore((s) => s.cancelForManualControl);
  const appendLog = useSerialStore((s) => s.appendLog);

  // Track starting joint value when dragging a slider so release logs accurately
  const sliderStartRef = useRef<Record<number, number>>({});

  const axisRange = (key: keyof Pose6D): { min: number; max: number } => {
    if (key === "x") return { min: workspace.xMin, max: workspace.xMax };
    if (key === "y") return { min: workspace.yMin, max: workspace.yMax };
    if (key === "z") return { min: workspace.zMin, max: workspace.zMax };
    return { min: -180, max: 180 };
  };

  const handleLinearChange = (key: keyof Pose6D, val: number, commit = false) => {
    cancelPath();
    if (!Number.isFinite(val)) return;
    const ok = setIkTarget({ [key]: val });
    if (ok && (ikAutoApply || commit)) {
      applyIk({ withLog: commit, rollbackOnFail: commit });
    }
  };

  const applyPreset = (label: string, presetJoints: number[]) => {
    cancelPath();
    setJoints(presetJoints, { syncIk: true });
    appendLog({ dir: "sys", text: `Moved to preset pose: ${label}` });
  };

  const renderLinearCard = (axis: (typeof POSITION_AXES)[number]) => {
    const range = axisRange(axis.key);
    const val = ikTarget[axis.key];
    return (
      <div
        key={axis.key}
        className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-2xs dark:border-slate-800/90 dark:bg-slate-900/75"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-bold ${axis.badge}`}>
              {axis.label}
            </span>
            <span className="font-mono text-[11px] text-slate-400">{axis.unit}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleLinearChange(axis.key, val - axis.step, true)}
              title={`${axis.label} -${axis.step}${axis.unit}`}
              aria-label={`Decrease ${axis.label}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <NumericInput
              aria-label={`${axis.label} (${axis.unit})`}
              value={val}
              step={1}
              min={range.min}
              max={range.max}
              precision={1}
              onChange={(v) => handleLinearChange(axis.key, v, false)}
              onCommit={(v) => handleLinearChange(axis.key, v, true)}
              className="h-7 w-18 rounded-lg border border-slate-200 bg-slate-50 text-center font-mono text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700/80 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="button"
              onClick={() => handleLinearChange(axis.key, val + axis.step, true)}
              title={`${axis.label} +${axis.step}${axis.unit}`}
              aria-label={`Increase ${axis.label}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <input
          type="range"
          aria-label={`${axis.label} slider`}
          min={range.min}
          max={range.max}
          step={1}
          value={val}
          onChange={(e) => handleLinearChange(axis.key, Number(e.target.value), false)}
          onPointerUp={() => applyIk({ withLog: true, rollbackOnFail: true })}
          className="sim-slider w-full"
        />
        <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-400">
          <span>
            {range.min}
            {axis.unit}
          </span>
          <span>
            {range.max}
            {axis.unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher: Joint vs Cartesian (IK) */}
      <div className="grid grid-cols-2 rounded-xl border border-slate-200/80 bg-slate-200/60 p-1 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setControlMode("JOINT")}
          className={`rounded-lg py-2 text-xs font-semibold transition ${
            poseMode === "JOINT"
              ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Joints (J1–J{activeJointCount})
        </button>
        <button
          type="button"
          onClick={() => setControlMode("IK_MOVE")}
          className={`rounded-lg py-2 text-xs font-semibold transition ${
            poseMode === "IK"
              ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Position (XYZ)
        </button>
      </div>

      {/* Quick Preset Poses */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-sky-500" />
          <span>Quick Poses</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {jogPresets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.label, preset.joints.slice())}
              className="rounded-xl border border-slate-200/80 bg-white py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {/* Out of Workspace Alert */}
      {workspaceStatus.out && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{workspaceStatus.message}</span>
        </div>
      )}

      {/* Joint Sliders */}
      {poseMode === "JOINT" ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Joint Angles (°)</span>
            <span className="font-normal normal-case tracking-normal text-slate-400">
              Click J1–J{activeJointCount} to zero
            </span>
          </div>
          <div className="space-y-2">
            {JOINT_LIMITS.slice(0, activeJointCount).map((limit, i) => {
              const val = joints[i] ?? 0;
              const isZero = Math.abs(val) < 0.05;
              return (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-2xs dark:border-slate-800/90 dark:bg-slate-900/75"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={isZero}
                        onClick={() => {
                          cancelPath();
                          setJoint(i, 0, { log: true });
                        }}
                        title={isZero ? `J${i + 1} at 0°` : `Click to reset J${i + 1} to 0°`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/12 px-2 py-0.5 font-mono text-xs font-bold text-sky-600 transition hover:bg-sky-500/20 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-500 dark:text-sky-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                      >
                        J{i + 1}
                        {!isZero && <RotateCcw className="h-2.5 w-2.5 opacity-70" />}
                      </button>
                      <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                        {jointShortName(i)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          cancelPath();
                          stepJoint(i, -5);
                        }}
                        title={`J${i + 1} -5°`}
                        aria-label={`Decrease J${i + 1} by 5 degrees`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <NumericInput
                        aria-label={`J${i + 1} angle in degrees`}
                        value={val}
                        min={limit.min}
                        max={limit.max}
                        step={1}
                        precision={1}
                        onChange={(v) => {
                          cancelPath();
                          setJoint(i, v, { log: false });
                        }}
                        onCommit={(v) => setJoint(i, v, { log: true })}
                        className="h-7 w-16 rounded-lg border border-slate-200 bg-slate-50 text-center font-mono text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700/80 dark:bg-slate-950 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          cancelPath();
                          stepJoint(i, 5);
                        }}
                        title={`J${i + 1} +5°`}
                        aria-label={`Increase J${i + 1} by 5 degrees`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label={`J${i + 1} slider`}
                    min={limit.min}
                    max={limit.max}
                    step={0.5}
                    value={val}
                    onPointerDown={() => {
                      sliderStartRef.current[i] = val;
                    }}
                    onChange={(e) => {
                      cancelPath();
                      setJoint(i, Number(e.target.value), { log: false });
                    }}
                    onPointerUp={() => {
                      const start = sliderStartRef.current[i];
                      const end = useRobotStore.getState().joints[i];
                      if (typeof start === "number" && Math.abs(end - start) > 0.05) {
                        appendLog({
                          dir: "sys",
                          text: `Jog J${i + 1}: ${start.toFixed(1)}° -> ${end.toFixed(1)}°`,
                        });
                      }
                      delete sliderStartRef.current[i];
                    }}
                    className="sim-slider w-full"
                  />
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-400">
                    <span>{limit.min}°</span>
                    <span>{limit.max}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Position (mm)</span>
              <span className="font-normal normal-case tracking-normal text-slate-400">
                Or drag 3D arrows
              </span>
            </div>
            <div className="space-y-2">{POSITION_AXES.map(renderLinearCard)}</div>
          </section>

          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Orientation (°)
            </div>
            <div className="space-y-2">{ORIENTATION_AXES.map(renderLinearCard)}</div>
          </section>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900/75">
            <button
              type="button"
              onClick={() => applyIk({ withLog: true, rollbackOnFail: true })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                ikAutoApply
                  ? "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  : "bg-sky-600 text-white shadow-xs hover:bg-sky-500"
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" />
              Solve IK
            </button>
            <div className="text-right font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <div>
                Pos err{" "}
                <strong className="text-slate-800 dark:text-slate-100">
                  {lastIkErr.posMm.toFixed(2)} mm
                </strong>
              </div>
              <div>
                Rot err{" "}
                <strong className="text-slate-800 dark:text-slate-100">
                  {lastIkErr.rotDeg.toFixed(1)}°
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
