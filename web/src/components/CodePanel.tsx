"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Blocks,
  Clock,
  Code2,
  Download,
  FileCode2,
  Grip,
  GripVertical,
  Home,
  Move,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  MoveHorizontal,
  Wrench,
} from "lucide-react";
import { nextBlockId } from "@/lib/program/blocks";
import { SAMPLE_GCODE_PROGRAMS } from "@/lib/program/gcodeCompiler";
import { SAMPLE_SCRIPTS } from "@/lib/program/scriptCompiler";
import type { CodeEditorMode, ProgramBlock } from "@/lib/program/types";
import { TOOL_DEFS, TOOL_TYPES, type ToolType } from "@/lib/tools/toolDefs";
import { useCodeStore } from "@/stores/useCodeStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { triggerTextDownload } from "./Toolbar";

const STATUS_BADGE: Record<string, string> = {
  IDLE: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  RUNNING: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-sky-500/20 text-sky-600 dark:text-sky-400",
  ERROR: "bg-rose-500/20 text-rose-600 dark:text-rose-400",
};

interface BlockCardProps {
  block: ProgramBlock;
  index: number;
  isActive: boolean;
  isLocked: boolean;
  activeBlockId: string | null;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}

function BlockCard({
  block,
  index,
  isActive,
  isLocked,
  activeBlockId,
  onDragStart,
  onDragOver,
  onDrop,
}: BlockCardProps) {
  const updateBlock = useCodeStore((s) => s.updateBlock);
  const removeBlock = useCodeStore((s) => s.removeBlock);
  const addBlock = useCodeStore((s) => s.addBlock);

  const captureCurrentIntoBlock = () => {
    const robot = useRobotStore.getState();
    if (block.kind === "MOVE_JOINT") {
      updateBlock(block.id, (b) =>
        b.kind === "MOVE_JOINT"
          ? { ...b, joints: robot.joints.map((v) => Number(v.toFixed(1))) }
          : b
      );
    } else if (block.kind === "MOVE_LINEAR") {
      const p = robot.eePose;
      updateBlock(block.id, (b) =>
        b.kind === "MOVE_LINEAR"
          ? {
              ...b,
              pose: {
                x: Number(p.x.toFixed(1)),
                y: Number(p.y.toFixed(1)),
                z: Number(p.z.toFixed(1)),
                rx: Number(p.rx.toFixed(1)),
                ry: Number(p.ry.toFixed(1)),
                rz: Number(p.rz.toFixed(1)),
              },
            }
          : b
      );
    }
  };

  const accent =
    block.kind === "HOME"
      ? "border-l-sky-500"
      : block.kind === "MOVE_JOINT"
        ? "border-l-blue-500"
        : block.kind === "MOVE_LINEAR"
          ? "border-l-emerald-500"
          : block.kind === "WAIT"
            ? "border-l-amber-500"
            : block.kind === "GRIPPER"
              ? "border-l-orange-500"
              : block.kind === "CONVEYOR"
                ? "border-l-teal-500"
                : block.kind === "TOOL"
                  ? "border-l-rose-500"
                  : "border-l-purple-500";

  return (
    <div
      draggable={!isLocked && Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-lg border border-l-4 bg-white p-2 text-xs transition dark:bg-slate-900/80 ${accent} ${
        isActive
          ? "border-sky-400 ring-2 ring-sky-400/50"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {onDragStart && <GripVertical className="h-3.5 w-3.5 cursor-grab text-slate-400" />}
          <span className="font-mono text-[10px] text-slate-400">#{index + 1}</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {block.kind === "HOME"
              ? "Home"
              : block.kind === "MOVE_JOINT"
                ? "Move Joint"
                : block.kind === "MOVE_LINEAR"
                  ? "Move Linear"
                  : block.kind === "WAIT"
                    ? "Wait"
                    : block.kind === "GRIPPER"
                      ? "Gripper"
                      : block.kind === "CONVEYOR"
                        ? "Conveyor"
                        : block.kind === "TOOL"
                          ? "Change Tool"
                          : "Repeat Loop"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {(block.kind === "MOVE_JOINT" || block.kind === "MOVE_LINEAR") && (
            <button
              type="button"
              disabled={isLocked}
              onClick={captureCurrentIntoBlock}
              title="Set this block to the robot's current pose"
              className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-400"
            >
              Use Pose
            </button>
          )}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => removeBlock(block.id)}
            title="Remove block"
            className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-35 dark:hover:bg-rose-950/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Block-specific inline editors */}
      {block.kind === "MOVE_JOINT" && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1">
            {block.joints.map((val, jIdx) => (
              <label
                key={jIdx}
                className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-950"
              >
                <span className="font-mono text-[10px] text-slate-400">J{jIdx + 1}</span>
                <input
                  type="number"
                  step={1}
                  disabled={isLocked}
                  value={val}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    updateBlock(block.id, (b) => {
                      if (b.kind !== "MOVE_JOINT") return b;
                      const next = b.joints.slice();
                      next[jIdx] = Number.isFinite(num) ? num : 0;
                      return { ...b, joints: next };
                    });
                  }}
                  className="w-full bg-transparent text-right font-mono text-[11px] font-medium outline-none"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
            <span>Speed (°/s)</span>
            <input
              type="number"
              min={5}
              max={180}
              disabled={isLocked}
              value={block.speedDegPerSec}
              onChange={(e) =>
                updateBlock(block.id, (b) =>
                  b.kind === "MOVE_JOINT"
                    ? { ...b, speedDegPerSec: Number(e.target.value) || 50 }
                    : b
                )
              }
              className="w-14 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-center font-mono text-[11px] outline-none dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {block.kind === "MOVE_LINEAR" && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1">
            {(["x", "y", "z", "rx", "ry", "rz"] as const).map((axis) => (
              <label
                key={axis}
                className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-950"
              >
                <span className="font-mono text-[10px] uppercase text-slate-400">{axis}</span>
                <input
                  type="number"
                  step={1}
                  disabled={isLocked}
                  value={block.pose[axis]}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    updateBlock(block.id, (b) =>
                      b.kind === "MOVE_LINEAR"
                        ? { ...b, pose: { ...b.pose, [axis]: Number.isFinite(num) ? num : 0 } }
                        : b
                    );
                  }}
                  className="w-full bg-transparent text-right font-mono text-[11px] font-medium outline-none"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
            <span>Speed (mm/s)</span>
            <input
              type="number"
              min={5}
              max={500}
              disabled={isLocked}
              value={block.speedMmPerSec}
              onChange={(e) =>
                updateBlock(block.id, (b) =>
                  b.kind === "MOVE_LINEAR"
                    ? { ...b, speedMmPerSec: Number(e.target.value) || 80 }
                    : b
                )
              }
              className="w-14 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-center font-mono text-[11px] outline-none dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {block.kind === "WAIT" && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <span>Delay</span>
          <input
            type="number"
            min={0.1}
            max={60}
            step={0.1}
            disabled={isLocked}
            value={block.seconds}
            onChange={(e) =>
              updateBlock(block.id, (b) =>
                b.kind === "WAIT" ? { ...b, seconds: Math.max(0.1, Number(e.target.value) || 0.5) } : b
              )
            }
            className="w-16 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center font-mono text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
          />
          <span>seconds</span>
        </div>
      )}

      {block.kind === "GRIPPER" && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              disabled={isLocked}
              onClick={() =>
                updateBlock(block.id, (b) =>
                  b.kind === "GRIPPER" ? { ...b, state: "OPEN", pwm: 0 } : b
                )
              }
              className={`rounded px-2.5 py-0.5 text-[11px] font-semibold ${
                block.state === "OPEN"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              OPEN (M5)
            </button>
            <button
              type="button"
              disabled={isLocked}
              onClick={() =>
                updateBlock(block.id, (b) =>
                  b.kind === "GRIPPER" ? { ...b, state: "CLOSE", pwm: 1000 } : b
                )
              }
              className={`rounded px-2.5 py-0.5 text-[11px] font-semibold ${
                block.state === "CLOSE"
                  ? "bg-amber-500 text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              CLOSE (M3)
            </button>
          </div>
        </div>
      )}

      {block.kind === "CONVEYOR" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <select
            disabled={isLocked}
            value={block.mode}
            onChange={(e) =>
              updateBlock(block.id, (b) =>
                b.kind === "CONVEYOR"
                  ? { ...b, mode: e.target.value as "MOVE" | "SPEED", value: e.target.value === "SPEED" ? -60 : -50 }
                  : b
              )
            }
            className="rounded border border-slate-200 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="MOVE">Move by (D)</option>
            <option value="SPEED">Speed % (G6 F)</option>
          </select>
          <input
            type="number"
            disabled={isLocked}
            step={block.mode === "SPEED" ? 5 : 10}
            min={block.mode === "SPEED" ? -100 : -5000}
            max={block.mode === "SPEED" ? 100 : 5000}
            value={block.value}
            onChange={(e) =>
              updateBlock(block.id, (b) => (b.kind === "CONVEYOR" ? { ...b, value: Number(e.target.value) || 0 } : b))
            }
            className="w-20 rounded border border-slate-200 bg-white px-1 py-0.5 font-mono dark:border-slate-700 dark:bg-slate-950"
          />
          <span>{block.mode === "SPEED" ? "%" : "mm"}</span>
        </div>
      )}

      {block.kind === "TOOL" && (
        <div className="mt-1.5">
          <select
            disabled={isLocked}
            value={block.tool}
            onChange={(e) =>
              updateBlock(block.id, (b) => (b.kind === "TOOL" ? { ...b, tool: e.target.value as ToolType } : b))
            }
            className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-950"
          >
            {TOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TOOL_DEFS[t].label}
              </option>
            ))}
          </select>
        </div>
      )}

      {block.kind === "REPEAT" && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <span>Times:</span>
              <input
                type="number"
                min={1}
                max={50}
                disabled={isLocked}
                value={block.count}
                onChange={(e) =>
                  updateBlock(block.id, (b) =>
                    b.kind === "REPEAT"
                      ? { ...b, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }
                      : b
                  )
                }
                className="w-12 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-center font-mono text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  const r = useRobotStore.getState();
                  addBlock(
                    {
                      id: nextBlockId(),
                      kind: "MOVE_JOINT",
                      joints: r.joints.map((v) => Number(v.toFixed(1))),
                      speedDegPerSec: 55,
                    },
                    block.id
                  );
                }}
                className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
              >
                + MoveJ
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "GRIPPER", state: "CLOSE", pwm: 1000 }, block.id)
                }
                className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 hover:bg-orange-500/20 dark:text-orange-400"
              >
                + Grip
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "WAIT", seconds: 0.4 }, block.id)
                }
                className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              >
                + Wait
              </button>
            </div>
          </div>

          <div className="space-y-1.5 border-l-2 border-purple-500/40 pl-2">
            {block.children.length === 0 ? (
              <div className="py-1 text-[10px] text-slate-400">
                Empty loop — click + MoveJ / + Grip / + Wait above.
              </div>
            ) : (
              block.children.map((child, cIdx) => (
                <BlockCard
                  key={child.id}
                  block={child}
                  index={cIdx}
                  isActive={activeBlockId === child.id}
                  isLocked={isLocked}
                  activeBlockId={activeBlockId}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface LineCodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  activeLine: number | null;
  errorLines: Set<number>;
  disabled: boolean;
  placeholder: string;
}

function LineCodeEditor({
  value,
  onChange,
  activeLine,
  errorLines,
  disabled,
  placeholder,
}: LineCodeEditorProps) {
  const lines = value.split("\n");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 font-mono text-[11px] dark:border-slate-800">
      <div className="relative flex max-h-72 overflow-auto">
        {/* Line Numbers + Active/Error Indicators */}
        <div className="select-none border-r border-slate-800 bg-slate-900/90 py-2 text-right text-slate-500">
          {lines.map((_, idx) => {
            const ln = idx + 1;
            const isExec = activeLine === ln;
            const isErr = errorLines.has(ln);
            return (
              <div
                key={ln}
                className={`px-2 leading-5 ${
                  isErr
                    ? "bg-rose-500/30 font-bold text-rose-300"
                    : isExec
                      ? "bg-sky-500/35 font-bold text-sky-300"
                      : ""
                }`}
              >
                {ln}
              </div>
            );
          })}
        </div>

        {/* Editable Textarea */}
        <textarea
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={Math.max(11, lines.length + 1)}
          className="selectable flex-1 resize-none bg-transparent px-2.5 py-2 leading-5 text-emerald-300 outline-none placeholder:text-slate-600 disabled:opacity-75"
        />
      </div>
    </div>
  );
}

export function CodePanel() {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const mode = useCodeStore((s) => s.mode);
  const blocks = useCodeStore((s) => s.blocks);
  const scriptText = useCodeStore((s) => s.scriptText);
  const gcodeText = useCodeStore((s) => s.gcodeText);
  const status = useCodeStore((s) => s.status);
  const compiledSteps = useCodeStore((s) => s.compiledSteps);
  const errors = useCodeStore((s) => s.errors);
  const activeStepIndex = useCodeStore((s) => s.activeStepIndex);
  const activeLine = useCodeStore((s) => s.activeLine);
  const activeBlockId = useCodeStore((s) => s.activeBlockId);
  const stepProgress = useCodeStore((s) => s.stepProgress);

  const setMode = useCodeStore((s) => s.setMode);
  const setScriptText = useCodeStore((s) => s.setScriptText);
  const setGcodeText = useCodeStore((s) => s.setGcodeText);
  const addBlock = useCodeStore((s) => s.addBlock);
  const moveBlock = useCodeStore((s) => s.moveBlock);
  const loadSampleBlocks = useCodeStore((s) => s.loadSampleBlocks);
  const insertCurrentPose = useCodeStore((s) => s.insertCurrentPose);
  const convertBlocksToGcode = useCodeStore((s) => s.convertBlocksToGcode);
  const convertBlocksToScript = useCodeStore((s) => s.convertBlocksToScript);
  const convertScriptToGcode = useCodeStore((s) => s.convertScriptToGcode);
  const getExportableGcode = useCodeStore((s) => s.getExportableGcode);
  const runOrPause = useCodeStore((s) => s.runOrPause);
  const stepOnce = useCodeStore((s) => s.stepOnce);
  const stop = useCodeStore((s) => s.stop);

  const projectName = useProjectStore((s) => s.name);
  const appendLog = useSerialStore((s) => s.appendLog);

  const isRunning = status === "RUNNING";
  const isLocked = status === "RUNNING" || status === "PAUSED";
  const errorLineSet = new Set(errors.map((e) => e.line));
  const activeStep = compiledSteps[activeStepIndex];

  const handleExportGcode = () => {
    const gcode = getExportableGcode();
    if (!gcode) {
      appendLog({ dir: "error", text: "[CODE] Fix syntax errors before exporting G-code" });
      return;
    }
    const slug = projectName.replace(/[^a-zA-Z0-9._-]+/g, "_") || "mirobot-code";
    triggerTextDownload(`${slug}.gcode`, gcode, "text/plain");
    appendLog({ dir: "ok", text: `[CODE] Exported ${slug}.gcode` });
  };

  return (
    <div className="space-y-3 text-xs">
      {/* 3-Mode Selector: Blocks | Script | G-code */}
      <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
        {(
          [
            { id: "BLOCKS", label: "Blocks", icon: Blocks },
            { id: "SCRIPT", label: "Script", icon: Code2 },
            { id: "GCODE", label: "G-code", icon: FileCode2 },
          ] as Array<{ id: CodeEditorMode; label: string; icon: typeof Blocks }>
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              mode === id
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Run / Step / Stop / Export Bar */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Program Runner</span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_BADGE[status] ?? STATUS_BADGE.IDLE}`}
          >
            {status}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={runOrPause}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-white shadow-xs transition ${
              isRunning ? "bg-amber-500 hover:bg-amber-400" : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isRunning ? "Pause" : "Run Code"}</span>
          </button>

          <button
            type="button"
            onClick={stepOnce}
            title="Execute next step"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={status === "IDLE"}
            onClick={() => stop("Stopped program")}
            title="Stop execution"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-600 hover:bg-rose-500/20 disabled:opacity-35 dark:text-rose-400"
          >
            <Square className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleExportGcode}
            title="Export as WLKATA .gcode file"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Live Step Readout */}
        {activeStep && (
          <div className="mt-2">
            <div className="flex justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400">
              <span className="truncate">
                Step {activeStepIndex + 1}/{compiledSteps.length}: {activeStep.label}
              </span>
              <span>{Math.round(stepProgress * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, stepProgress * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Compile Errors */}
      {errors.length > 0 && (
        <div className="space-y-1 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11px] text-rose-600 dark:text-rose-400">
          {errors.slice(0, 3).map((err, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Line {err.line}:</strong> {err.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* === MODE 1: VISUAL BLOCKS === */}
      {mode === "BLOCKS" && (
        <div className="space-y-2.5">
          {/* Block Palette */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>Add Command Block</span>
              <button
                type="button"
                disabled={isLocked}
                onClick={loadSampleBlocks}
                className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400"
              >
                <Sparkles className="h-3 w-3" />
                Load Demo
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => addBlock({ id: nextBlockId(), kind: "HOME" })}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-300"
              >
                <Home className="h-3 w-3" />
                Home
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("JOINT")}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-500/20 disabled:opacity-40 dark:text-blue-300"
              >
                <Sliders className="h-3 w-3" />
                MoveJ
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("LINEAR")}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
              >
                <Move className="h-3 w-3" />
                MoveL
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => addBlock({ id: nextBlockId(), kind: "WAIT", seconds: 0.5 })}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/20 disabled:opacity-40 dark:text-amber-300"
              >
                <Clock className="h-3 w-3" />
                Wait
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "GRIPPER", state: "CLOSE", pwm: 1000 })
                }
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/10 py-1.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-500/20 disabled:opacity-40 dark:text-orange-300"
              >
                <Grip className="h-3 w-3" />
                Gripper
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => addBlock({ id: nextBlockId(), kind: "CONVEYOR", mode: "MOVE", value: -50 })}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-teal-500/30 bg-teal-500/10 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-500/20 disabled:opacity-40 dark:text-teal-300"
              >
                <MoveHorizontal className="h-3 w-3" />
                Conveyor
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "TOOL", tool: useRobotStore.getState().toolType })
                }
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-300"
              >
                <Wrench className="h-3 w-3" />
                Tool
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "REPEAT", count: 2, children: [] })
                }
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 py-1.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-500/20 disabled:opacity-40 dark:text-purple-300"
              >
                <Repeat className="h-3 w-3" />
                Repeat
              </button>
            </div>
          </div>

          {/* Convert Actions */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={convertBlocksToScript}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <span>View as Script</span>
              <ArrowRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={convertBlocksToGcode}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <span>Convert → G-code</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* Block Stack */}
          <div className="space-y-1.5">
            {blocks.map((blk, idx) => (
              <BlockCard
                key={blk.id}
                block={blk}
                index={idx}
                isActive={activeBlockId === blk.id}
                isLocked={isLocked}
                activeBlockId={activeBlockId}
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== idx) moveBlock(dragIdx, idx);
                  setDragIdx(null);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* === MODE 2: EASY SCRIPT === */}
      {mode === "SCRIPT" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("JOINT")}
                className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
              >
                <Plus className="h-3 w-3" />
                moveJ (Current)
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("LINEAR")}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                <Plus className="h-3 w-3" />
                moveL (Current)
              </button>
            </div>

            <select
              aria-label="Load sample script"
              defaultValue=""
              onChange={(e) => {
                const sample = SAMPLE_SCRIPTS[e.target.value];
                if (sample) setScriptText(sample.code);
                e.target.value = "";
              }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium outline-none dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                Samples...
              </option>
              {Object.entries(SAMPLE_SCRIPTS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <LineCodeEditor
            value={scriptText}
            onChange={setScriptText}
            activeLine={activeLine}
            errorLines={errorLineSet}
            disabled={isLocked}
            placeholder={`# Write Easy Script:\nhome()\nmoveJ(30, 15, -20, 0, -10, 0)\ngripper("close")\nwait(0.5)`}
          />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="text-[11px] font-medium text-slate-500 hover:text-sky-500"
            >
              {showHelp ? "Hide syntax guide" : "Syntax guide"}
            </button>
            <button
              type="button"
              onClick={convertScriptToGcode}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-600 hover:bg-sky-500/20 dark:text-sky-400"
            >
              <span>Convert → G-code</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {showHelp && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <div>home()</div>
              <div>moveJ(j1, j2, j3, j4, j5, j6, speed=50)</div>
              <div>moveL(x, y, z, rx, ry, rz, speed=80)</div>
              <div>gripper(&quot;open&quot; | &quot;close&quot;) · suction(&quot;on&quot; | &quot;off&quot;) · grab() · release()</div>
              <div>tool(&quot;SUCTION&quot; | &quot;TWO_FINGER&quot; | &quot;THREE_FINGER_SOFT&quot; | &quot;MICRO_SERVO&quot;)</div>
              <div>conveyor(-50) · conveyorTo(0) · conveyorSpeed(-60)</div>
              <div>wait(0.5) · log(&quot;text&quot;)</div>
              <div>repeat 3: ... end</div>
            </div>
          )}
        </div>
      )}

      {/* === MODE 3: WLKATA G-CODE === */}
      {mode === "GCODE" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("JOINT")}
                className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
              >
                <Plus className="h-3 w-3" />
                M21 Joint
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("LINEAR")}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                <Plus className="h-3 w-3" />
                M20 Linear
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setGcodeText(`${gcodeText.replace(/\s*$/, "")}\nG4 P0.5\n`)}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              >
                + G4 Wait
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setGcodeText(`${gcodeText.replace(/\s*$/, "")}\nM3 S1000\n`)}
                className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-600 hover:bg-orange-500/20 dark:text-orange-400"
              >
                + M3 Close
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setGcodeText(`${gcodeText.replace(/\s*$/, "")}\nM5\n`)}
                className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                + M5 Open
              </button>
            </div>

            <select
              aria-label="Load sample G-code"
              defaultValue=""
              onChange={(e) => {
                const sample = SAMPLE_GCODE_PROGRAMS[e.target.value];
                if (sample) setGcodeText(sample.code);
                e.target.value = "";
              }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium outline-none dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                Samples...
              </option>
              {Object.entries(SAMPLE_GCODE_PROGRAMS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <LineCodeEditor
            value={gcodeText}
            onChange={setGcodeText}
            activeLine={activeLine}
            errorLines={errorLineSet}
            disabled={isLocked}
            placeholder="; WLKATA Mirobot G-code\nM21 G90 X0 Y0 Z0 A0 B0 C0 F2700"
          />

          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Supports <code>M21</code> (Joint), <code>M20 G0/G1</code> (Cartesian),{" "}
            <code>G90/G91</code>, <code>G4 P</code> (Delay), <code>M3/M5</code> (Gripper),{" "}
            <code>$H/G28</code> (Home).
          </p>
        </div>
      )}
    </div>
  );
}
