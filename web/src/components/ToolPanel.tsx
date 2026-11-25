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
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  conveyorPickPoint,
  reachStatus,
  platformDisplayLabel,
  WORKCELL_PRESETS,
  workcellPresetText,
  type ReachStatus,
  type WorkcellPresetId,
} from "@/lib/sim/workcell";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";
import {
  TOOL_DEFS,
  toolCodeFor,
  toolText,
  type ToolType,
} from "@/lib/tools/toolDefs";
import { useRobotStore } from "@/stores/useRobotStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";
import { NumericInput, ToggleSwitch } from "./ui";
import { useT } from "@/lib/i18n/useT";

type ToolSubTab = "TOOL" | "WORKCELL" | "LAYOUT";

const TOOL_ICONS: Record<ToolType, string> = {
  NONE: "◯",
  SUCTION: "◉",
  TWO_FINGER: "⫴",
  THREE_FINGER_SOFT: "✣",
  MICRO_SERVO: "⋔",
  XARM_GRIPPER: "⫴",
};

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300";

const CARD =
  "rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800/90 dark:bg-slate-900/75";

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
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {icon}
          <span>{title}</span>
        </div>
        {right}
      </div>
      {children}
    </section>
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
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      <span className="truncate">{label}</span>
      <NumericInput
        value={value}
        step={step}
        min={min}
        max={max}
        precision={1}
        onChange={onChange}
        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs font-medium text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
}

function ReachBadge({ status }: { status: ReachStatus }) {
  const t = useT();
  if (status === "OK") {
    return (
      <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        {t("tool.inReach")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
      <AlertTriangle className="h-3 w-3" />
      {status === "TOO_FAR" ? t("tool.tooFar") : t("tool.tooClose")}
    </span>
  );
}

export function ToolPanel() {
  const t = useT();
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

  const held = boxes.find((b) => b.held);
  const speedPercent = Math.round((runtime.speedMmS / 50) * 100);
  const moving = runtime.speedMmS !== 0 || runtime.targetMm !== null;
  const pick = conveyorPickPoint(conveyor);

  return (
    <div className="space-y-4">
      {/* Sub-tab Navigation */}
      <div className="grid grid-cols-3 rounded-xl border border-slate-200/80 bg-slate-200/60 p-1 dark:border-slate-800 dark:bg-slate-900">
        {(
          [
            { id: "TOOL", label: t("tool.tabTool"), icon: Wrench },
            { id: "WORKCELL", label: t("tool.tabWorkcell"), icon: Box },
            { id: "LAYOUT", label: t("tool.tabLayout"), icon: LayoutGrid },
          ] as Array<{ id: ToolSubTab; label: string; icon: typeof Wrench }>
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
              subTab === id
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* === SUB-TAB 1: END-EFFECTOR & ACTION === */}
      {subTab === "TOOL" && (
        <div className="space-y-4">
          <Section
            icon={<Wrench className="h-3.5 w-3.5 text-sky-500" />}
            title={t("tool.endEffector")}
          >
            <div className="space-y-2">
              {getActiveRobotProfile().allowedTools.map((tool) => {
                const d = TOOL_DEFS[tool];
                const active = tool === toolType;
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => setToolType(tool)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-2xs transition ${
                      active
                        ? "border-sky-500/80 bg-sky-50/80 ring-1 ring-sky-500/20 dark:border-sky-500/70 dark:bg-sky-950/35"
                        : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/75 dark:hover:border-slate-700"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${
                        active
                          ? "bg-sky-600 text-white shadow-xs"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                      aria-hidden
                    >
                      {TOOL_ICONS[tool]}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {toolText(tool, "label")}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                          TCP {d.tcpOffsetMm}mm
                        </span>
                        {d.maxObjectSizeMm > 0 && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                            {t("tool.maxSize", { mm: d.maxObjectSizeMm })}
                          </span>
                        )}
                        {tool !== "NONE" && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                            {d.grabCode} / {d.releaseCode}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="rounded-xl border border-slate-200/70 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              {toolText(toolType, "description")}
            </p>
          </Section>

          {toolType !== "NONE" && (
            <Section
              icon={<Hand className="h-3.5 w-3.5 text-sky-500" />}
              title={t("tool.action")}
            >
              <div className={CARD}>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`${BTN} py-2.5 ${
                      gripperState === "CLOSE"
                        ? "border-amber-400/90 bg-amber-50 font-semibold text-amber-800 ring-1 ring-amber-400/30 dark:border-amber-500/60 dark:bg-amber-950/45 dark:text-amber-300"
                        : ""
                    }`}
                    onClick={() => setGripper("CLOSE")}
                    title={toolCodeFor(toolType, "CLOSE")}
                  >
                    <span>{toolText(toolType, "grabLabel")}</span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] opacity-75 dark:bg-white/10">
                      {toolCodeFor(toolType, "CLOSE")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`${BTN} py-2.5 ${
                      gripperState === "OPEN"
                        ? "border-emerald-400/90 bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-400/30 dark:border-emerald-500/60 dark:bg-emerald-950/45 dark:text-emerald-300"
                        : ""
                    }`}
                    onClick={() => setGripper("OPEN")}
                    title={toolCodeFor(toolType, "OPEN")}
                  >
                    <span>{toolText(toolType, "releaseLabel")}</span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] opacity-75 dark:bg-white/10">
                      {toolCodeFor(toolType, "OPEN")}
                    </span>
                  </button>
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/70 dark:text-slate-400">
                  {held ? (
                    <span className="inline-flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                      <span
                        className="h-2.5 w-2.5 rounded-xs"
                        style={{ background: held.color }}
                      />
                      {t("tool.holding", { id: held.id })}
                    </span>
                  ) : (
                    lastGraspMessage || t("tool.idle")
                  )}
                </div>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* === SUB-TAB 2: WORKCELL, CONVEYOR & SENSOR === */}
      {subTab === "WORKCELL" && (
        <div className="space-y-4">
          {/* Scene Presets — separated cleanly from box spawning */}
          <Section
            icon={<Sparkles className="h-3.5 w-3.5 text-sky-500" />}
            title={t("tool.scenePresets")}
          >
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(WORKCELL_PRESETS) as WorkcellPresetId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => wc().loadPreset(id)}
                  title={workcellPresetText(id, "description")}
                  className={`${BTN} ${
                    preset === id
                      ? "border-sky-500/80 bg-sky-50/80 font-semibold text-sky-700 ring-1 ring-sky-500/20 dark:border-sky-500/60 dark:bg-sky-950/40 dark:text-sky-300"
                      : ""
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{workcellPresetText(id, "label")}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Boxes in Scene */}
          <Section
            icon={<Box className="h-3.5 w-3.5 text-sky-500" />}
            title={t("tool.boxes", { n: boxes.length })}
            right={
              boxes.length > 0 && (
                <button
                  type="button"
                  onClick={() => wc().clearBoxes()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("tool.clearAll")}
                </button>
              )
            }
          >
            <div className={CARD}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300"
                  onClick={() => wc().addBox("CONVEYOR")}
                >
                  <Plus className="h-3.5 w-3.5 text-sky-500" />
                  {t("tool.onConveyor")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300"
                  onClick={() => wc().addBox("TRAY")}
                >
                  <Plus className="h-3.5 w-3.5 text-sky-500" />
                  {t("tool.onTray")}
                </button>
              </div>

              {boxes.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {boxes.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200/70 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-xs shadow-2xs"
                        style={{ background: b.color }}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {b.id}
                      </span>
                      <span
                        className="flex-1 truncate text-right font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
                        title={
                          b.held
                            ? t("tool.heldByTool")
                            : t("tool.boxCenterTitle", {
                                x: b.x.toFixed(1),
                                y: b.y.toFixed(1),
                                z: b.z.toFixed(1),
                                top: (b.z + b.size / 2).toFixed(1),
                              })
                        }
                      >
                        {b.held
                          ? t("tool.heldByTool")
                          : t("tool.boxSummary", {
                              x: b.x.toFixed(0),
                              y: b.y.toFixed(0),
                              top: (b.z + b.size / 2).toFixed(0),
                            })}
                      </span>
                      <button
                        type="button"
                        onClick={() => wc().removeBox(b.id)}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50"
                        aria-label={t("tool.remove", { name: b.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 py-3 text-center text-xs text-slate-400 dark:border-slate-800">
                  {t("tool.noBoxes")}
                </div>
              )}
            </div>
          </Section>

          {/* Conveyor Belt */}
          <Section
            icon={<Play className="h-3.5 w-3.5 text-sky-500" />}
            title={t("tool.conveyor")}
            right={
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  moving
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {moving ? t("common.running") : t("tool.stopped")}
              </span>
            }
          >
            <div className={`${CARD} space-y-3`}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {t("tool.position")}{" "}
                  <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                    D={runtime.positionMm.toFixed(0)} mm
                  </strong>
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {speedPercent > 0 ? `+${speedPercent}%` : `${speedPercent}%`}
                </span>
              </div>

              <div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={5}
                  value={speedPercent}
                  onChange={(e) => wc().setConveyorSpeedPercent(Number(e.target.value))}
                  className="sim-slider w-full"
                  aria-label={t("tool.conveyorSpeed")}
                />
                <div className="mt-0.5 flex justify-between font-mono text-[10px] text-slate-400">
                  <span>−100%</span>
                  <span>0%</span>
                  <span>+100%</span>
                </div>
              </div>

              {/* Continuous Run Controls */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => wc().setConveyorSpeedPercent(-60)}
                  title={t("tool.revTitle")}
                >
                  <Play className="h-3.5 w-3.5 rotate-180" />
                  {t("tool.rev")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-400"
                  onClick={() => wc().stopConveyor()}
                  disabled={!moving}
                  title={t("tool.stopTitle")}
                >
                  <Pause className="h-3.5 w-3.5" />
                  {t("path.stop")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700/80 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => wc().setConveyorSpeedPercent(60)}
                  title={t("tool.fwdTitle")}
                >
                  {t("tool.fwd")}
                  <Play className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Step Jog Controls */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => wc().moveConveyor(-50, false)}
                  title={t("tool.jogBackTitle")}
                >
                  <SkipBack className="h-3.5 w-3.5" />
                  {t("tool.jogBack")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => wc().moveConveyor(50, false)}
                  title={t("tool.jogFwdTitle")}
                >
                  {t("tool.jogFwd")}
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </Section>

          {/* Light Sensor & Auto Feed */}
          <Section
            icon={<ScanLine className="h-3.5 w-3.5 text-sky-500" />}
            title={t("tool.sensorSection")}
          >
            <div className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {t("tool.enableSensor")}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {t("tool.enableSensorHint")}
                  </div>
                </div>
                <ToggleSwitch
                  aria-label={t("tool.enableSensor")}
                  checked={sensor.enabled}
                  onChange={(checked) => wc().setSensorEnabled(checked)}
                />
              </div>

              {!sensor.enabled ? (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                  {t("tool.sensorDisabled")}
                </p>
              ) : (
                <div className="mt-3.5 space-y-3 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          sensorBlocked
                            ? "bg-rose-500 shadow-[0_0_8px] shadow-rose-500"
                            : "bg-emerald-500"
                        }`}
                      />
                      {sensorBlocked ? t("tool.boxDetected") : t("tool.beamClear")}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      SENSOR={sensorBlocked ? 1 : 0} · #{sensorCount}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <NumField
                      label={t("tool.beamOffset")}
                      value={sensor.offsetMm}
                      step={5}
                      onChange={(v) => wc().setSensorOffset(v)}
                    />
                    <NumField
                      label={t("tool.autoSpeed")}
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
                    className={`w-full py-2.5 ${BTN} ${
                      autoFeed.enabled
                        ? "border-sky-500/80 bg-sky-600 font-semibold text-white hover:bg-sky-500 hover:text-white dark:bg-sky-600 dark:text-white dark:hover:bg-sky-500"
                        : ""
                    }`}
                  >
                    {autoFeed.enabled ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {autoFeed.enabled ? t("tool.autoFeedStop") : t("tool.autoFeedStart")}
                  </button>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      {/* === SUB-TAB 3: WORKCELL LAYOUT GEOMETRY === */}
      {subTab === "LAYOUT" && (
        <div className="space-y-4">
          {/* Conveyor Geometry Card */}
          <div className={`${CARD} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t("tool.conveyorGeometry")}
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950">
                {(["x", "y"] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => wc().updateConveyorLayout({ axis: ax })}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      conveyor.axis === ax
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("tool.axis", { axis: ax.toUpperCase() })}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NumField
                label={t("tool.centerX")}
                value={conveyor.x}
                onChange={(v) => wc().updateConveyorLayout({ x: v })}
              />
              <NumField
                label={t("tool.centerY")}
                value={conveyor.y}
                onChange={(v) => wc().updateConveyorLayout({ y: v })}
              />
              <NumField
                label={t("tool.heightZ")}
                value={conveyor.topZ}
                step={5}
                onChange={(v) => wc().updateConveyorLayout({ topZ: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumField
                label={t("tool.length")}
                value={conveyor.lengthMm}
                onChange={(v) => wc().updateConveyorLayout({ lengthMm: v })}
              />
              <NumField
                label={t("tool.width")}
                value={conveyor.widthMm}
                step={5}
                onChange={(v) => wc().updateConveyorLayout({ widthMm: v })}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 font-mono text-[11px] tabular-nums text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span>
                {t("tool.pickPoint", { x: pick.x.toFixed(0), y: pick.y.toFixed(0), z: (pick.z + 12.5).toFixed(0) })}
              </span>
              <ReachBadge status={reachStatus(pick.x, pick.y)} />
            </div>
          </div>

          {/* Platform / Tray Cards */}
          {platforms.map((p) => (
            <div key={p.id} className={`${CARD} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <span
                    className="h-3 w-3 rounded-xs shadow-2xs"
                    style={{ background: p.color }}
                  />
                  {platformDisplayLabel(p.label)}
                </span>
                <div className="flex items-center gap-2">
                  <ReachBadge status={reachStatus(p.x, p.y)} />
                  <button
                    type="button"
                    onClick={() => wc().removePlatform(p.id)}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/50"
                    aria-label={t("tool.remove", { name: platformDisplayLabel(p.label) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <NumField
                  label={t("tool.centerX")}
                  value={p.x}
                  onChange={(v) => wc().updatePlatform(p.id, { x: v })}
                />
                <NumField
                  label={t("tool.centerY")}
                  value={p.y}
                  onChange={(v) => wc().updatePlatform(p.id, { y: v })}
                />
                <NumField
                  label={t("tool.heightZ")}
                  value={p.topZ}
                  step={5}
                  onChange={(v) => wc().updatePlatform(p.id, { topZ: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label={t("tool.sizeX")}
                  value={p.sizeX}
                  onChange={(v) => wc().updatePlatform(p.id, { sizeX: v })}
                />
                <NumField
                  label={t("tool.sizeY")}
                  value={p.sizeY}
                  onChange={(v) => wc().updatePlatform(p.id, { sizeY: v })}
                />
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={BTN}
              onClick={() => wc().addPlatform()}
            >
              <Plus className="h-3.5 w-3.5 text-sky-500" /> {t("tool.addTray")}
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => wc().resetLayout()}
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t("tool.resetLayout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
