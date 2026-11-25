"use client";

import { useState } from "react";
import { ArrowRight, Bot, Cable, Check, Move3d, Ruler, Usb, X } from "lucide-react";
import { APP_NAME } from "@/lib/appConfig";
import { ROBOT_MODEL_IDS, ROBOT_PROFILES, type RobotModelId, type RobotProfile } from "@/lib/robots";
import { useRobotModelStore } from "@/stores/useRobotModelStore";
import { useEscapeKey } from "./ui";

const INTERFACE_LABEL: Record<RobotProfile["hardwareDriver"], { label: string; icon: typeof Cable }> = {
  WLKATA_RS485: { label: "RS-485 / ESP32 Wi-Fi", icon: Cable },
  HIWONDER_BUS_SERVO: { label: "USB (WebHID)", icon: Usb },
};

/** Schematic side view of each arm, drawn with currentColor so it follows the theme. */
function RobotSilhouette({ model }: { model: RobotModelId }) {
  if (model === "xarm2") {
    return (
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
        <rect x="34" y="104" width="52" height="8" rx="2" className="fill-current opacity-30" />
        <rect x="50" y="78" width="20" height="26" rx="3" className="fill-current opacity-45" />
        <g className="stroke-current" strokeLinecap="round" fill="none">
          <path d="M60 76 L66 46 L88 30" strokeWidth="7" className="opacity-70" />
          <path d="M88 30 L100 40" strokeWidth="6" className="opacity-55" />
          <path d="M100 40 L106 52 M100 40 L111 46" strokeWidth="2.5" className="opacity-80" />
        </g>
        {[
          [60, 76],
          [66, 46],
          [88, 30],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" className="fill-sky-500" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
      <rect x="30" y="104" width="60" height="8" rx="2" className="fill-current opacity-30" />
      <rect x="44" y="72" width="32" height="32" rx="5" className="fill-current opacity-45" />
      <g className="stroke-current" strokeLinecap="round" fill="none">
        <path d="M62 70 L62 38" strokeWidth="10" className="opacity-70" />
        <path d="M62 38 L98 34" strokeWidth="8" className="opacity-60" />
        <path d="M98 34 L98 52" strokeWidth="5" className="opacity-80" />
      </g>
      {[
        [62, 70],
        [62, 38],
        [98, 34],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5.5" className="fill-orange-500" />
      ))}
    </svg>
  );
}

function Spec({ icon: Icon, children }: { icon: typeof Cable; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>{children}</span>
    </li>
  );
}

export function RobotSelectScreen() {
  const loadedModel = useRobotModelStore((s) => s.loadedModel);
  const suggestedModel = useRobotModelStore((s) => s.suggestedModel);
  const rememberSaved = useRobotModelStore((s) => s.remember);
  const chooseModel = useRobotModelStore((s) => s.chooseModel);
  const closeSelector = useRobotModelStore((s) => s.closeSelector);

  const [picked, setPicked] = useState<RobotModelId>(suggestedModel);
  const [remember, setRemember] = useState(rememberSaved);
  const [busy, setBusy] = useState(false);

  const isSwitch = loadedModel !== null;
  const willReload = isSwitch && picked !== loadedModel;
  useEscapeKey(isSwitch && !busy, closeSelector);

  const confirm = () => {
    setBusy(willReload);
    chooseModel(picked, remember);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 ${
        isSwitch ? "bg-slate-950/50 backdrop-blur-xs" : "bg-slate-100 dark:bg-slate-950"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="robot-select-title"
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xl sm:p-7 dark:border-slate-800 dark:bg-slate-900">
        {isSwitch && (
          <button
            type="button"
            onClick={closeSelector}
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-xs">
            <Bot className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {APP_NAME}
            </p>
            <h1 id="robot-select-title" className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {isSwitch ? "Switch robot arm" : "Choose a robot arm"}
            </h1>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Robot arm">
          {ROBOT_MODEL_IDS.map((id) => {
            const p = ROBOT_PROFILES[id];
            const selected = picked === id;
            const iface = INTERFACE_LABEL[p.hardwareDriver];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPicked(id)}
                onDoubleClick={() => {
                  setPicked(id);
                  setBusy(isSwitch && id !== loadedModel);
                  chooseModel(id, remember);
                }}
                className={`group relative flex gap-4 rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-sky-500 bg-sky-50/70 ring-2 ring-sky-500/25 dark:border-sky-500/70 dark:bg-sky-950/30"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="h-24 w-24 shrink-0 text-slate-700 dark:text-slate-300">
                  <RobotSilhouette model={id} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.summary}</p>
                    </div>
                    <span
                      className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    <Spec icon={Move3d}>
                      {p.activeJointCount} axes{p.activeJointCount < 6 ? " + gripper" : ""}
                    </Spec>
                    <Spec icon={Ruler}>~{Math.round(p.reachMm)} mm reach</Spec>
                    <Spec icon={iface.icon}>{iface.label}</Spec>
                  </ul>
                  {loadedModel === id && (
                    <span className="mt-3 inline-block rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Current
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 select-none dark:text-slate-300">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-sky-600"
            />
            Open this robot directly next time
          </label>
          <div className="flex items-center gap-2">
            {isSwitch && (
              <button
                type="button"
                onClick={closeSelector}
                disabled={busy}
                className="inline-flex h-9 items-center rounded-lg px-3.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-500 disabled:opacity-60"
            >
              {busy ? "Switching…" : willReload ? "Switch robot" : `Open ${ROBOT_PROFILES[picked].name}`}
              {!busy && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {willReload && (
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            The simulator reloads for the new robot. Each robot keeps its own session and work history,
            so your {ROBOT_PROFILES[loadedModel!].name} program is saved and comes back when you switch back.
          </p>
        )}
      </div>
    </div>
  );
}
