"use client";

import { useState } from "react";
import {
  Cable,
  Check,
  Copy,
  Cpu,
  Download,
  Plug,
  PlugZap,
  Send,
  Wifi,
  X,
} from "lucide-react";
import { ESP32_RS485_ARDUINO_SKETCH } from "@/lib/hardware/protocol";
import {
  useHardwareStore,
  type HardwareMotionMode,
} from "@/stores/useHardwareStore";
import { triggerTextDownload } from "./Toolbar";

interface HardwareModalProps {
  open: boolean;
  onClose: () => void;
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

export function HardwareModal({ open, onClose }: HardwareModalProps) {
  const [tab, setTab] = useState<"serial" | "wifi" | "esp32">("serial");
  const [testInput, setTestInput] = useState("@01 M21 G90 X-35 Y22 Z-28 A0 B-15 C0 F3000");
  const [copied, setCopied] = useState(false);

  const connected = useHardwareStore((s) => s.connected);
  const transport = useHardwareStore((s) => s.transport);
  const baudRate = useHardwareStore((s) => s.baudRate);
  const wsUrl = useHardwareStore((s) => s.wsUrl);
  const addressFilter = useHardwareStore((s) => s.addressFilter);
  const motionMode = useHardwareStore((s) => s.motionMode);
  const autoReply = useHardwareStore((s) => s.autoReply);
  const rxCount = useHardwareStore((s) => s.rxCount);
  const txCount = useHardwareStore((s) => s.txCount);
  const hmiCount = useHardwareStore((s) => s.hmiCount);
  const idxTelemetry = useHardwareStore((s) => s.idxTelemetry);
  const controllerState = useHardwareStore((s) => s.controllerState);
  const lastRx = useHardwareStore((s) => s.lastRx);
  const lastError = useHardwareStore((s) => s.lastError);

  const setBaudRate = useHardwareStore((s) => s.setBaudRate);
  const setWsUrl = useHardwareStore((s) => s.setWsUrl);
  const setAddressFilter = useHardwareStore((s) => s.setAddressFilter);
  const setMotionMode = useHardwareStore((s) => s.setMotionMode);
  const setAutoReply = useHardwareStore((s) => s.setAutoReply);
  const connectSerial = useHardwareStore((s) => s.connectSerial);
  const connectWebSocket = useHardwareStore((s) => s.connectWebSocket);
  const disconnect = useHardwareStore((s) => s.disconnect);
  const sendRawLine = useHardwareStore((s) => s.sendRawLine);
  const handleIncomingLine = useHardwareStore((s) => s.handleIncomingLine);

  const hasWebSerial = typeof navigator !== "undefined" && "serial" in navigator;

  if (!open) return null;

  const copySketch = async () => {
    await navigator.clipboard.writeText(ESP32_RS485_ARDUINO_SKETCH);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                connected
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-sky-500/15 text-sky-500"
              }`}
            >
              <Cable className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Virtual Mirobot — ESP32 / RS485 Link
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Receive real commands from ESP32 via USB-RS485 or Wi-Fi to drive the 3D robot arm
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/50">
          <button
            type="button"
            onClick={() => setTab("serial")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "serial"
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <Cable className="h-3.5 w-3.5" />
            USB-RS485 Serial
          </button>
          <button
            type="button"
            onClick={() => setTab("wifi")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "wifi"
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <Wifi className="h-3.5 w-3.5" />
            ESP32 Wi-Fi (WS)
          </button>
          <button
            type="button"
            onClick={() => setTab("esp32")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === "esp32"
                ? "bg-white text-sky-600 shadow-xs dark:bg-slate-800 dark:text-sky-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            ESP32 Wiring & Code
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {/* Live Status Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"
                }`}
              />
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {connected ? `Connected (${transport})` : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {controllerState}
              </span>
              <span>
                RX: <strong className="text-emerald-500">{rxCount}</strong>
              </span>
              <span>
                TX: <strong className="text-sky-500">{txCount}</strong>
              </span>
              {hmiCount > 0 && (
                <span>
                  HMI @99: <strong className="text-purple-400">{hmiCount}</strong>
                </span>
              )}
            </div>
          </div>

          {lastError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-600 dark:text-rose-400">
              {lastError}
            </div>
          )}

          {/* TAB 1: USB-RS485 Serial */}
          {tab === "serial" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Baud Rate</span>
                  <select
                    disabled={connected}
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b} {b === 115200 ? "(ESP32)" : b === 38400 ? "(WLKATA)" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    RS485 Address Filter
                  </span>
                  <select
                    value={addressFilter}
                    onChange={(e) => setAddressFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="ANY">Any (accept all)</option>
                    {Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0")).map(
                      (addr) => (
                        <option key={addr} value={addr}>
                          @{addr} only
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Motion Style
                  </span>
                  <select
                    value={motionMode}
                    onChange={(e) => setMotionMode(e.target.value as HardwareMotionMode)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="SMOOTH">Smooth (G-code / Step)</option>
                    <option value="INSTANT">Instant (Live Joystick)</option>
                  </select>
                </label>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={autoReply}
                  onChange={(e) => setAutoReply(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-sky-500"
                />
                <span>
                  Auto-reply <code>ok</code> &amp; WLKATA <code>&lt;Idle,...&gt;</code> status back
                  over RS485 (behaves like real Mirobot)
                </span>
              </label>

              <div className="flex items-center gap-2">
                {!connected ? (
                  <button
                    type="button"
                    disabled={!hasWebSerial}
                    onClick={() => void connectSerial().catch(() => {})}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
                  >
                    <Plug className="h-3.5 w-3.5" />
                    Connect USB-RS485 Port
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    <PlugZap className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                )}

                {!hasWebSerial && (
                  <span className="text-[11px] text-amber-500">
                    Open in Chrome / Edge to access USB-RS485 Web Serial.
                  </span>
                )}
              </div>

              {/* Live IDX-485 Sorting Station Telemetry + Virtual HMI-485 (@99) Controls */}
              <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                    IDX-485 Sorting Station Monitor &amp; Virtual HMI (@99)
                  </span>
                  {idxTelemetry ? (
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                        idxTelemetry.stateId === 16
                          ? "bg-rose-500/20 text-rose-500"
                          : idxTelemetry.stateId === 3
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {idxTelemetry.stateName}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-slate-400">
                      Waiting for @99o200=... from IDX-485
                    </span>
                  )}
                </div>

                {idxTelemetry && (
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] sm:grid-cols-4">
                    <div className="rounded bg-white/80 px-2 py-1 dark:bg-slate-950/60">
                      Light A0: <strong>{idxTelemetry.lightAdc}</strong>
                    </div>
                    <div
                      className={`rounded px-2 py-1 ${
                        idxTelemetry.currentAdc > 3300
                          ? "bg-rose-500/20 text-rose-500"
                          : "bg-white/80 dark:bg-slate-950/60"
                      }`}
                    >
                      Curr A5: <strong>{idxTelemetry.currentAdc}</strong>
                    </div>
                    <div className="rounded bg-white/80 px-2 py-1 dark:bg-slate-950/60">
                      OK/NG: <strong>{idxTelemetry.okCount}</strong>/
                      <strong>{idxTelemetry.ngCount}</strong>
                    </div>
                    <div className="rounded bg-white/80 px-2 py-1 dark:bg-slate-950/60">
                      OUT: {idxTelemetry.out8 ? "8" : "-"} {idxTelemetry.out9 ? "9" : "-"}{" "}
                      {idxTelemetry.out10 ? "10" : "-"}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => void sendRawLine("@99i201=1")}
                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    HMI START
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => void sendRawLine("@99i202=1")}
                    className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                  >
                    HMI STOP
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => void sendRawLine("@99i203=1")}
                    className="rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
                  >
                    HMI RESET
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => void sendRawLine("@99i204=1")}
                    className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
                  >
                    PAUSE / RESUME
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => void sendRawLine("@99i200=1")}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    AUTO
                  </button>
                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => void sendRawLine("@99i200=0")}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    MANUAL
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Wi-Fi WebSocket */}
          {tab === "wifi" && (
            <div className="space-y-3">
              <p className="text-slate-500 dark:text-slate-400">
                Connect wirelessly to an ESP32 running a WebSocket server (same G-code / JSON / CSV
                protocol).
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={connected}
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="ws://192.168.1.50:81"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                />
                {!connected ? (
                  <button
                    type="button"
                    onClick={() => connectWebSocket(wsUrl)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                  >
                    <Wifi className="h-3.5 w-3.5" />
                    Connect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ESP32 Wiring & Arduino Sketch */}
          {tab === "esp32" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
                <div className="font-semibold text-sky-700 dark:text-sky-300">
                  OVEC / IDX-485 (ESP32-C5) + HMI-485 + USB-RS485 Shared Bus Wiring
                </div>
                <div className="mt-1.5 grid grid-cols-1 gap-1 font-mono text-[11px] text-slate-700 sm:grid-cols-2 dark:text-slate-300">
                  <div>IDX-485 RS-485: GPIO4 (RX2) / GPIO5 (TX2) @ 115200</div>
                  <div>IDX-485 +A ↔ USB-RS485 A · -B ↔ B · S.GND ↔ GND</div>
                  <div>HMI-485 (@99): Parallel on same A/B bus (sniffed safely)</div>
                  <div>Supports both Raw @01 G-Code &amp; &lt;Mirobot.h&gt; library!</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  mirobot_rs485_controller.ino
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copySketch()}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerTextDownload(
                        "mirobot_rs485_controller.ino",
                        ESP32_RS485_ARDUINO_SKETCH,
                        "text/plain"
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                  >
                    <Download className="h-3 w-3" />
                    Download .ino
                  </button>
                </div>
              </div>

              <pre className="selectable max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-300 dark:border-slate-800">
                {ESP32_RS485_ARDUINO_SKETCH}
              </pre>
            </div>
          )}

          {/* Shared Live RX Preview + Virtual Test Injector (on Serial/WiFi tabs) */}
          {tab !== "esp32" && (
            <div className="space-y-2.5 border-t border-slate-200 pt-3.5 dark:border-slate-800">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                Test Virtual RS485 Receiver (works even without hardware plugged in)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleIncomingLine(testInput);
                  }}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => handleIncomingLine(testInput)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Send className="h-3 w-3" />
                  Inject RX
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "IDX $H Home", cmd: "@01$H" },
                  { label: "IDX MoveJ", cmd: "@01M21 G90 G00 X35 Y22 Z-15 A0 B-10 C0 F2000" },
                  { label: "Pump ON (M3)", cmd: "@01M3 S1000" },
                  { label: "Pump OFF", cmd: "@01M3 S0" },
                  { label: "Gripper M4", cmd: "@01M4 E65" },
                  { label: "Pause (!)", cmd: "@01!" },
                  { label: "Resume (~)", cmd: "@01~" },
                  { label: "Query ?", cmd: "@01?" },
                  { label: "Lib O103", cmd: "@01O103" },
                  { label: "HMI @99", cmd: "@99o200=72,1,1" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTestInput(preset.cmd);
                      handleIncomingLine(preset.cmd);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {lastRx && (
                <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  Last RX: <span className="text-emerald-500">{lastRx}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
