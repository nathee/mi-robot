"use client";

import { Box, Hand, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward, Trash2, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { WORKCELL_PRESETS, type WorkcellPresetId } from "@/lib/sim/workcell";
import { TOOL_DEFS, TOOL_TYPES, toolCodeFor, type ToolType } from "@/lib/tools/toolDefs";
import { useRobotStore } from "@/stores/useRobotStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";

const TOOL_ICONS: Record<ToolType, string> = {
  NONE: "◯",
  SUCTION: "◉",
  TWO_FINGER: "⫴",
  THREE_FINGER_SOFT: "✣",
  MICRO_SERVO: "⋔",
};

const BTN =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300";

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function ToolPanel() {
  const toolType = useRobotStore((s) => s.toolType);
  const gripperState = useRobotStore((s) => s.gripperState);
  const setToolType = useRobotStore((s) => s.setToolType);
  const setGripper = useRobotStore((s) => s.setGripper);

  const boxes = useWorkcellStore((s) => s.boxes);
  const preset = useWorkcellStore((s) => s.preset);
  const runtime = useWorkcellStore((s) => s.conveyorRuntime);
  const lastGraspMessage = useWorkcellStore((s) => s.lastGraspMessage);
  const wc = useWorkcellStore.getState;

  const def = TOOL_DEFS[toolType];
  const held = boxes.find((b) => b.held);
  const speedPercent = Math.round((runtime.speedMmS / 50) * 100);
  const moving = runtime.speedMmS !== 0 || runtime.targetMm !== null;

  return (
    <div className="space-y-4">
      <Section icon={<Wrench className="h-3 w-3 text-sky-500" />} title="End-Effector">
        <div className="grid grid-cols-1 gap-1.5">
          {TOOL_TYPES.map((t) => {
            const d = TOOL_DEFS[t];
            const active = t === toolType;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setToolType(t)}
                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                  active
                    ? "border-sky-500 bg-sky-50 dark:border-sky-500/70 dark:bg-sky-950/40"
                    : "border-slate-200 bg-white hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-sky-700"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base ${
                    active ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                  aria-hidden
                >
                  {TOOL_ICONS[t]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{d.label}</span>
                  <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                    TCP {d.tcpOffsetMm} mm
                    {d.maxObjectSizeMm > 0 ? ` · max ${d.maxObjectSizeMm} mm` : ""}
                    {t !== "NONE" ? ` · ${d.grabCode} / ${d.releaseCode}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{def.description}</p>
      </Section>

      {toolType !== "NONE" && (
        <Section icon={<Hand className="h-3 w-3 text-sky-500" />} title="Tool Action">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={`${BTN} ${gripperState === "CLOSE" ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : ""}`}
              onClick={() => setGripper("CLOSE")}
              title={toolCodeFor(toolType, "CLOSE")}
            >
              {def.grabLabel} <span className="font-mono text-[10px] opacity-60">{toolCodeFor(toolType, "CLOSE")}</span>
            </button>
            <button
              type="button"
              className={`${BTN} ${gripperState === "OPEN" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : ""}`}
              onClick={() => setGripper("OPEN")}
              title={toolCodeFor(toolType, "OPEN")}
            >
              {def.releaseLabel} <span className="font-mono text-[10px] opacity-60">{toolCodeFor(toolType, "OPEN")}</span>
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {held ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">Holding {held.id}</span>
            ) : (
              lastGraspMessage || "Not holding anything"
            )}
          </div>
        </Section>
      )}

      <Section icon={<Box className="h-3 w-3 text-sky-500" />} title="Workcell">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(WORKCELL_PRESETS) as WorkcellPresetId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => wc().loadPreset(id)}
              title={WORKCELL_PRESETS[id].description}
              className={`${BTN} ${preset === id ? "border-sky-400 text-sky-700 dark:text-sky-300" : ""}`}
            >
              <RotateCcw className="h-3 w-3" />
              {WORKCELL_PRESETS[id].label}
            </button>
          ))}
          <button type="button" className={BTN} onClick={() => wc().addBox("CONVEYOR")}>
            <Plus className="h-3 w-3" /> Box on conveyor
          </button>
          <button type="button" className={BTN} onClick={() => wc().addBox("TRAY")}>
            <Plus className="h-3 w-3" /> Box on tray
          </button>
        </div>
        <ul className="mt-1.5 space-y-1">
          {boxes.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-[11px] dark:border-slate-800 dark:bg-slate-900/70"
            >
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: b.color }} />
              <span className="font-medium text-slate-700 dark:text-slate-200">{b.id}</span>
              <span className="flex-1 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {b.held ? "held" : `(${b.x.toFixed(0)}, ${b.y.toFixed(0)}, ${b.z.toFixed(0)})`}
              </span>
              <button
                type="button"
                onClick={() => wc().removeBox(b.id)}
                className="text-slate-400 transition hover:text-rose-500"
                aria-label={`Remove ${b.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
          {!boxes.length && <li className="text-[11px] text-slate-500 dark:text-slate-400">No boxes</li>}
        </ul>
      </Section>

      <Section icon={<Play className="h-3 w-3 text-sky-500" />} title="Conveyor Belt">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={speedPercent}
            onChange={(e) => wc().setConveyorSpeedPercent(Number(e.target.value))}
            className="sim-slider flex-1"
            aria-label="Conveyor speed"
          />
          <span className="w-16 text-right font-mono text-[11px] text-slate-600 dark:text-slate-300">
            G6 F{speedPercent}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          <button type="button" className={BTN} onClick={() => wc().moveConveyor(-50, false)} title="G91 G01 D-50">
            <SkipBack className="h-3 w-3" /> 50
          </button>
          <button type="button" className={BTN} onClick={() => wc().setConveyorSpeedPercent(-60)} title="G6 F-60">
            <Play className="h-3 w-3 rotate-180" />
          </button>
          <button type="button" className={BTN} onClick={() => wc().stopConveyor()} disabled={!moving} title="G6 F0">
            <Pause className="h-3 w-3" />
          </button>
          <button type="button" className={BTN} onClick={() => wc().moveConveyor(50, false)} title="G91 G01 D50">
            50 <SkipForward className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
          D = {runtime.positionMm.toFixed(1)} mm{runtime.targetMm !== null ? ` → ${runtime.targetMm.toFixed(1)}` : ""} ·{" "}
          {moving ? "running" : "stopped"}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          Negative = belt moves toward the robot (end stop). Commands: G6 F-100..100 (MS4220) or G91 G01 D±mm (7th axis).
        </p>
      </Section>
    </div>
  );
}
