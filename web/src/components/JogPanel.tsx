"use client";

import { AlertTriangle, Crosshair, Minus, Plus } from "lucide-react";
import { JOINT_LIMITS, type Pose6D } from "@/lib/kinematics/constants";
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useViewerStore } from "@/stores/useViewerStore";

const LINEAR_AXES: Array<{ key: keyof Pose6D; label: string; unit: string; step: number }> = [
  { key: "x", label: "X", unit: "mm", step: 1 },
  { key: "y", label: "Y", unit: "mm", step: 1 },
  { key: "z", label: "Z", unit: "mm", step: 1 },
  { key: "rx", label: "Rx", unit: "°", step: 1 },
  { key: "ry", label: "Ry", unit: "°", step: 1 },
  { key: "rz", label: "Rz", unit: "°", step: 1 },
];

export function JogPanel() {
  const joints = useRobotStore((s) => s.joints);
  const eePose = useRobotStore((s) => s.eePose);
  const ikTarget = useRobotStore((s) => s.ikTarget);
  const lastIkErr = useRobotStore((s) => s.lastIkErr);
  const workspaceStatus = useRobotStore((s) => s.workspaceStatus);
  const setJoint = useRobotStore((s) => s.setJoint);
  const stepJoint = useRobotStore((s) => s.stepJoint);
  const setIkTarget = useRobotStore((s) => s.setIkTarget);
  const applyIk = useRobotStore((s) => s.applyIk);

  const poseMode = useViewerStore((s) => s.poseMode);
  const setField = useViewerStore((s) => s.setField);
  const ikAutoApply = useViewerStore((s) => s.ikAutoApply);
  const workspace = useViewerStore((s) => s.workspace);

  const cancelPath = usePathStore((s) => s.cancelForManualControl);

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

  return (
    <div className="space-y-3">
      {/* Current State Card */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Current State
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setField("poseMode", "JOINT")}
              className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition ${
                poseMode === "JOINT"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Joint Jog
            </button>
            <button
              type="button"
              onClick={() => setField("poseMode", "IK")}
              className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition ${
                poseMode === "IK"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Linear Jog
            </button>
          </div>
        </div>

        {/* Joint Space <-> FK/IK <-> Cartesian Space */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
          <div className="rounded-lg border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="mb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Joint Space (deg)
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[11px]">
              {joints.map((q, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-400">J{i + 1}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {q.toFixed(1)}°
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-sky-500">
            <span>FK →</span>
            <span>← IK</span>
          </div>

          <div className="rounded-lg border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="mb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Cartesian (TCP)
            </div>
            <div className="space-y-0.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-rose-400">X</span>
                <span>{eePose.x.toFixed(1)} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400">Y</span>
                <span>{eePose.y.toFixed(1)} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sky-400">Z</span>
                <span>{eePose.z.toFixed(1)} mm</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-slate-200/70 pt-0.5 text-[10px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>R</span>
                <span>
                  {eePose.rx.toFixed(0)}/{eePose.ry.toFixed(0)}/{eePose.rz.toFixed(0)}°
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Out-Of-Bounds Warning */}
      {workspaceStatus.out && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{workspaceStatus.message}</span>
        </div>
      )}

      {/* Mode Controls */}
      {poseMode === "JOINT" ? (
        <div className="space-y-2.5">
          {JOINT_LIMITS.map((limit, i) => {
            const val = joints[i] ?? 0;
            return (
              <div
                key={i}
                className="rounded-lg border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-sky-500/15 font-mono text-[11px] font-bold text-sky-600 dark:text-sky-400">
                      J{i + 1}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      [{limit.min}°, {limit.max}°]
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        cancelPath();
                        stepJoint(i, -1);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      title={`Decrease J${i + 1} by 1°`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      step={0.5}
                      min={limit.min}
                      max={limit.max}
                      value={Number(val.toFixed(2))}
                      onChange={(e) => {
                        cancelPath();
                        setJoint(i, Number(e.target.value), { log: false });
                      }}
                      onBlur={(e) => setJoint(i, Number(e.target.value), { log: true })}
                      className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center font-mono text-xs font-medium text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        cancelPath();
                        stepJoint(i, 1);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      title={`Increase J${i + 1} by 1°`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={limit.min}
                  max={limit.max}
                  step={0.1}
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
        <div className="space-y-2.5">
          {LINEAR_AXES.map((axis) => {
            const range = axisRange(axis.key);
            const val = ikTarget[axis.key];
            return (
              <div
                key={axis.key}
                className="rounded-lg border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-indigo-500/15 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      {axis.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      [{range.min.toFixed(0)}, {range.max.toFixed(0)} {axis.unit}]
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleLinearChange(axis.key, val - axis.step, true)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      step={0.5}
                      value={Number(val.toFixed(2))}
                      onChange={(e) => handleLinearChange(axis.key, Number(e.target.value), false)}
                      onBlur={(e) => handleLinearChange(axis.key, Number(e.target.value), true)}
                      className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center font-mono text-xs font-medium text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleLinearChange(axis.key, val + axis.step, true)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={0.5}
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
              <div>
                IK Error: <strong>{lastIkErr.posMm.toFixed(2)} mm</strong> /{" "}
                <strong>{lastIkErr.rotDeg.toFixed(2)}°</strong>
              </div>
              <div className="truncate text-[10px] text-sky-500">({lastIkErr.solver})</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
