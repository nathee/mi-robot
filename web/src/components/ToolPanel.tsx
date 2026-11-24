"use client";

import { useState, type ReactNode } from "react";
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
import { NumericInput, ToggleSwitch } from "./ui";

type ToolSubTab = "TOOL" | "WORKCELL" | "LAYOUT";

const TOOL_ICONS: Record<ToolType, string> = {
  NONE: "◯",
  SUCTION: "◉",
  TWO_FINGER: "⫴",
  THREE_FINGER_SOFT: "✣",
  MICRO_SERVO: "⋔",
};

const BTN =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300";

const CARD =
  "rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800/90 dark:bg-slate-900/60";

function Section({
  icon,
  title,
  right,
  children,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {icon}
          <span>{title}</span>
        </div>
        {right}
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
      <span className="truncate">{label}</span>
      <NumericInput
        value={value}
        step={step}
        min={min}
        max={max}
        precision={1}
        onChange={onChange}
        className="w-full rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 font-mono text-[11px] text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
}

function ReachBadge({ status }: { status: ReachStatus }) {
  if (status === "OK") {
    return (
      <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        In reach
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
      <AlertTriangle className="h-3 w-3" />
      {status === "TOO_FAR" ? "Too far" : "Too close"}
    </span>
  );
}

export function ToolPanel() {
  const [subTab, setSubTab] = useState<ToolSubTab>("TOOL");

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
    <div className="space-y-3">
      {/* Clean Sub-tab Navigation to keep Tools focused and uncluttered */}
      <div className="grid grid-cols-3 rounded-xl border border-slate-200/90 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
        {(
          [
            { id: "TOOL", label: "Tool", icon: Wrench },
            { id: "WORKCELL", label: "Workcell", icon: Box },
            { id: "LAYOUT", label: "Layout", icon: LayoutGrid },
          ] as Array<{ id: ToolSubTab; label: string; icon: typeof Wrench }>
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              subTab === id
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* === SUB-TAB 1: END-EFFECTOR & ACTION === */}
      {subTab === "TOOL" && (
        <div className="space-y-3.5">
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
                        ? "border-sky-500/80 bg-sky-50/80 dark:border-sky-500/70 dark:bg-sky-950/35"
                        : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/60 dark:hover:border-slate-700"
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
                      <span className="block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        TCP {d.tcpOffsetMm}mm
                        {d.maxObjectSizeMm > 0 ? ` · max ${d.maxObjectSizeMm}mm` : ""}
                        {t !== "NONE" ? ` · ${d.grabCode}/${d.releaseCode}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
              {def.description}
            </p>
          </Section>

          {toolType !== "NONE" && (
            <Section
              icon={<Hand className="h-3 w-3 text-sky-500" />}
              title="Tool Action"
            >
              <div className={CARD}>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className={`${BTN} ${
                      gripperState === "CLOSE"
                        ? "border-amber-400/80 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300"
                        : ""
                    }`}
                    onClick={() => setGripper("CLOSE")}
                    title={toolCodeFor(toolType, "CLOSE")}
                  >
                    {def.grabLabel}
                    <span className="font-mono text-[10px] opacity-60">
                      {toolCodeFor(toolType, "CLOSE")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`${BTN} ${
                      gripperState === "OPEN"
                        ? "border-emerald-400/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : ""
                    }`}
                    onClick={() => setGripper("OPEN")}
                    title={toolCodeFor(toolType, "OPEN")}
                  >
                    {def.releaseLabel}
                    <span className="font-mono text-[10px] opacity-60">
                      {toolCodeFor(toolType, "OPEN")}
                    </span>
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {held ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                      <span
                        className="h-2.5 w-2.5 rounded-xs"
                        style={{ background: held.color }}
                      />
                      Holding {held.id}
                    </span>
                  ) : (
                    lastGraspMessage || "Idle — not holding an object"
                  )}
                </div>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* === SUB-TAB 2: WORKCELL, CONVEYOR & SENSOR === */}
      {subTab === "WORKCELL" && (
        <div className="space-y-3.5">
          <Section
            icon={<Box className="h-3 w-3 text-sky-500" />}
            title="Objects & Presets"
            right={
              <span className="font-mono text-[10px] tabular-nums text-slate-400">
                {boxes.length} box{boxes.length === 1 ? "" : "es"}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(WORKCELL_PRESETS) as WorkcellPresetId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => wc().loadPreset(id)}
                  title={WORKCELL_PRESETS[id].description}
                  className={`${BTN} ${
                    preset === id
                      ? "border-sky-400/80 bg-sky-50/70 text-sky-700 dark:border-sky-500/60 dark:bg-sky-950/35 dark:text-sky-300"
                      : ""
                  }`}
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
                <Plus className="h-3 w-3" /> On Conveyor
              </button>
              <button
                type="button"
                className={BTN}
                onClick={() => wc().addBox("TRAY")}
              >
                <Plus className="h-3 w-3" /> On Tray
              </button>
              <button
                type="button"
                disabled={boxes.length === 0}
                onClick={() => wc().clearBoxes()}
                className={`${BTN} col-span-2 text-rose-600 hover:text-rose-600 disabled:opacity-40 dark:text-rose-400`}
              >
                <Trash2 className="h-3 w-3" /> Clear All Boxes
              </button>
            </div>

            {boxes.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {boxes.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] dark:border-slate-800/90 dark:bg-slate-900/60"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-xs"
                      style={{ background: b.color }}
                    />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {b.id}
                    </span>
                    <span className="flex-1 truncate font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                      {b.held
                        ? "Held by tool"
                        : `${b.x.toFixed(0)}, ${b.y.toFixed(0)}, ${b.z.toFixed(0)} mm`}
                    </span>
                    <button
                      type="button"
                      onClick={() => wc().removeBox(b.id)}
                      className="rounded p-0.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50"
                      aria-label={`Remove ${b.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 rounded-lg border border-dashed border-slate-200 py-2.5 text-center text-[11px] text-slate-400 dark:border-slate-800">
                No boxes in scene
              </div>
            )}
          </Section>

          <Section
            icon={<Play className="h-3 w-3 text-sky-500" />}
            title="Conveyor Belt"
            right={
              <span className="font-mono text-[10px] tabular-nums text-slate-400">
                D={runtime.positionMm.toFixed(0)}mm · {moving ? "running" : "stopped"}
              </span>
            }
          >
            <div className={CARD}>
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
                <span className="w-14 text-right font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                  {speedPercent}%
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  className={BTN}
                  onClick={() => wc().moveConveyor(-50, false)}
                  title="Jog -50mm toward end stop (G91 G01 D-50)"
                >
                  <SkipBack className="h-3 w-3" /> 50
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => wc().setConveyorSpeedPercent(-60)}
                  title="Run toward robot (G6 F-60)"
                >
                  <Play className="h-3 w-3 rotate-180" />
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => wc().stopConveyor()}
                  disabled={!moving}
                  title="Stop belt (G6 F0)"
                >
                  <Pause className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={BTN}
                  onClick={() => wc().moveConveyor(50, false)}
                  title="Jog +50mm away (G91 G01 D50)"
                >
                  50 <SkipForward className="h-3 w-3" />
                </button>
              </div>
            </div>
          </Section>

          <Section
            icon={<ScanLine className="h-3 w-3 text-sky-500" />}
            title="Light Sensor & Auto Feed"
          >
            <div className={CARD}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Enable Light Sensor
                </span>
                <ToggleSwitch
                  aria-label="Enable light sensor"
                  checked={sensor.enabled}
                  onChange={(checked) => wc().setSensorEnabled(checked)}
                />
              </div>

              {!sensor.enabled ? (
                <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  Sensor disabled. Belt moves only by manual or program command.
                </p>
              ) : (
                <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          sensorBlocked
                            ? "bg-rose-500 shadow-[0_0_6px] shadow-rose-500"
                            : "bg-emerald-500"
                        }`}
                      />
                      {sensorBlocked ? "Box detected" : "Beam clear"}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                      SENSOR={sensorBlocked ? 1 : 0} · #{sensorCount}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <NumField
                      label="Beam offset (mm)"
                      value={sensor.offsetMm}
                      step={5}
                      onChange={(v) => wc().setSensorOffset(v)}
                    />
                    <NumField
                      label="Auto speed (%)"
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
                    className={`w-full ${BTN} ${
                      autoFeed.enabled
                        ? "border-sky-500/70 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                        : ""
                    }`}
                  >
                    {autoFeed.enabled ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {autoFeed.enabled ? "Auto Feed Running" : "Start Auto Feed"}
                  </button>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      {/* === SUB-TAB 3: WORKCELL LAYOUT GEOMETRY === */}
      {subTab === "LAYOUT" && (
        <div className="space-y-3">
          <div className={CARD}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Conveyor
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950">
                {(["x", "y"] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => wc().updateConveyorLayout({ axis: ax })}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                      conveyor.axis === ax
                        ? "bg-sky-600 text-white"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Axis {ax.toUpperCase()}
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
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-slate-100 pt-2 font-mono text-[10px] tabular-nums text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span>
                Pick ({pick.x.toFixed(0)}, {pick.y.toFixed(0)}, {(pick.z + 12.5).toFixed(0)})
              </span>
              <ReachBadge status={reachStatus(pick.x, pick.y)} />
            </div>
          </div>

          {platforms.map((p) => (
            <div key={p.id} className={CARD}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  <span
                    className="h-2.5 w-2.5 rounded-xs"
                    style={{ background: p.color }}
                  />
                  {p.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <ReachBadge status={reachStatus(p.x, p.y)} />
                  <button
                    type="button"
                    onClick={() => wc().removePlatform(p.id)}
                    className="rounded p-0.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50"
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
              <Plus className="h-3.5 w-3.5" /> Add Tray
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => wc().resetLayout()}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Layout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
