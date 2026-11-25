"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BatteryMedium,
  Cable,
  Download,
  Hand,
  Play,
  Plug,
  PlugZap,
  Power,
  Send,
  Square,
  Usb,
  X,
} from "lucide-react";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";
import {
  XARM_HID_PRODUCT_ID,
  XARM_HID_VENDOR_ID,
  XARM_UART_BAUD,
  type XarmSerialProtocol,
} from "@/lib/hardware/hiwonderXarm";
import { useXarmLinkStore } from "@/stores/useXarmLinkStore";
import { ToggleSwitch, useEscapeKey } from "./ui";
import { useT } from "@/lib/i18n/useT";

interface XarmHardwareModalProps {
  open: boolean;
  onClose: () => void;
}

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-400/70 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/50 dark:hover:text-sky-300";

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

const hex4 = (n: number) => `0x${n.toString(16).padStart(4, "0").toUpperCase()}`;

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="min-w-0">
        <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Real-arm link for the Hiwonder xArm: the simulator is the master and drives the servos. */
export function XarmHardwareModal({ open, onClose }: XarmHardwareModalProps) {
  const t = useT();
  const connected = useXarmLinkStore((s) => s.connected);
  const transport = useXarmLinkStore((s) => s.transport);
  const serialProtocol = useXarmLinkStore((s) => s.serialProtocol);
  const deviceLabel = useXarmLinkStore((s) => s.deviceLabel);
  const baudRate = useXarmLinkStore((s) => s.baudRate);
  const mirror = useXarmLinkStore((s) => s.mirror);
  const teach = useXarmLinkStore((s) => s.teach);
  const maxSpeed = useXarmLinkStore((s) => s.maxSpeedDegPerSec);
  const battery = useXarmLinkStore((s) => s.batteryVolts);
  const txCount = useXarmLinkStore((s) => s.txCount);
  const rxCount = useXarmLinkStore((s) => s.rxCount);
  const lastError = useXarmLinkStore((s) => s.lastError);
  const link = useXarmLinkStore.getState();
  const [showMap, setShowMap] = useState(false);
  const [actionGroupId, setActionGroupId] = useState(0);
  const [actionTimes, setActionTimes] = useState(1);
  const [rawReplCmd, setRawReplCmd] = useState("LSC.moveServo(1, 300, 500)");

  useEscapeKey(open, onClose);
  if (!open) return null;

  const profile = getActiveRobotProfile();
  const servos = profile.busServos;
  const hasHid = typeof navigator !== "undefined" && "hid" in navigator;
  const hasSerial = typeof navigator !== "undefined" && "serial" in navigator;
  const isReplMode = transport === "SERIAL" && serialProtocol === "COREX_REPL";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("xarm.ariaTitle", { name: profile.name })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="animate-ui-in flex max-h-[86vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                connected ? "bg-emerald-500/15 text-emerald-500" : "bg-sky-500/15 text-sky-500"
              }`}
            >
              <Usb className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("xarm.title", { name: profile.name })}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t("xarm.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`}
              />
              <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                {connected ? `${deviceLabel} (${transport})` : t("hw.disconnected")}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
              {battery !== null && (
                <span className="inline-flex items-center gap-1" title="Controller supply voltage">
                  <BatteryMedium className="h-3.5 w-3.5" />
                  <strong className={battery < 6.4 ? "text-amber-500" : "text-slate-700 dark:text-slate-200"}>
                    {battery.toFixed(2)} V
                  </strong>
                </span>
              )}
              <span>
                RX <strong className="text-emerald-500">{rxCount}</strong>
              </span>
              <span>
                TX <strong className="text-sky-500">{txCount}</strong>
              </span>
            </div>
          </div>

          {lastError && (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-rose-600 dark:text-rose-400">
              {lastError}
            </div>
          )}

          {!connected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Board / Protocol</span>
                  <select
                    value={serialProtocol}
                    onChange={(e) => link.setSerialProtocol(e.target.value as XarmSerialProtocol)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="COREX_REPL">xArm 2.0 CoreX (MicroPython LSC)</option>
                    <option value="LSC_BINARY">xArm 1S / LSC Binary (0x55 0x55)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">{t("hw.baud")}</span>
                  <select
                    aria-label={t("hw.baud")}
                    title={t("hw.baud")}
                    value={baudRate}
                    onChange={(e) => link.setBaudRate(Number(e.target.value))}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-700 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b === XARM_UART_BAUD
                          ? `${b} (xArm 2.0 CoreX)`
                          : b === 9600
                            ? `${b} (LSC UART)`
                            : b}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void link.connectSerial()}
                  disabled={!hasSerial}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Cable className="h-4 w-4" />
                  {t("xarm.connectSerial", { baud: baudRate })}
                </button>
                <button
                  type="button"
                  onClick={() => void link.connectHid()}
                  disabled={!hasHid}
                  className={BTN}
                >
                  <PlugZap className="h-4 w-4" />
                  {t("xarm.connectHid")}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {t("xarm.plugA")}<strong>USB (HID)</strong>{t("xarm.plugB")}{" "}
                <span className="font-mono">
                  {hex4(XARM_HID_VENDOR_ID)}:{hex4(XARM_HID_PRODUCT_ID)}
                </span>
                {t("xarm.plugC")}<strong>{t("xarm.usbSerial")}</strong>{t("xarm.plugD")}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <Row
                title={t("xarm.follow")}
                hint={t("xarm.followHint")}
              >
                <ToggleSwitch checked={mirror} onChange={(v) => link.setMirror(v)} aria-label={t("xarm.follow")} />
              </Row>

              <Row title={t("xarm.maxSpeed")} hint={t("xarm.maxSpeedHint")}>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={360}
                    step={10}
                    value={maxSpeed}
                    onChange={(e) => link.setMaxSpeed(Number(e.target.value))}
                    aria-label={t("xarm.maxSpeedAria")}
                    className="w-28 accent-sky-600"
                  />
                  <span className="w-14 text-right font-mono tabular-nums">{maxSpeed}°/s</span>
                </div>
              </Row>

              {!isReplMode && (
                <Row
                  title={t("xarm.teach")}
                  hint={t("xarm.teachHint")}
                >
                  <ToggleSwitch checked={teach} onChange={(v) => link.setTeach(v)} aria-label={t("xarm.teach")} />
                </Row>
              )}

              {isReplMode && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Action Group</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={actionGroupId}
                      onChange={(e) => setActionGroupId(Number(e.target.value))}
                      title="Action Group ID (0-255)"
                      className="h-7 w-14 rounded-md border border-slate-200 bg-white px-2 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <span className="text-[11px] text-slate-500">×</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={actionTimes}
                      onChange={(e) => setActionTimes(Number(e.target.value))}
                      title="Repeat times (0 = loop)"
                      className="h-7 w-14 rounded-md border border-slate-200 bg-white px-2 text-center font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => void link.runActionGroup(actionGroupId, actionTimes)}
                    >
                      <Play className="h-3.5 w-3.5 text-emerald-500" />
                      Run
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => void link.stopActionGroup()}
                    >
                      <Square className="h-3.5 w-3.5 text-rose-500" />
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {isReplMode && (
                <div className="space-y-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={rawReplCmd}
                      onChange={(e) => setRawReplCmd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && rawReplCmd.trim()) {
                          void link.sendRawRepl(rawReplCmd);
                        }
                      }}
                      placeholder="LSC.moveServo(1, 300, 500)"
                      className="h-7 flex-1 rounded-md border border-slate-200 bg-white px-2.5 font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => void link.sendRawRepl(rawReplCmd)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      REPL
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => {
                        void link.sendRawRepl("import Hiwonder; from Hiwonder import LSC; print('REPL_OK')");
                      }}
                    >
                      Test REPL
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => {
                        void link.sendRawRepl("LSC.moveServo(1, 400, 300)");
                      }}
                    >
                      Close Gripper (ID 1)
                    </button>
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => {
                        void link.sendRawRepl("LSC.moveServo(1, 400, 800)");
                      }}
                    >
                      Open Gripper (ID 1)
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                <button
                  type="button"
                  className={BTN}
                  disabled={isReplMode}
                  onClick={() => void link.readPositions()}
                  title={isReplMode ? "Not supported in CoreX REPL mode" : "Read every servo and move the simulator there"}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("xarm.readPositions")}
                </button>
                <button type="button" className={BTN} onClick={() => void link.sendCurrentPose()} title="Send the simulator pose once (1.5 s move)">
                  <Send className="h-3.5 w-3.5" />
                  {t("xarm.sendPose")}
                </button>
                <button type="button" className={BTN} onClick={() => void link.servoOff()} title="Stop running action / Release torque">
                  <Hand className="h-3.5 w-3.5" />
                  {t("xarm.servosOff")}
                </button>
                <button type="button" className={BTN} onClick={() => void link.disconnect()}>
                  <Power className="h-3.5 w-3.5" />
                  {t("hw.disconnect")}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("xarm.warnA")}{" "}
              <strong>{t("xarm.readPositions")}</strong>{t("xarm.warnB")}<span className="font-mono">src/lib/robots/xarm2.ts</span>.
            </span>
          </div>

          {servos && (
            <div>
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <Plug className="h-3.5 w-3.5" />
                {showMap ? t("xarm.hideMap") : t("xarm.showMap")}
              </button>
              {showMap && (
                <table className="mt-2 w-full overflow-hidden rounded-lg text-left font-mono text-[11px]">
                  <thead className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-2.5 py-1.5 font-semibold">{t("viewer.joint")}</th>
                      <th className="px-2.5 py-1.5 font-semibold">Servo ID</th>
                      <th className="px-2.5 py-1.5 font-semibold">{t("xarm.direction")}</th>
                      <th className="px-2.5 py-1.5 font-semibold">{t("xarm.offset")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {servos.joints.map((m) => (
                      <tr key={m.servoId}>
                        <td className="px-2.5 py-1.5">{profile.jointLabels[m.jointIndex]}</td>
                        <td className="px-2.5 py-1.5">#{m.servoId}</td>
                        <td className="px-2.5 py-1.5">{m.direction > 0 ? "+" : "−"}</td>
                        <td className="px-2.5 py-1.5">{m.offsetDeg}°</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="px-2.5 py-1.5">{t("xarm.gripper")}</td>
                      <td className="px-2.5 py-1.5">#{servos.gripper.servoId}</td>
                      <td className="px-2.5 py-1.5" colSpan={2}>
                        {t("xarm.gripperPos", { open: servos.gripper.openPos, close: servos.gripper.closePos })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
