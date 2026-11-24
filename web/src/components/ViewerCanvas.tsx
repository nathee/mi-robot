"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
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
import { TOOL_DEFS, toolCodeFor } from "@/lib/tools/toolDefs";
import { useRobotStore } from "@/stores/useRobotStore";
import { useViewerStore, type FrameAxesVisibility } from "@/stores/useViewerStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";
import { ToggleSwitch, useEscapeKey } from "./ui";

const AXIS_BADGE_COLORS: Record<"x" | "y" | "z", { pos: string; neg: string }> = {
  x: {
    pos: "bg-rose-500 text-white border-rose-300/80",
    neg: "bg-rose-500/15 text-rose-600 border-rose-400/50 dark:bg-rose-950/80 dark:text-rose-300",
  },
  y: {
    pos: "bg-emerald-500 text-white border-emerald-300/80",
    neg: "bg-emerald-500/15 text-emerald-700 border-emerald-400/50 dark:bg-emerald-950/80 dark:text-emerald-300",
  },
  z: {
    pos: "bg-sky-500 text-white border-sky-300/80",
    neg: "bg-sky-500/15 text-sky-700 border-sky-400/50 dark:bg-sky-950/80 dark:text-sky-300",
  },
};

export function ViewerCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MirobotSceneEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openPopover, setOpenPopover] = useState<"layers" | "light" | null>(null);
  const [showAdvancedLayers, setShowAdvancedLayers] = useState(false);
  const [gizmoProj, setGizmoProj] = useState<ViewGizmoProjection | null>(null);
  const gizmoDragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  const viewer = useViewerStore();
  const eePose = useRobotStore((s) => s.eePose);
  const workspaceStatus = useRobotStore((s) => s.workspaceStatus);
  const collision = useWorkcellStore((s) => s.collision);
  const gripperState = useRobotStore((s) => s.gripperState);
  const setGripper = useRobotStore((s) => s.setGripper);
  const toolType = useRobotStore((s) => s.toolType);
  const toolDef = TOOL_DEFS[toolType];

  useEscapeKey(openPopover !== null, () => setOpenPopover(null));

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
      className="relative h-full w-full overflow-hidden bg-[#cfd9df] dark:bg-[#121417]"
      onPointerDown={() => {
        if (openPopover) setOpenPopover(null);
      }}
    >
      {/* WebGL Canvas Host */}
      <div ref={hostRef} className="h-full w-full" />

      {/* Loading Indicator */}
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900/90 px-4 py-2.5 text-xs font-medium text-slate-200 shadow-lg">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            Loading 6-DOF Mirobot 3D models…
          </div>
        </div>
      )}

      {/* Top-Left: Clean 3D Mode Switcher (stacks IK solver below to prevent overlap) */}
      <div
        className="absolute top-3.5 left-3.5 z-10 flex flex-col items-start gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-sm backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/85">
          <button
            type="button"
            onClick={() => viewer.setControlMode("JOINT")}
            title="Control individual joints J1–J6"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeControlMode === "JOINT"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
            }`}
          >
            <Hand className="h-3.5 w-3.5" />
            <span>Joint</span>
          </button>
          <button
            type="button"
            onClick={() => viewer.setControlMode("IK_MOVE")}
            title="Drag TCP arrow gizmo in 3D space (IK Move)"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeControlMode === "IK_MOVE"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
            }`}
          >
            <Move className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Move</span>
          </button>
          <button
            type="button"
            onClick={() => viewer.setControlMode("IK_ROTATE")}
            title="Rotate TCP orientation gizmo in 3D space (IK Rotate)"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeControlMode === "IK_ROTATE"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
            }`}
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rotate</span>
          </button>
        </div>

        {/* Contextual IK Solver pill — neatly below mode pill */}
        {viewer.poseMode === "IK" && (
          <div className="animate-ui-in inline-flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/85">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              IK
            </span>
            <select
              aria-label="IK Solver"
              value={viewer.ikSolver}
              onChange={(e) => viewer.setField("ikSolver", e.target.value as IkSolverType)}
              className="rounded bg-transparent text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
            >
              <option value="CONSTRAINED" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                Constrained
              </option>
              <option value="ANALYTIC" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                Analytic
              </option>
              <option value="DLS" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                DLS
              </option>
            </select>
            <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
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
        className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white/90 p-1 shadow-sm backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/85">
          <button
            type="button"
            onClick={() => engineRef.current?.zoomIn()}
            title="Zoom In"
            aria-label="Zoom In"
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.zoomOut()}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.resetCamera()}
            title="Reset Camera View"
            aria-label="Reset Camera View"
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Lighting Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenPopover((p) => (p === "light" ? null : "light"))}
              title="Scene brightness"
              aria-label="Scene brightness"
              aria-expanded={openPopover === "light"}
              className={`rounded-lg p-1.5 transition ${
                openPopover === "light"
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  : "text-slate-600 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-800/80"
              }`}
            >
              <Sun className="h-4 w-4" />
            </button>

            {openPopover === "light" && (
              <div className="animate-ui-in absolute right-0 mt-2.5 w-64 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
                <div className="mb-2.5 flex items-center justify-between font-semibold text-slate-700 dark:text-slate-200">
                  <span>Scene Brightness</span>
                  <span className="font-mono text-xs tabular-nums text-sky-600 dark:text-sky-400">
                    {brightnessPct}%
                  </span>
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

          {/* Layers Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenPopover((p) => (p === "layers" ? null : "layers"))}
              title="Show or hide 3D layers"
              aria-expanded={openPopover === "layers"}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                openPopover === "layers"
                  ? "bg-sky-600 text-white"
                  : "text-slate-700 hover:bg-slate-100/80 dark:text-slate-200 dark:hover:bg-slate-800/80"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Layers</span>
            </button>

            {openPopover === "layers" && (
              <div className="animate-ui-in absolute right-0 mt-2.5 max-h-[75vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
                <div className="space-y-4">
                  {/* Group 1: Environment */}
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Environment
                    </div>
                    <div className="space-y-2.5">
                      {(
                        [
                          ["showWorkcell", "Workcell & Conveyor"],
                          ["showWorkspace", "Reach Envelope"],
                          ["showGrid", "Floor Grid (XY)"],
                          ["showZGrid", "Vertical Grid (Z)"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="text-slate-700 dark:text-slate-300">{label}</span>
                          <ToggleSwitch
                            aria-label={label}
                            checked={Boolean(viewer[key])}
                            onChange={(checked) => viewer.setField(key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Group 2: Robot & Path */}
                  <div className="border-t border-slate-100 pt-3.5 dark:border-slate-800">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Robot &amp; Path
                    </div>
                    <div className="space-y-2.5">
                      {(
                        [
                          ["showTcpFrame", "TCP Axes"],
                          ["showTcpValue", "3D TCP Coordinates"],
                          ["showPath", "Path Trajectory"],
                          ["showPoints", "Waypoint Markers"],
                          ["showLabels", "3D Labels"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="text-slate-700 dark:text-slate-300">{label}</span>
                          <ToggleSwitch
                            aria-label={label}
                            checked={Boolean(viewer[key])}
                            onChange={(checked) => viewer.setField(key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Collapsible Advanced Frames & Gizmo Tuning */}
                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedLayers((v) => !v)}
                      className="flex w-full items-center justify-between py-0.5 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    >
                      <span>Frames &amp; Gizmo Tuning</span>
                      {showAdvancedLayers ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    {showAdvancedLayers && (
                      <div className="mt-3 space-y-3">
                        <div className="space-y-2.5">
                          {(
                            [
                              ["showWorldFrame", "Ground Frame (F0)"],
                              ["showLinkFrames", "Link Frames (F1–F6)"],
                              ["showPointFrames", "Waypoint Frames"],
                            ] as const
                          ).map(([key, label]) => (
                            <div key={key} className="flex items-center justify-between gap-3">
                              <span className="text-slate-600 dark:text-slate-300">{label}</span>
                              <ToggleSwitch
                                aria-label={label}
                                checked={Boolean(viewer[key])}
                                onChange={(checked) => viewer.setField(key, checked)}
                              />
                            </div>
                          ))}
                        </div>

                        {viewer.showLinkFrames && (
                          <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-950/70">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() =>
                                  viewer.setLinkFrameVisible(i, !viewer.linkFrameVisibility[i])
                                }
                                className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold transition ${
                                  viewer.linkFrameVisibility[i]
                                    ? "bg-sky-600 text-white"
                                    : "bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                }`}
                              >
                                F{i + 1}
                              </button>
                            ))}
                          </div>
                        )}

                        <div>
                          <div className="mb-1.5 text-[10px] font-medium text-slate-400">
                            Visible Axes
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
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
                              <button
                                key={axisKey}
                                type="button"
                                onClick={() =>
                                  viewer.setFrameAxisVisible(axisKey, !viewer.frameAxes[axisKey])
                                }
                                className={`rounded-md py-1 font-mono text-[10px] font-semibold transition ${
                                  viewer.frameAxes[axisKey]
                                    ? "bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/40 dark:text-sky-300"
                                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                                }`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2 pt-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500">Drag Scale</span>
                            <input
                              type="range"
                              aria-label="Drag scale"
                              min={0.05}
                              max={1}
                              step={0.05}
                              value={viewer.tcpDragScale}
                              onChange={(e) => viewer.setField("tcpDragScale", Number(e.target.value))}
                              className="sim-slider w-32"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500">Frame Size</span>
                            <input
                              type="range"
                              aria-label="Frame size"
                              min={0.03}
                              max={0.16}
                              step={0.01}
                              value={viewer.frameLen}
                              onChange={(e) => viewer.setField("frameLen", Number(e.target.value))}
                              className="sim-slider w-32"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom-Left: Subtle Live TCP Coordinate + Clickable Gripper HUD */}
      <div
        className="absolute bottom-3.5 left-3.5 z-10 flex max-w-[calc(100%-8rem)] flex-col items-start gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {collision && (
          <div className="animate-ui-in rounded-xl border border-rose-500/50 bg-rose-950/90 px-3 py-1.5 text-xs font-medium text-rose-100 shadow-md backdrop-blur-sm">
            Collision: {collision}
          </div>
        )}
        {workspaceStatus.out && (
          <div className="animate-ui-in rounded-xl border border-amber-500/50 bg-amber-950/90 px-3 py-1.5 text-xs font-medium text-amber-100 shadow-md backdrop-blur-sm">
            {workspaceStatus.message}
          </div>
        )}
        <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2 font-mono text-xs tabular-nums text-slate-700 shadow-sm backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/85 dark:text-slate-200">
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
            <strong className="text-sky-500">Z</strong> {eePose.z.toFixed(1)}
            <span className="ml-0.5 hidden text-slate-400 sm:inline">mm</span>
          </span>
          {toolType !== "NONE" && (
            <>
              <span className="hidden h-3.5 w-px bg-slate-300/80 sm:inline-block dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => setGripper(gripperState === "OPEN" ? "CLOSE" : "OPEN")}
                title={`${toolDef.label}: click to ${gripperState === "OPEN" ? toolDef.grabLabel.toLowerCase() : toolDef.releaseLabel.toLowerCase()} (${toolCodeFor(toolType, gripperState === "OPEN" ? "CLOSE" : "OPEN")})`}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 font-sans text-[11px] font-semibold transition ${
                  gripperState === "CLOSE"
                    ? "bg-amber-500/20 text-amber-700 hover:bg-amber-500/30 dark:text-amber-300"
                    : "bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 dark:text-emerald-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    gripperState === "CLOSE" ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                {toolDef.shortLabel}:{" "}
                {gripperState === "CLOSE" ? toolDef.grabLabel : toolDef.releaseLabel}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom-Right: Theme-aware Interactive 3D View Gizmo */}
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
        onPointerCancel={() => {
          gizmoDragRef.current.active = false;
        }}
        className="absolute right-3 bottom-3 z-10 h-22 w-22 cursor-grab rounded-full border border-slate-300/80 bg-white/80 shadow-md backdrop-blur-md active:cursor-grabbing dark:border-slate-700/80 dark:bg-slate-900/72"
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="-44 -44 88 88">
          <circle cx={0} cy={0} r={2.5} className="fill-slate-400/60 dark:fill-slate-500/70" />
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
