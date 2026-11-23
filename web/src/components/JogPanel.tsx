"use client";

import { AlertTriangle, Crosshair, Minus, Plus, Sparkles } from "lucide-react";
import { JOINT_LIMITS, type Pose6D } from "@/lib/kinematics/constants";
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useViewerStore } from "@/stores/useViewerStore";

const JOINT_SHORT_NAMES = ["Base", "Shoulder", "Elbow", "Wrist P", "Wrist R", "Tool"] as const;

const PRESET_POSES: Array<{ label: string; joints: number[] }> = [
  { label: "Home", joints: [0, 0, 0, 0, 0, 0] },
  { label: "Ready", joints: [0, 15, -20, 0, -25, 0] },
  { label: "Reach", joints: [30, 32, -25, 0, -10, 0] },
  { label: "Pick", joints: [-35, 28, -32, 0, -18, 0] },
];

const LINEAR_AXES: Array<{ key: keyof Pose6D; label: string; unit: string; step: number; color: string }> = [
  { key: "x", label: "X", unit: "mm", step: 2, color: "text-rose-500" },
  { key: "y", label: "Y", unit: "mm", step: 2, color: "text-emerald-500" },
  { key: "z", label: "Z", unit: "mm", step: 2, color: "text-sky-500" },
  { key: "rx", label: "Rx", unit: "°", step: 2, color: "text-indigo-500" },
  { key: "ry", label: "Ry", unit: "°", step: 2, color: "text-indigo-500" },
  { key: "rz", label: "Rz", unit: "°", step: 2, color: "text-indigo-500" },
];

export function JogPanel() {
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

  return (
    <div className="space-y-3">
      {/* Quick Preset Poses */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3 w-3 text-sky-500" />
          <span>Quick Poses</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {PRESET_POSES.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.label, preset.joints)}
              className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Switcher: Joint vs Cartesian (IK) */}
      <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setControlMode("JOINT")}
          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
            poseMode === "JOINT"
              ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Joints (J1–J6)
        </button>
        <button
          type="button"
          onClick={() => setControlMode("IK_MOVE")}
          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
            poseMode === "IK"
              ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Position (X/Y/Z)
        </button>
      </div>

      {/* Out of Workspace Alert */}
      {workspaceStatus.out && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{workspaceStatus.message}</span>
        </div>
      )}

      {/* Compact Joint Sliders (all 6 fit comfortably without scrolling) */}
      {poseMode === "JOINT" ? (
        <div className="space-y-2">
          {JOINT_LIMITS.map((limit, i) => {
            const val = joints[i] ?? 0;
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/70"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400">
                      J{i + 1}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {JOINT_SHORT_NAMES[i]}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {limit.min}°..{limit.max}°
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        cancelPath();
                        stepJoint(i, -5);
                      }}
                      title={`J${i + 1} -5°`}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      step={1}
                      min={limit.min}
                      max={limit.max}
                      value={Number(val.toFixed(1))}
                      onChange={(e) => {
                        cancelPath();
                        setJoint(i, Number(e.target.value), { log: false });
                      }}
                      onBlur={(e) => setJoint(i, Number(e.target.value), { log: true })}
                      className="w-14 rounded-md border border-slate-200 bg-slate-50 py-0.5 text-center font-mono text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        cancelPath();
                        stepJoint(i, 5);
                      }}
                      title={`J${i + 1} +5°`}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={limit.min}
                  max={limit.max}
                  step={0.5}
                  value={val}
                  onChange={(e) => {
                    cancelPath();
                    setJoint(i, Number(e.target.value), { log: false });
                  }}
                  onPointerUp={() => setJoint(i, joints[i], { log: true })}
                  className="sim-slider w-full"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            Tip: You can also drag the RGB arrows directly on the robot tip in the 3D view.
          </p>

          {LINEAR_AXES.map((axis) => {
            const range = axisRange(axis.key);
            const val = ikTarget[axis.key];
            return (
              <div
                key={axis.key}
                className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/70"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-mono text-xs font-bold ${axis.color}`}>
                      {axis.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{axis.unit}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleLinearChange(axis.key, val - axis.step, true)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      step={1}
                      value={Number(val.toFixed(1))}
                      onChange={(e) => handleLinearChange(axis.key, Number(e.target.value), false)}
                      onBlur={(e) => handleLinearChange(axis.key, Number(e.target.value), true)}
                      className="w-16 rounded-md border border-slate-200 bg-slate-50 py-0.5 text-center font-mono text-xs font-semibold text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleLinearChange(axis.key, val + axis.step, true)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={1}
                  value={val}
                  onChange={(e) => handleLinearChange(axis.key, Number(e.target.value), false)}
                  onPointerUp={() => applyIk({ withLog: true, rollbackOnFail: true })}
                  className="sim-slider w-full"
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => applyIk({ withLog: true, rollbackOnFail: true })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Solve IK
            </button>
            <div className="text-right font-mono text-[10px] text-slate-500 dark:text-slate-400">
              Err: <strong>{lastIkErr.posMm.toFixed(2)}mm</strong> /{" "}
              <strong>{lastIkErr.rotDeg.toFixed(1)}°</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
