"use client";

import { useEffect, useRef, useState } from "react";
import {
  Hand,
  Layers,
  Move,
  RotateCcw,
  RotateCw,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { IkSolverType } from "@/lib/kinematics/constants";
import {
  MirobotSceneEngine,
  type ViewAxisKey,
  type ViewGizmoProjection,
} from "@/lib/viewer/MirobotSceneEngine";
import { useRobotStore } from "@/stores/useRobotStore";
import { useViewerStore, type FrameAxesVisibility } from "@/stores/useViewerStore";

const AXIS_BADGE_COLORS: Record<"x" | "y" | "z", { pos: string; neg: string }> = {
  x: {
    pos: "bg-rose-500 text-white border-rose-300",
    neg: "bg-rose-950/80 text-rose-300 border-rose-500/50",
  },
  y: {
    pos: "bg-emerald-500 text-white border-emerald-300",
    neg: "bg-emerald-950/80 text-emerald-300 border-emerald-500/50",
  },
  z: {
    pos: "bg-sky-500 text-white border-sky-300",
    neg: "bg-sky-950/80 text-sky-300 border-sky-500/50",
  },
};

export function ViewerCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MirobotSceneEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openPopover, setOpenPopover] = useState<"layers" | "light" | null>(null);
  const [gizmoProj, setGizmoProj] = useState<ViewGizmoProjection | null>(null);
  const gizmoDragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  const viewer = useViewerStore();
  const eePose = useRobotStore((s) => s.eePose);
  const workspaceStatus = useRobotStore((s) => s.workspaceStatus);
  const gripperState = useRobotStore((s) => s.gripperState);
  const setGripper = useRobotStore((s) => s.setGripper);

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

  const activeControlMode =
    viewer.poseMode === "JOINT"
      ? "JOINT"
      : viewer.tcpTransformMode === "rotate"
        ? "IK_ROTATE"
        : "IK_MOVE";

  const brightnessPct = Math.round(((viewer.sceneBrightness - 0.5) / 4.5) * 100);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#121417]"
      onPointerDown={() => {
        if (openPopover) setOpenPopover(null);
      }}
    >
      {/* WebGL Canvas Host */}
      <div ref={hostRef} className="h-full w-full" />

      {/* Loading Indicator */}
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-xs font-medium text-slate-200 shadow-lg">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            Loading 6-DOF Mirobot 3D models...
          </div>
        </div>
      )}

      {/* Top-Left: Simple 3D Interaction Mode Pill */}
      <div
        className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-md backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/85">
          <button
            type="button"
            onClick={() => viewer.setControlMode("JOINT")}
            title="Control individual joints J1–J6"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              activeControlMode === "JOINT"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Hand className="h-3.5 w-3.5" />
            <span>Joint</span>
          </button>
          <button
            type="button"
            onClick={() => viewer.setControlMode("IK_MOVE")}
            title="Drag the TCP arrow gizmo in 3D space (IK Move)"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              activeControlMode === "IK_MOVE"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Move className="h-3.5 w-3.5" />
            <span>Drag Move</span>
          </button>
          <button
            type="button"
            onClick={() => viewer.setControlMode("IK_ROTATE")}
            title="Rotate the TCP orientation gizmo in 3D space (IK Rotate)"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              activeControlMode === "IK_ROTATE"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Drag Rotate</span>
          </button>
        </div>

        {/* Contextual IK Solver pill — only shown when dragging / IK mode is active */}
        {viewer.poseMode === "IK" && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-xs shadow-md backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/85">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">IK</span>
            <select
              aria-label="IK Solver"
              value={viewer.ikSolver}
              onChange={(e) => viewer.setField("ikSolver", e.target.value as IkSolverType)}
              className="rounded bg-transparent text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
            >
              <option value="CONSTRAINED">Constrained</option>
              <option value="ANALYTIC">Analytic</option>
              <option value="DLS">DLS</option>
            </select>
            <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />
            <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={viewer.ikAutoApply}
                onChange={(e) => viewer.setField("ikAutoApply", e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-sky-500"
              />
              Auto
            </label>
          </div>
        )}
      </div>

      {/* Top-Right: Compact Camera, Lighting & Layers Controls */}
      <div
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-md backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/85">
          <button
            type="button"
            onClick={() => engineRef.current?.zoomIn()}
            title="Zoom In"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.zoomOut()}
            title="Zoom Out"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.resetCamera()}
            title="Reset Camera View"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Lighting Popover Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenPopover((p) => (p === "light" ? null : "light"))}
              title="Scene brightness"
              className={`rounded-lg p-1.5 transition ${
                openPopover === "light"
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Sun className="h-4 w-4" />
            </button>

            {openPopover === "light" && (
              <div className="absolute right-0 mt-2.5 w-56 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 flex items-center justify-between font-semibold text-slate-700 dark:text-slate-200">
                  <span>Scene Brightness</span>
                  <span className="font-mono text-[11px] text-sky-500">{brightnessPct}%</span>
                </div>
                <input
                  type="range"
                  aria-label="Scene brightness"
                  min={0.5}
                  max={5}
                  step={0.05}
                  value={viewer.sceneBrightness}
                  onChange={(e) => viewer.setField("sceneBrightness", Number(e.target.value))}
                  className="sim-slider w-full"
                />
              </div>
            )}
          </div>

          {/* Layers Popover Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenPopover((p) => (p === "layers" ? null : "layers"))}
              title="Show or hide 3D layers (Grid, Frames, Workspace, Labels)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                openPopover === "layers"
                  ? "bg-sky-600 text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Layers</span>
            </button>

            {openPopover === "layers" && (
              <div className="absolute right-0 mt-2.5 max-h-[75vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 text-xs shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-2 font-semibold text-slate-800 dark:text-slate-100">
                  3D Display Layers
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-2">
                  {(
                    [
                      ["showGrid", "Grid XY"],
                      ["showZGrid", "Grid Z"],
                      ["showWorkspace", "Workspace"],
                      ["showTcpFrame", "TCP Frame"],
                      ["showTcpValue", "3D TCP Tag"],
                      ["showWorldFrame", "Ground Frame"],
                      ["showLinkFrames", "Link Frames"],
                      ["showPath", "Path Line"],
                      ["showPoints", "Target Dots"],
                      ["showPointFrames", "Target Frames"],
                      ["showLabels", "Labels"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="inline-flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(viewer[key])}
                        onChange={(e) => viewer.setField(key, e.target.checked)}
                        className="h-3.5 w-3.5 rounded accent-sky-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                {viewer.showLinkFrames && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <div className="mb-1.5 text-[11px] font-semibold text-slate-500">
                      Visible Link Frames
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                  </div>
                )}

                <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <div className="mb-1.5 text-[11px] font-semibold text-slate-500">
                    Frame Axes & Gizmo Tuning
                  </div>
                  <div className="mb-2.5 grid grid-cols-3 gap-1.5">
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
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">Drag Scale</span>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={viewer.tcpDragScale}
                        onChange={(e) => viewer.setField("tcpDragScale", Number(e.target.value))}
                        className="sim-slider w-28"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">Frame Len</span>
                      <input
                        type="range"
                        min={0.03}
                        max={0.16}
                        step={0.01}
                        value={viewer.frameLen}
                        onChange={(e) => viewer.setField("frameLen", Number(e.target.value))}
                        className="sim-slider w-28"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom-Left: Subtle Live TCP Coordinate + Clickable Gripper HUD */}
      <div
        className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {workspaceStatus.out && (
          <div className="rounded-lg border border-rose-500/50 bg-rose-950/85 px-2.5 py-1 text-[11px] font-medium text-rose-200 shadow-md backdrop-blur-sm">
            {workspaceStatus.message}
          </div>
        )}
        <div className="inline-flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white/85 px-3 py-1.5 font-mono text-[11px] text-slate-700 shadow-sm backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200">
          <span className="font-sans text-[10px] font-bold tracking-wider text-sky-600 uppercase dark:text-sky-400">
            TCP
          </span>
          <span>
            <strong className="text-rose-500">X</strong> {eePose.x.toFixed(1)}
          </span>
          <span>
            <strong className="text-emerald-500">Y</strong> {eePose.y.toFixed(1)}
          </span>
          <span>
            <strong className="text-sky-500">Z</strong> {eePose.z.toFixed(1)} mm
          </span>
          <span className="hidden text-slate-400 sm:inline">|</span>
          <button
            type="button"
            onClick={() => setGripper(gripperState === "OPEN" ? "CLOSE" : "OPEN")}
            title="Click to toggle 3D Gripper (M3/M5)"
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[10px] font-bold transition ${
              gripperState === "CLOSE"
                ? "bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 dark:text-amber-400"
                : "bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30 dark:text-emerald-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                gripperState === "CLOSE" ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
            Grip: {gripperState}
          </button>
        </div>
      </div>

      {/* Bottom-Right: Interactive 3D View Gizmo */}
      <div
        aria-label="Camera view gizmo"
        onPointerDown={(e) => {
          e.stopPropagation();
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
        className="absolute right-3 bottom-3 z-10 h-22 w-22 cursor-grab rounded-full border border-slate-300/60 bg-slate-900/65 shadow-lg backdrop-blur-sm active:cursor-grabbing dark:border-slate-700/80"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="-44 -44 88 88">
          {gizmoProj?.axes
            .filter((a) => !a.negative)
            .map((a) => (
              <line
                key={a.key}
                x1={0}
                y1={0}
                x2={a.x * 29}
                y2={a.y * 29}
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
            const left = 44 + a.x * 29;
            const top = 44 + a.y * 29;
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
                className={`absolute flex h-5.5 w-5.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-mono text-[9px] font-bold shadow-xs transition-transform hover:scale-110 ${tone}`}
              >
                {a.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}
