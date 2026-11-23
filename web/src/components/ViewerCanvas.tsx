"use client";

import { useEffect, useRef, useState } from "react";
import {
  Home,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  SunDim,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { IkSolverType } from "@/lib/kinematics/constants";
import {
  MirobotSceneEngine,
  type ViewAxisKey,
  type ViewGizmoProjection,
} from "@/lib/viewer/MirobotSceneEngine";
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useViewerStore, type FrameAxesVisibility } from "@/stores/useViewerStore";

const AXIS_BADGE_COLORS: Record<"x" | "y" | "z", { pos: string; neg: string }> = {
  x: { pos: "bg-rose-500 text-white border-rose-300", neg: "bg-rose-950/80 text-rose-300 border-rose-500/50" },
  y: { pos: "bg-emerald-500 text-white border-emerald-300", neg: "bg-emerald-950/80 text-emerald-300 border-emerald-500/50" },
  z: { pos: "bg-sky-500 text-white border-sky-300", neg: "bg-sky-950/80 text-sky-300 border-sky-500/50" },
};

export function ViewerCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MirobotSceneEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [gizmoProj, setGizmoProj] = useState<ViewGizmoProjection | null>(null);
  const gizmoDragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  const viewer = useViewerStore();
  const setHome = useRobotStore((s) => s.setHome);
  const cancelPath = usePathStore((s) => s.cancelForManualControl);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let lastGizmoEmit = 0;

    const engine = new MirobotSceneEngine(host, {
      onLoaded: () => setLoaded(true),
      onViewGizmoUpdate: (proj) => {
        const now = performance.now();
        if (now - lastGizmoEmit > 32) {
          lastGizmoEmit = now;
          setGizmoProj(proj);
        }
      },
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleSetHome = () => {
    cancelPath();
    setHome();
  };

  const brightnessPct = Math.round(((viewer.sceneBrightness - 0.5) / 4.5) * 100);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#121417]">
      {/* WebGL Canvas Host */}
      <div ref={hostRef} className="h-full w-full" />

      {/* Loading Indicator */}
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-xs font-medium text-slate-200 shadow-lg">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            Loading 6-DOF Mirobot STL models...
          </div>
        </div>
      )}

      {/* Floating Top Overlay Controls */}
      <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex flex-col gap-1.5">
        {/* Row 1: Visibility Checkboxes + Tuning Popover */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200/70 bg-white/85 px-3 py-1.5 text-[11px] text-slate-800 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-100">
          {(
            [
              ["showGrid", "Grid XY"],
              ["showZGrid", "Grid Z"],
              ["showWorldFrame", "Ground Frame"],
              ["showLinkFrames", "Frames"],
              ["showTcpFrame", "TCP Frame"],
              ["showTcpValue", "TCP Value"],
              ["showWorkspace", "Workspace"],
              ["showPath", "Path"],
              ["showPoints", "Points"],
              ["showPointFrames", "Point Frames"],
              ["showLabels", "Labels"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="inline-flex cursor-pointer items-center gap-1.5 select-none">
              <input
                type="checkbox"
                checked={Boolean(viewer[key])}
                onChange={(e) => viewer.setField(key, e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-sky-500"
              />
              <span>{label}</span>
            </label>
          ))}

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setShowTuning((v) => !v)}
              title="Frame, axis, and font tuning"
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                showTuning
                  ? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  : "border-slate-300 bg-white/70 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Display</span>
            </button>

            {showTuning && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 font-semibold text-slate-700 dark:text-slate-200">
                  Link Frames (F1–F6)
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <label key={i} className="inline-flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={viewer.linkFrameVisibility[i]}
                        onChange={(e) => viewer.setLinkFrameVisible(i, e.target.checked)}
                        className="h-3.5 w-3.5 rounded accent-sky-500"
                      />
                      <span className="font-mono text-[11px]">F{i + 1}</span>
                    </label>
                  ))}
                </div>

                <div className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  Frame Axes
                </div>
                <div className="mb-3 grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["xPos", "X+"],
                      ["yPos", "Y+"],
                      ["zPos", "Z+"],
                      ["xNeg", "X-"],
                      ["yNeg", "Y-"],
                      ["zNeg", "Z-"],
                    ] as Array<[keyof FrameAxesVisibility, string]>
                  ).map(([axisKey, lbl]) => (
                    <label key={axisKey} className="inline-flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={viewer.frameAxes[axisKey]}
                        onChange={(e) => viewer.setFrameAxisVisible(axisKey, e.target.checked)}
                        className="h-3.5 w-3.5 rounded accent-sky-500"
                      />
                      <span className="font-mono text-[11px]">{lbl}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">Frame Len</span>
                    <input
                      type="range"
                      min={0.03}
                      max={0.18}
                      step={0.01}
                      value={viewer.frameLen}
                      onChange={(e) => viewer.setField("frameLen", Number(e.target.value))}
                      className="sim-slider w-32"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">Frame Width</span>
                    <input
                      type="range"
                      min={0.001}
                      max={0.008}
                      step={0.0005}
                      value={viewer.frameWidth}
                      onChange={(e) => viewer.setField("frameWidth", Number(e.target.value))}
                      className="sim-slider w-32"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">Label Font</span>
                    <input
                      type="range"
                      min={10}
                      max={22}
                      step={1}
                      value={viewer.labelFontSize}
                      onChange={(e) => viewer.setField("labelFontSize", Number(e.target.value))}
                      className="sim-slider w-32"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">Grid Font</span>
                    <input
                      type="range"
                      min={10}
                      max={22}
                      step={1}
                      value={viewer.gridFontSize}
                      onChange={(e) => viewer.setField("gridFontSize", Number(e.target.value))}
                      className="sim-slider w-32"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Camera Actions + TCP Drag & IK Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/70 bg-white/85 p-1 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80">
            <button
              type="button"
              onClick={() => engineRef.current?.zoomIn()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Zoom In</span>
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.zoomOut()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ZoomOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Zoom Out</span>
            </button>
            <button
              type="button"
              onClick={() => engineRef.current?.resetCamera()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset Camera</span>
            </button>
            <button
              type="button"
              onClick={handleSetHome}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Set Home</span>
            </button>
          </div>

          {/* TCP / IK Strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white/85 px-2.5 py-1 text-[11px] text-slate-800 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-100">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={viewer.enableTcpMouseDrag}
                onChange={(e) => viewer.setField("enableTcpMouseDrag", e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-sky-500"
              />
              <span>Mouse Drag TCP</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={viewer.ikAutoApply}
                disabled={viewer.poseMode !== "IK"}
                onChange={(e) => viewer.setField("ikAutoApply", e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-sky-500 disabled:opacity-40"
              />
              <span className={viewer.poseMode !== "IK" ? "opacity-50" : ""}>Auto IK</span>
            </label>

            <div className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => viewer.setField("tcpTransformMode", "translate")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  viewer.tcpTransformMode === "translate"
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                Move
              </button>
              <button
                type="button"
                onClick={() => viewer.setField("tcpTransformMode", "rotate")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                  viewer.tcpTransformMode === "rotate"
                    ? "bg-sky-600 text-white"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                Rotate
              </button>
            </div>

            <label className="inline-flex items-center gap-1">
              <span className="text-slate-500 dark:text-slate-400">Scale</span>
              <input
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={viewer.tcpDragScale}
                onChange={(e) => viewer.setField("tcpDragScale", Number(e.target.value))}
                className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-center font-mono text-[11px] outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="inline-flex items-center gap-1">
              <span className="text-slate-500 dark:text-slate-400">Solver</span>
              <select
                value={viewer.ikSolver}
                onChange={(e) => viewer.setField("ikSolver", e.target.value as IkSolverType)}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium outline-none dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="CONSTRAINED">Constrained</option>
                <option value="ANALYTIC">Analytic</option>
                <option value="DLS">DLS</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Left Floating Scene Brightness Slider */}
      <div
        className="absolute bottom-5 left-3 z-10 flex flex-col items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/80 px-2 py-3 shadow-lg backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80"
        title={`Scene brightness: ${brightnessPct}%`}
      >
        <Sun className="h-4 w-4 text-amber-400" />
        <div className="flex h-28 items-center justify-center">
          <input
            type="range"
            aria-label="Scene brightness"
            min={0.5}
            max={5}
            step={0.05}
            value={viewer.sceneBrightness}
            onChange={(e) => viewer.setField("sceneBrightness", Number(e.target.value))}
            className="sim-slider h-1.5 w-24 -rotate-90"
          />
        </div>
        <SunDim className="h-4 w-4 text-slate-400" />
      </div>

      {/* Bottom-Right Interactive 3D View Gizmo */}
      <div
        aria-label="Camera view gizmo"
        onPointerDown={(e) => {
          gizmoDragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!gizmoDragRef.current.active) return;
          const dx = e.clientX - gizmoDragRef.current.lastX;
          const dy = e.clientY - gizmoDragRef.current.lastY;
          gizmoDragRef.current.lastX = e.clientX;
          gizmoDragRef.current.lastY = e.clientY;
          engineRef.current?.orbitByViewGizmo(dx, dy);
        }}
        onPointerUp={() => {
          gizmoDragRef.current.active = false;
        }}
        className="absolute right-4 bottom-4 z-10 h-24 w-24 cursor-grab rounded-full border border-slate-300/60 bg-slate-900/65 shadow-lg backdrop-blur-sm active:cursor-grabbing dark:border-slate-700/80"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="-48 -48 96 96">
          {gizmoProj?.axes
            .filter((a) => !a.negative)
            .map((a) => (
              <line
                key={a.key}
                x1={0}
                y1={0}
                x2={a.x * 32}
                y2={a.y * 32}
                stroke={a.axis === "x" ? "#f43f5e" : a.axis === "y" ? "#10b981" : "#38bdf8"}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
        </svg>

        {gizmoProj?.axes
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((a) => {
            const left = 48 + a.x * 32;
            const top = 48 + a.y * 32;
            const tone = a.negative ? AXIS_BADGE_COLORS[a.axis].neg : AXIS_BADGE_COLORS[a.axis].pos;
            return (
              <button
                key={a.key}
                type="button"
                title={`Snap camera to ${a.label}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => engineRef.current?.setViewAxis(a.key as ViewAxisKey)}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  opacity: a.z < -0.15 ? 0.55 : 1,
                }}
                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-mono text-[9px] font-bold shadow-xs transition-transform hover:scale-110 ${tone}`}
              >
                {a.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}
