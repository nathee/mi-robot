"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Blocks,
  Clock,
  Code2,
  Copy,
  Download,
  FileCode2,
  Grip,
  GripVertical,
  Home,
  Move,
  MoveHorizontal,
  Pause,
  Play,
  Plus,
  Repeat,
  ScanLine,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  Redo2,
  Undo2,
} from "lucide-react";
import { nextBlockId } from "@/lib/program/blocks";
import { SAMPLE_GCODE_PROGRAMS } from "@/lib/program/gcodeCompiler";
import { SAMPLE_SCRIPTS } from "@/lib/program/scriptCompiler";
import type { CodeEditorMode, ProgramBlock } from "@/lib/program/types";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";
import { TOOL_DEFS, type ToolType } from "@/lib/tools/toolDefs";
import { useCodeStore } from "@/stores/useCodeStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { triggerTextDownload } from "./Toolbar";

/** Same text on server and client (no hydration mismatch); ⌘ on macOS, Ctrl elsewhere. */
const MOD_KEY = "⌘/Ctrl";
import { NumericInput } from "./ui";

const STATUS_BADGE: Record<string, string> = {
  IDLE: "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  RUNNING: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-sky-500/20 text-sky-600 dark:text-sky-400",
  ERROR: "bg-rose-500/20 text-rose-600 dark:text-rose-400",
};

const PALETTE_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-sky-400/70 hover:bg-sky-50/60 hover:text-sky-700 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-slate-800";

function appendLine(text: string, line: string): string {
  const trimmed = text.replace(/\s*$/, "");
  return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
}

interface BlockCardProps {
  block: ProgramBlock;
  index: number;
  isActive: boolean;
  isLocked: boolean;
  activeBlockId: string | null;
  nested?: boolean;
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
  nested = false,
  onDragStart,
  onDragOver,
  onDrop,
}: BlockCardProps) {
  const updateBlock = useCodeStore((s) => s.updateBlock);
  const removeBlock = useCodeStore((s) => s.removeBlock);
  const duplicateBlock = useCodeStore((s) => s.duplicateBlock);
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
                  : block.kind === "WAIT_SENSOR"
                    ? "border-l-cyan-500"
                    : "border-l-purple-500";

  const coordGridCols = nested ? "grid-cols-2" : "grid-cols-3";

  return (
    <div
      draggable={!isLocked && Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-xl border border-l-4 bg-white p-3 text-xs shadow-2xs transition dark:bg-slate-900/75 ${accent} ${
        isActive
          ? "border-sky-400 ring-2 ring-sky-400/40"
          : "border-slate-200/80 dark:border-slate-800/90"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {onDragStart && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" />}
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            #{index + 1}
          </span>
          <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
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
                          : block.kind === "WAIT_SENSOR"
                            ? "Wait Light Sensor"
                            : "Repeat Loop"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {(block.kind === "MOVE_JOINT" || block.kind === "MOVE_LINEAR") && (
            <button
              type="button"
              disabled={isLocked}
              onClick={captureCurrentIntoBlock}
              title="Set this block to the robot's current pose"
              className="rounded-lg bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-600 transition hover:bg-sky-500/20 disabled:opacity-40 dark:text-sky-400"
            >
              Use Pose
            </button>
          )}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => duplicateBlock(block.id)}
            title="Duplicate block"
            aria-label="Duplicate block"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-sky-50 hover:text-sky-600 disabled:opacity-35 dark:hover:bg-sky-950/50 dark:hover:text-sky-400"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => removeBlock(block.id)}
            title="Remove block"
            aria-label="Remove block"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-35 dark:hover:bg-rose-950/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Block-specific inline editors */}
      {block.kind === "MOVE_JOINT" && (
        <div className="mt-2.5 space-y-2">
          <div className={`grid ${coordGridCols} gap-1.5`}>
            {block.joints.map((val, jIdx) => (
              <label
                key={jIdx}
                className="flex items-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1 dark:border-slate-700/80 dark:bg-slate-950"
              >
                <span className="font-mono text-[10px] font-semibold text-slate-400">
                  J{jIdx + 1}
                </span>
                <NumericInput
                  aria-label={`J${jIdx + 1}`}
                  step={1}
                  precision={1}
                  disabled={isLocked}
                  value={val}
                  onChange={(num) => {
                    updateBlock(block.id, (b) => {
                      if (b.kind !== "MOVE_JOINT") return b;
                      const next = b.joints.slice();
                      next[jIdx] = num;
                      return { ...b, joints: next };
                    });
                  }}
                  className="w-full min-w-0 bg-transparent text-right font-mono text-xs font-medium outline-none"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Speed (°/s)</span>
            <NumericInput
              aria-label="Joint speed"
              min={5}
              max={180}
              step={5}
              precision={0}
              disabled={isLocked}
              value={block.speedDegPerSec}
              onChange={(v) =>
                updateBlock(block.id, (b) =>
                  b.kind === "MOVE_JOINT" ? { ...b, speedDegPerSec: v } : b
                )
              }
              className="h-7 w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {block.kind === "MOVE_LINEAR" && (
        <div className="mt-2.5 space-y-2">
          <div className={`grid ${coordGridCols} gap-1.5`}>
            {(["x", "y", "z", "rx", "ry", "rz"] as const).map((axis) => (
              <label
                key={axis}
                className="flex items-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1 dark:border-slate-700/80 dark:bg-slate-950"
              >
                <span className="font-mono text-[10px] font-semibold uppercase text-slate-400">
                  {axis}
                </span>
                <NumericInput
                  aria-label={axis}
                  step={1}
                  precision={1}
                  disabled={isLocked}
                  value={block.pose[axis]}
                  onChange={(num) => {
                    updateBlock(block.id, (b) =>
                      b.kind === "MOVE_LINEAR"
                        ? { ...b, pose: { ...b.pose, [axis]: num } }
                        : b
                    );
                  }}
                  className="w-full min-w-0 bg-transparent text-right font-mono text-xs font-medium outline-none"
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Speed (mm/s)</span>
            <NumericInput
              aria-label="Linear speed"
              min={5}
              max={500}
              step={5}
              precision={0}
              disabled={isLocked}
              value={block.speedMmPerSec}
              onChange={(v) =>
                updateBlock(block.id, (b) =>
                  b.kind === "MOVE_LINEAR" ? { ...b, speedMmPerSec: v } : b
                )
              }
              className="h-7 w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {block.kind === "WAIT" && (
        <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>Delay</span>
          <NumericInput
            aria-label="Wait seconds"
            min={0.1}
            max={60}
            step={0.1}
            precision={1}
            disabled={isLocked}
            value={block.seconds}
            onChange={(v) =>
              updateBlock(block.id, (b) =>
                b.kind === "WAIT" ? { ...b, seconds: Math.max(0.1, v) } : b
              )
            }
            className="h-7 w-18 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
          />
          <span className="text-slate-500">sec</span>
        </div>
      )}

      {block.kind === "GRIPPER" && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950">
            <button
              type="button"
              disabled={isLocked}
              onClick={() =>
                updateBlock(block.id, (b) =>
                  b.kind === "GRIPPER" ? { ...b, state: "OPEN", pwm: 0 } : b
                )
              }
              className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                block.state === "OPEN"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
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
              className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${
                block.state === "CLOSE"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              CLOSE (M3)
            </button>
          </div>
        </div>
      )}

      {block.kind === "CONVEYOR" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <select
            disabled={isLocked}
            value={block.mode}
            onChange={(e) =>
              updateBlock(block.id, (b) =>
                b.kind === "CONVEYOR"
                  ? {
                      ...b,
                      mode: e.target.value as "MOVE" | "SPEED" | "AUTO",
                      value: e.target.value === "SPEED" ? -60 : e.target.value === "AUTO" ? 60 : -50,
                    }
                  : b
              )
            }
            className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="MOVE">Move by (D)</option>
            <option value="SPEED">Speed % (G6 F)</option>
            <option value="AUTO">Auto-feed %</option>
          </select>
          <NumericInput
            aria-label="Conveyor value"
            disabled={isLocked}
            step={block.mode === "MOVE" ? 10 : 5}
            precision={0}
            min={block.mode === "SPEED" ? -100 : block.mode === "AUTO" ? 0 : -5000}
            max={block.mode === "MOVE" ? 5000 : 100}
            value={block.value}
            onChange={(v) =>
              updateBlock(block.id, (b) => (b.kind === "CONVEYOR" ? { ...b, value: v } : b))
            }
            className="h-8 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
          />
          <span className="text-slate-500">{block.mode === "MOVE" ? "mm" : "%"}</span>
        </div>
      )}

      {block.kind === "WAIT_SENSOR" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <select
            disabled={isLocked}
            value={block.until}
            onChange={(e) =>
              updateBlock(block.id, (b) =>
                b.kind === "WAIT_SENSOR" ? { ...b, until: e.target.value as "BLOCKED" | "CLEAR" } : b
              )
            }
            className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="BLOCKED">Box arrives</option>
            <option value="CLEAR">Beam clear</option>
          </select>
          <span className="text-slate-500">timeout</span>
          <NumericInput
            aria-label="Sensor timeout seconds"
            disabled={isLocked}
            min={1}
            max={300}
            step={1}
            precision={0}
            value={block.timeoutSec}
            onChange={(v) =>
              updateBlock(block.id, (b) =>
                b.kind === "WAIT_SENSOR" ? { ...b, timeoutSec: Math.max(1, v) } : b
              )
            }
            className="h-8 w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
          />
          <span className="text-slate-500">s</span>
        </div>
      )}

      {block.kind === "TOOL" && (
        <div className="mt-2.5">
          <select
            disabled={isLocked}
            value={block.tool}
            onChange={(e) =>
              updateBlock(block.id, (b) =>
                b.kind === "TOOL" ? { ...b, tool: e.target.value as ToolType } : b
              )
            }
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
          >
            {getActiveRobotProfile().allowedTools.map((t) => (
              <option key={t} value={t}>
                {TOOL_DEFS[t].label}
              </option>
            ))}
          </select>
        </div>
      )}

      {block.kind === "REPEAT" && (
        <div className="mt-2.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>Times</span>
              <NumericInput
                aria-label="Repeat times"
                min={1}
                max={50}
                step={1}
                precision={0}
                disabled={isLocked}
                value={block.count}
                onChange={(v) =>
                  updateBlock(block.id, (b) =>
                    b.kind === "REPEAT"
                      ? { ...b, count: Math.max(1, Math.min(50, Math.round(v))) }
                      : b
                  )
                }
                className="h-7 w-14 rounded-lg border border-slate-200 bg-slate-50 px-1.5 text-center font-mono text-xs font-semibold outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
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
                className="rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-400"
              >
                + MoveJ
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  const p = useRobotStore.getState().eePose;
                  addBlock(
                    {
                      id: nextBlockId(),
                      kind: "MOVE_LINEAR",
                      pose: {
                        x: Number(p.x.toFixed(1)),
                        y: Number(p.y.toFixed(1)),
                        z: Number(p.z.toFixed(1)),
                        rx: Number(p.rx.toFixed(1)),
                        ry: Number(p.ry.toFixed(1)),
                        rz: Number(p.rz.toFixed(1)),
                      },
                      speedMmPerSec: 80,
                    },
                    block.id
                  );
                }}
                className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                + MoveL
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "GRIPPER", state: "CLOSE", pwm: 1000 }, block.id)
                }
                className="rounded-lg bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-600 transition hover:bg-orange-500/20 dark:text-orange-400"
              >
                + Grip
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "WAIT", seconds: 0.4 }, block.id)
                }
                className="rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-600 transition hover:bg-amber-500/20 dark:text-amber-400"
              >
                + Wait
              </button>
            </div>
          </div>

          <div className="space-y-2 border-l-2 border-purple-500/35 pl-2.5">
            {block.children.length === 0 ? (
              <div className="py-1.5 text-[11px] text-slate-400">
                Empty loop — add a child block above.
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
                  nested
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
  enableTabIndent?: boolean;
}

function LineCodeEditor({
  value,
  onChange,
  activeLine,
  errorLines,
  disabled,
  placeholder,
  enableTabIndent = false,
}: LineCodeEditorProps) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const lines = value.split("\n");
  const totalLines = Math.max(16, lines.length);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (highlightRef.current) highlightRef.current.scrollTop = ta.scrollTop;
  };

  return (
    <div className="flex min-h-[280px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 font-mono text-xs shadow-2xs dark:border-slate-800">
      <div className="relative flex w-full flex-1">
        {/* Synced Line Numbers Gutter */}
        <div
          ref={gutterRef}
          aria-hidden
          className="w-10 shrink-0 select-none overflow-hidden border-r border-slate-800/90 bg-slate-900/90 py-2.5 text-right text-[11px] text-slate-500"
        >
          {Array.from({ length: totalLines }, (_, idx) => {
            const ln = idx + 1;
            const isExec = activeLine === ln;
            const isErr = errorLines.has(ln);
            return (
              <div
                key={ln}
                className={`h-[22px] px-2 leading-[22px] tabular-nums ${
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

        {/* Code Area with Full-Line Highlight Overlay */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            ref={highlightRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden py-2.5"
          >
            {Array.from({ length: totalLines }, (_, idx) => {
              const ln = idx + 1;
              const isExec = activeLine === ln;
              const isErr = errorLines.has(ln);
              return (
                <div
                  key={ln}
                  className={`h-[22px] w-full ${
                    isErr ? "bg-rose-500/18" : isExec ? "bg-sky-500/20" : ""
                  }`}
                />
              );
            })}
          </div>

          <textarea
            ref={textareaRef}
            spellCheck={false}
            wrap="off"
            disabled={disabled}
            value={value}
            onScroll={syncScroll}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (!enableTabIndent || e.key !== "Tab") return;
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const next = `${value.slice(0, start)}  ${value.slice(end)}`;
              onChange(next);
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + 2;
              });
            }}
            placeholder={placeholder}
            className="selectable relative z-10 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-2.5 leading-[22px] text-emerald-300 outline-none placeholder:text-slate-600 disabled:opacity-75"
          />
        </div>
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
  const undoBlocks = useCodeStore((s) => s.undoBlocks);
  const redoBlocks = useCodeStore((s) => s.redoBlocks);
  const canUndoBlocks = useCodeStore((s) => s.blocksUndoStack.length > 0);
  const canRedoBlocks = useCodeStore((s) => s.blocksRedoStack.length > 0);
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
    <div className="flex min-h-full flex-col gap-4 text-xs">
      {/* 3-Mode Selector: Blocks | Script | G-code */}
      <div className="grid shrink-0 grid-cols-3 rounded-xl border border-slate-200/80 bg-slate-200/60 p-1 dark:border-slate-800 dark:bg-slate-900">
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
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              mode === id
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Run / Step / Stop / Export Bar */}
      <div className="shrink-0 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800/90 dark:bg-slate-900/75">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Runner</span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${STATUS_BADGE[status] ?? STATUS_BADGE.IDLE}`}
          >
            {status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runOrPause}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white shadow-xs transition ${
              isRunning ? "bg-amber-500 hover:bg-amber-400" : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{isRunning ? "Pause" : "Run Code"}</span>
          </button>

          <button
            type="button"
            onClick={stepOnce}
            title="Execute next step"
            aria-label="Execute next step"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <SkipForward className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={status === "IDLE"}
            onClick={() => stop("Stopped program")}
            title="Stop execution"
            aria-label="Stop execution"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-35 dark:text-rose-400"
          >
            <Square className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleExportGcode}
            title="Export as WLKATA .gcode file"
            aria-label="Export as G-code file"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>

        {/* Live Step Readout */}
        {activeStep && (
          <div className="mt-3">
            <div className="flex justify-between gap-2 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="truncate">
                Step {activeStepIndex + 1}/{compiledSteps.length}: {activeStep.label}
              </span>
              <span className="shrink-0">{Math.round(stepProgress * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, stepProgress * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Compile Errors */}
      {errors.length > 0 && (
        <div className="shrink-0 space-y-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          {errors.slice(0, 3).map((err, i) => (
            <div key={i} className="flex items-start gap-2">
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
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Add Block</span>
              <div className="flex items-center gap-1 normal-case tracking-normal">
                <button
                  type="button"
                  disabled={isLocked || !canUndoBlocks}
                  onClick={undoBlocks}
                  title={`Undo block edit (${MOD_KEY}+Z)`}
                  aria-label="Undo block edit"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isLocked || !canRedoBlocks}
                  onClick={redoBlocks}
                  title={`Redo block edit (${MOD_KEY}+Y / ${MOD_KEY}+Shift+Z)`}
                  aria-label="Redo block edit"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
                <span className="mx-1 h-3.5 w-px bg-slate-200 dark:bg-slate-700" />
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={loadSampleBlocks}
                  className="inline-flex items-center gap-1 text-sky-600 hover:underline disabled:opacity-40 dark:text-sky-400"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Load Demo
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => addBlock({ id: nextBlockId(), kind: "HOME" })}
                className={PALETTE_BTN}
              >
                <Home className="h-3.5 w-3.5 text-sky-500" />
                Home
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("JOINT")}
                className={PALETTE_BTN}
              >
                <Sliders className="h-3.5 w-3.5 text-blue-500" />
                MoveJ
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("LINEAR")}
                className={PALETTE_BTN}
              >
                <Move className="h-3.5 w-3.5 text-emerald-500" />
                MoveL
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => addBlock({ id: nextBlockId(), kind: "WAIT", seconds: 0.5 })}
                className={PALETTE_BTN}
              >
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Wait
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "GRIPPER", state: "CLOSE", pwm: 1000 })
                }
                className={PALETTE_BTN}
              >
                <Grip className="h-3.5 w-3.5 text-orange-500" />
                Gripper
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "CONVEYOR", mode: "MOVE", value: -50 })
                }
                className={PALETTE_BTN}
              >
                <MoveHorizontal className="h-3.5 w-3.5 text-teal-500" />
                Conveyor
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({
                    id: nextBlockId(),
                    kind: "WAIT_SENSOR",
                    until: "BLOCKED",
                    timeoutSec: 30,
                  })
                }
                className={PALETTE_BTN}
              >
                <ScanLine className="h-3.5 w-3.5 text-cyan-500" />
                Sensor
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({
                    id: nextBlockId(),
                    kind: "TOOL",
                    tool: useRobotStore.getState().toolType,
                  })
                }
                className={PALETTE_BTN}
              >
                <Wrench className="h-3.5 w-3.5 text-rose-500" />
                Tool
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  addBlock({ id: nextBlockId(), kind: "REPEAT", count: 2, children: [] })
                }
                className={PALETTE_BTN}
              >
                <Repeat className="h-3.5 w-3.5 text-purple-500" />
                Repeat
              </button>
            </div>
          </section>

          {/* Convert Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={blocks.length === 0}
              onClick={convertBlocksToScript}
              className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-medium text-slate-600 shadow-2xs transition hover:border-sky-400/70 hover:text-sky-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-sky-400"
            >
              <span>To Script</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={blocks.length === 0}
              onClick={convertBlocksToGcode}
              className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-medium text-slate-600 shadow-2xs transition hover:border-sky-400/70 hover:text-sky-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-sky-400"
            >
              <span>To G-code</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Block Stack */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Program Blocks ({blocks.length})
            </div>
            {blocks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-center text-xs text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/40 dark:text-slate-400">
                No blocks yet. Pick a block above or click <strong>Load Demo</strong>.
              </div>
            ) : (
              <div className="space-y-2">
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
            )}
          </section>
        </div>
      )}

      {/* === MODE 2: EASY SCRIPT === */}
      {mode === "SCRIPT" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("JOINT")}
                title="Insert moveJ() with current robot joint angles"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5 text-blue-500" />
                moveJ
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("LINEAR")}
                title="Insert moveL() with current robot TCP pose"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-emerald-400"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-500" />
                moveL
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
              className="h-8 min-w-[148px] max-w-[200px] truncate rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="" disabled>
                Load sample…
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
            enableTabIndent
            placeholder={`# Write Easy Script:\nhome()\nmoveJ(30, 15, -20, 0, -10, 0)\ngripper("close")\nwait(0.5)`}
          />

          <div className="flex shrink-0 items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="text-xs font-medium text-slate-500 transition hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400"
            >
              {showHelp ? "Hide syntax" : "Syntax reference"}
            </button>
            <button
              type="button"
              onClick={convertScriptToGcode}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 text-xs font-semibold text-sky-600 transition hover:bg-sky-500/20 dark:text-sky-400"
            >
              <span>Convert → G-code</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {showHelp && (
            <div className="shrink-0 space-y-1 rounded-xl border border-slate-200/80 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/75 dark:text-slate-400">
              <div>home() · wait(0.5) · log(&quot;text&quot;)</div>
              <div>moveJ(j1..j6, speed=50) · moveL(x..rz, speed=80)</div>
              <div>gripper(&quot;open&quot;|&quot;close&quot;) · grab() · release()</div>
              <div>tool(&quot;SUCTION&quot;|&quot;TWO_FINGER&quot;|…)</div>
              <div>conveyor(-50) · conveyorAuto(&quot;on&quot;, speed=60)</div>
              <div>waitSensor() · repeat 3: … end</div>
            </div>
          )}
        </div>
      )}

      {/* === MODE 3: WLKATA G-CODE === */}
      {mode === "GCODE" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Cleanly separated insert pills and sample loader so nothing overflows */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Insert Command
              </span>
              <select
                aria-label="Load sample G-code"
                defaultValue=""
                onChange={(e) => {
                  const sample = SAMPLE_GCODE_PROGRAMS[e.target.value];
                  if (sample) setGcodeText(sample.code);
                  e.target.value = "";
                }}
                className="h-8 min-w-[148px] max-w-[200px] truncate rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs outline-none focus:border-sky-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="" disabled>
                  Load sample…
                </option>
                {Object.entries(SAMPLE_GCODE_PROGRAMS).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("JOINT")}
                title="Insert M21 Joint move with current angles"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5 text-blue-500" />
                M21
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => insertCurrentPose("LINEAR")}
                title="Insert M20 Linear move with current TCP pose"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-emerald-400"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-500" />
                M20
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setGcodeText(appendLine(gcodeText, "G4 P0.5"))}
                title="Append 0.5s dwell (G4 P0.5)"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-amber-400"
              >
                G4
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setGcodeText(appendLine(gcodeText, "M3 S1000"))}
                title="Append Gripper Close / Pump ON (M3 S1000)"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-orange-400 hover:text-orange-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-orange-400"
              >
                M3
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setGcodeText(appendLine(gcodeText, "M5"))}
                title="Append Gripper Open / Pump OFF (M5)"
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                M5
              </button>
            </div>
          </div>

          <LineCodeEditor
            value={gcodeText}
            onChange={setGcodeText}
            activeLine={activeLine}
            errorLines={errorLineSet}
            disabled={isLocked}
            placeholder="; WLKATA Mirobot G-code&#10;M21 G90 X0 Y0 Z0 A0 B0 C0 F2700"
          />

          <p className="shrink-0 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Supports <code>M21</code>, <code>M20 G0/G1</code>, <code>G90/G91</code>,{" "}
            <code>G4 P</code>, <code>M3/M5</code>, <code>$H/G28</code>.
          </p>
        </div>
      )}
    </div>
  );
}
