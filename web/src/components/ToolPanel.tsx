"use client";

import {
  AlertTriangle,
  Box,
  Hand,
  LayoutGrid,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  SkipBack,
  SkipForward,
  Trash2,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  conveyorPickPoint,
  reachStatus,
  WORKCELL_PRESETS,
  type ReachStatus,
  type WorkcellPresetId,
} from "@/lib/sim/workcell";
import {
  TOOL_DEFS,
  TOOL_TYPES,
  toolCodeFor,
  type ToolType,
} from "@/lib/tools/toolDefs";
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

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
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

function NumField({
  label,
  value,
  onChange,
  step = 10,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v)) onChange(v);
        }}
        className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
      />
    </label>
  );
}

function ReachBadge({ status }: { status: ReachStatus }) {
  if (status === "OK") {
    return (
      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        within reach
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">
      <AlertTriangle className="h-3 w-3" />
      {status === "TOO_FAR" ? "too far for the arm" : "too close to the base"}
    </span>
  );
}

const CARD =
  "rounded-xl border border-slate-200/80 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/70";

export function ToolPanel() {
  const toolType = useRobotStore((s) => s.toolType);
  const gripperState = useRobotStore((s) => s.gripperState);
  const setToolType = useRobotStore((s) => s.setToolType);
  const setGripper = useRobotStore((s) => s.setGripper);

  const boxes = useWorkcellStore((s) => s.boxes);
  const preset = useWorkcellStore((s) => s.preset);
  const runtime = useWorkcellStore((s) => s.conveyorRuntime);
  const lastGraspMessage = useWorkcellStore((s) => s.lastGraspMessage);
  const conveyor = useWorkcellStore((s) => s.conveyor);
  const platforms = useWorkcellStore((s) => s.platforms);
  const sensor = useWorkcellStore((s) => s.sensor);
  const sensorBlocked = useWorkcellStore((s) => s.sensorBlocked);
  const sensorCount = useWorkcellStore((s) => s.sensorCount);
  const autoFeed = useWorkcellStore((s) => s.autoFeed);
  const wc = useWorkcellStore.getState;

  const def = TOOL_DEFS[toolType];
  const held = boxes.find((b) => b.held);
  const speedPercent = Math.round((runtime.speedMmS / 50) * 100);
  const moving = runtime.speedMmS !== 0 || runtime.targetMm !== null;
  const pick = conveyorPickPoint(conveyor);

  return (
    <div className="space-y-4">
      <Section
        icon={<Wrench className="h-3 w-3 text-sky-500" />}
        title="End-Effector"
      >
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
                    active
                      ? "bg-sky-500 text-white"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                  aria-hidden
                >
                  {TOOL_ICONS[t]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {d.label}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                    TCP {d.tcpOffsetMm} mm
                    {d.maxObjectSizeMm > 0
                      ? ` · max ${d.maxObjectSizeMm} mm`
                      : ""}
                    {t !== "NONE" ? ` · ${d.grabCode} / ${d.releaseCode}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          {def.description}
        </p>
      </Section>

      {toolType !== "NONE" && (
        <Section
          icon={<Hand className="h-3 w-3 text-sky-500" />}
          title="Tool Action"
        >
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={`${BTN} ${gripperState === "CLOSE" ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : ""}`}
              onClick={() => setGripper("CLOSE")}
              title={toolCodeFor(toolType, "CLOSE")}
            >
              {def.grabLabel}{" "}
              <span className="font-mono text-[10px] opacity-60">
                {toolCodeFor(toolType, "CLOSE")}
              </span>
            </button>
            <button
              type="button"
              className={`${BTN} ${gripperState === "OPEN" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : ""}`}
              onClick={() => setGripper("OPEN")}
              title={toolCodeFor(toolType, "OPEN")}
            >
              {def.releaseLabel}{" "}
              <span className="font-mono text-[10px] opacity-60">
                {toolCodeFor(toolType, "OPEN")}
              </span>
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {held ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Holding {held.id}
              </span>
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
          <button
            type="button"
            className={BTN}
            onClick={() => wc().addBox("CONVEYOR")}
          >
            <Plus className="h-3 w-3" /> Box on conveyor
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => wc().addBox("TRAY")}
          >
            <Plus className="h-3 w-3" /> Box on tray
          </button>
        </div>
        <ul className="mt-1.5 space-y-1">
          {boxes.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2 py-1 text-[11px] dark:border-slate-800 dark:bg-slate-900/70"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: b.color }}
              />
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {b.id}
              </span>
              <span className="flex-1 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                {b.held
                  ? "held"
                  : `(${b.x.toFixed(0)}, ${b.y.toFixed(0)}, ${b.z.toFixed(0)})`}
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
          {!boxes.length && (
            <li className="text-[11px] text-slate-500 dark:text-slate-400">
              No boxes
            </li>
          )}
        </ul>
      </Section>

      <Section
        icon={<Play className="h-3 w-3 text-sky-500" />}
        title="Conveyor Belt"
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={speedPercent}
            onChange={(e) =>
              wc().setConveyorSpeedPercent(Number(e.target.value))
            }
            className="sim-slider flex-1"
            aria-label="Conveyor speed"
          />
          <span className="w-16 text-right font-mono text-[11px] text-slate-600 dark:text-slate-300">
            G6 F{speedPercent}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          <button
            type="button"
            className={BTN}
            onClick={() => wc().moveConveyor(-50, false)}
            title="G91 G01 D-50"
          >
            <SkipBack className="h-3 w-3" /> 50
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => wc().setConveyorSpeedPercent(-60)}
            title="G6 F-60"
          >
            <Play className="h-3 w-3 rotate-180" />
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => wc().stopConveyor()}
            disabled={!moving}
            title="G6 F0"
          >
            <Pause className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={BTN}
            onClick={() => wc().moveConveyor(50, false)}
            title="G91 G01 D50"
          >
            50 <SkipForward className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
          D = {runtime.positionMm.toFixed(1)} mm
          {runtime.targetMm !== null ? ` → ${runtime.targetMm.toFixed(1)}` : ""}{" "}
          · {moving ? "running" : "stopped"}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
          Negative = belt moves toward the robot (end stop). Commands: G6
          F-100..100 (MS4220) or G91 G01 D±mm (7th axis).
        </p>
      </Section>

      <Section
        icon={<ScanLine className="h-3 w-3 text-sky-500" />}
        title="Light Sensor & Auto Feed"
      >
        <div className={CARD}>
          <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
            <span>Use light sensor</span>
            <input
              type="checkbox"
              checked={sensor.enabled}
              onChange={(e) => wc().setSensorEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-500"
            />
          </label>
          {!sensor.enabled ? (
            <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
              No sensor on the conveyor: the belt only moves by command (G6 F /
              D-axis / conveyor()). Auto feed and waitSensor() are unavailable,
              and <code>@01SENSOR?</code> replies{" "}
              <code>error:sensor disabled</code>.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      sensorBlocked
                        ? "bg-rose-500 shadow-[0_0_6px] shadow-rose-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  {sensorBlocked ? "Box detected" : "Clear"}
                </span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  SENSOR={sensorBlocked ? 1 : 0} · count {sensorCount}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <NumField
                  label="Beam from end stop (mm)"
                  value={sensor.offsetMm}
                  step={5}
                  onChange={(v) => wc().setSensorOffset(v)}
                />
                <NumField
                  label="Auto-feed speed (%)"
                  value={autoFeed.speedPercent}
                  step={5}
                  min={5}
                  max={100}
                  onChange={(v) => wc().setAutoFeed(autoFeed.enabled, v)}
                />
              </div>
              <button
                type="button"
                onClick={() => wc().setAutoFeed(!autoFeed.enabled)}
                className={`mt-2 w-full ${BTN} ${
                  autoFeed.enabled
                    ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    : ""
                }`}
              >
                {autoFeed.enabled ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {autoFeed.enabled
                  ? "Auto feed ON: stops while a box blocks the beam"
                  : "Start auto feed"}
              </button>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                The belt runs while the beam is clear and stops when a box
                arrives. It starts again once the box is lifted. Changes are
                sent over RS-485 as <code>SENSOR=1</code> /{" "}
                <code>SENSOR=0</code>.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section
        icon={<LayoutGrid className="h-3 w-3 text-sky-500" />}
        title="Layout (mm, robot base frame)"
      >
        <div className="space-y-2">
          <div className={CARD}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Conveyor
              </span>
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950">
                {(["x", "y"] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => wc().updateConveyorLayout({ axis: ax })}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      conveyor.axis === ax
                        ? "bg-sky-600 text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    along {ax.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <NumField
                label="Center X"
                value={conveyor.x}
                onChange={(v) => wc().updateConveyorLayout({ x: v })}
              />
              <NumField
                label="Center Y"
                value={conveyor.y}
                onChange={(v) => wc().updateConveyorLayout({ y: v })}
              />
              <NumField
                label="Height"
                value={conveyor.topZ}
                step={5}
                onChange={(v) => wc().updateConveyorLayout({ topZ: v })}
              />
              <NumField
                label="Length"
                value={conveyor.lengthMm}
                onChange={(v) => wc().updateConveyorLayout({ lengthMm: v })}
              />
              <NumField
                label="Width"
                value={conveyor.widthMm}
                step={5}
                onChange={(v) => wc().updateConveyorLayout({ widthMm: v })}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
              <span>
                Pick at end stop: ({pick.x.toFixed(1)}, {pick.y.toFixed(1)},{" "}
                {(pick.z + 12.5).toFixed(1)})
              </span>
              <ReachBadge status={reachStatus(pick.x, pick.y)} />
            </div>
          </div>

          {platforms.map((p) => (
            <div key={p.id} className={CARD}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ background: p.color }}
                  />
                  {p.label}
                </span>
                <div className="flex items-center gap-2">
                  <ReachBadge status={reachStatus(p.x, p.y)} />
                  <button
                    type="button"
                    onClick={() => wc().removePlatform(p.id)}
                    className="text-slate-400 transition hover:text-rose-500"
                    aria-label={`Remove ${p.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField
                  label="Center X"
                  value={p.x}
                  onChange={(v) => wc().updatePlatform(p.id, { x: v })}
                />
                <NumField
                  label="Center Y"
                  value={p.y}
                  onChange={(v) => wc().updatePlatform(p.id, { y: v })}
                />
                <NumField
                  label="Height"
                  value={p.topZ}
                  step={5}
                  onChange={(v) => wc().updatePlatform(p.id, { topZ: v })}
                />
                <NumField
                  label="Size X"
                  value={p.sizeX}
                  onChange={(v) => wc().updatePlatform(p.id, { sizeX: v })}
                />
                <NumField
                  label="Size Y"
                  value={p.sizeY}
                  onChange={(v) => wc().updatePlatform(p.id, { sizeY: v })}
                />
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={BTN}
              onClick={() => wc().addPlatform()}
            >
              <Plus className="h-3 w-3" /> Add tray
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => wc().resetLayout()}
            >
              <RotateCcw className="h-3 w-3" /> Reset layout
            </button>
          </div>
          <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            Boxes on the conveyor or a tray move with it. The sample programs
            use the default layout, so update their coordinates after you move a
            station.
          </p>
        </div>
      </Section>
    </div>
  );
}
