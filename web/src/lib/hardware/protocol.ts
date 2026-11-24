import {
  DEFAULT_WORKSPACE,
  HOME_JOINTS,
  JOINT_LIMITS,
  type Pose6D,
} from "@/lib/kinematics/constants";
import { checkWorkspaceXYZ, fkPose6DFromJointsDeg } from "@/lib/kinematics/fk";
import type { GripperState } from "@/lib/program/types";
import { DEFAULT_TOOL, interpretToolCommand, type ToolType } from "@/lib/tools/toolDefs";

export type VirtualControllerState = "Idle" | "Run" | "Home" | "Hold" | "Alarm";

export type HardwareCommand =
  | { kind: "MOVE_JOINT"; joints: number[]; feedDegPerMin?: number; gripper?: GripperState; raw: string }
  | { kind: "MOVE_CARTESIAN"; pose: Pose6D; feedMmPerMin?: number; gripper?: GripperState; raw: string }
  | { kind: "GRIPPER"; state: GripperState; pwm: number; label: string; raw: string }
  | { kind: "WAIT"; durationMs: number; raw: string }
  | { kind: "CONVEYOR_MOVE"; distanceMm: number; absolute: boolean; feed?: number; raw: string }
  | { kind: "CONVEYOR_SPEED"; percent: number; raw: string }
  | { kind: "HOME"; axis?: number; raw: string }
  | { kind: "PAUSE"; raw: string }
  | { kind: "RESUME"; raw: string }
  | { kind: "RESET"; raw: string }
  | { kind: "SET_SPEED"; feed: number; raw: string }
  | { kind: "RUN_FILE"; fileName: string; raw: string }
  | { kind: "STATUS_QUERY"; format: "GRBL" | "O103"; raw: string }
  | { kind: "ACK_ONLY"; note: string; raw: string }
  | { kind: "HMI_BUS"; raw: string }
  | { kind: "IGNORED"; reason: string; raw: string }
  | { kind: "ERROR"; message: string; raw: string };

const NUMBER_PATTERN = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][-+]?\\d+)?";
const WORD_PATTERN = new RegExp(`([A-Z])\\s*=?\\s*(${NUMBER_PATTERN})`, "gi");

function validateJoints(values: number[]): string | null {
  if (values.length !== 6 || values.some((v) => !Number.isFinite(v))) {
    return "Expected 6 numeric joint values (J1..J6)";
  }
  for (let i = 0; i < 6; i++) {
    const lim = JOINT_LIMITS[i];
    if (values[i] < lim.min - 1e-3 || values[i] > lim.max + 1e-3) {
      return `J${i + 1}=${values[i].toFixed(1)}° out of limits [${lim.min}°, ${lim.max}°]`;
    }
  }
  return null;
}

/**
 * Formats a WLKATA Mirobot compatible real-time status response string for `?` queries over RS-485.
 * Matches both real WLKATA firmware and 0vec-skill's mirobot-rs485-emulator.py.
 */
export function formatWlkataStatusReport(params: {
  state: VirtualControllerState;
  joints: readonly number[];
  eePose: Pose6D;
  pumpPwm: number;
  valvePwm?: number;
  motionMode?: "Angle" | "Cartesian";
}): string {
  const j = params.joints.map((v) => v.toFixed(2));
  const p = params.eePose;
  const valve = params.valvePwm ?? 0;
  const modeNum = params.motionMode === "Cartesian" ? 0 : 1;
  return `<${params.state},Angle(ABCDXYZ):${j[3]},${j[4]},${j[5]},0.00,${j[0]},${j[1]},${j[2]},Cartesian coordinate(XYZ RxRyRz):${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${p.rx.toFixed(2)},${p.ry.toFixed(2)},${p.rz.toFixed(2)},Pump PWM:${params.pumpPwm},Valve PWM:${valve},Motion_MODE:${modeNum}>`;
}

/**
 * Formats the reply for RS485_Mirobot::getStatus() (`@01O103`).
 * Matches Mirobot.cpp lines 314 & 350-365 (`State:Idle`, `State:Homing`, `State:Run`, `State:Busy`).
 */
export function formatO103StatusReply(state: VirtualControllerState): string {
  if (state === "Home") return "State:Homing";
  if (state === "Hold") return "State:Busy";
  return `State:${state}`;
}

/**
 * Parses a single incoming RS-485 / Serial / WebSocket line from IDX-485, ESP32, or HMI-485.
 * 100% compatible with:
 * - Official OVEC / 0vec-skill IDX-485 (`mirobot-rs485-control.ino`, `RS485_Mirobot` library)
 * - Shared bus coexistence with HMI-485 (`@99...` sniffed silently without replying)
 * - WLKATA RS-485 G-code with or without space after `@01` (`@01$H`, `@01?`, `@01O103`, `@01!`, `@01~`, `@01%`, `@01M21...`, `@01M20...`, `@01M3...`, `@01M4...`, `@01G04 P...`, `@010111=...`)
 * - Easy JSON & CSV telemetry frames
 */
export function parseIncomingHardwareLine(
  rawLine: string,
  options: {
    currentJoints: readonly number[];
    defaultMotionMode?: "Angle" | "Cartesian";
    defaultFeed?: number;
    addressFilter?: string; // "01" (default for IDX-485) or "ANY"
    toolType?: ToolType; // mounted end-effector decides what M3/M4/M5 mean
  }
): HardwareCommand {
  const raw = String(rawLine ?? "").trim();
  if (!raw) return { kind: "IGNORED", reason: "Empty line", raw };

  // 0. HMI-485 traffic (@99...) on shared RS-485 bus: monitor only, NEVER reply!
  if (raw.startsWith("@99")) {
    return { kind: "HMI_BUS", raw };
  }

  let line = raw;
  const filter = (options.addressFilter ?? "01").trim().toUpperCase();

  // Check optional RS-485 address prefix `@01` (with OR without space after @01!)
  const addrMatch = line.match(/^@(\d{1,2})\s*(.*)$/);
  if (addrMatch) {
    const addr = addrMatch[1].padStart(2, "0");
    if (filter && filter !== "ANY" && addr !== filter.padStart(2, "0")) {
      return { kind: "IGNORED", reason: `Addressed to @${addr} (filter @${filter})`, raw };
    }
    line = addrMatch[2].trim();
    if (!line) return { kind: "IGNORED", reason: "Empty RS-485 payload", raw };
  }

  // Real-time single-char / short control commands (from Mirobot.cpp & mirobot-rs485-control.ino)
  if (line === "?" || line.endsWith("?")) {
    return { kind: "STATUS_QUERY", format: "GRBL", raw };
  }
  if (/^O103$/i.test(line)) {
    return { kind: "STATUS_QUERY", format: "O103", raw };
  }
  if (line === "!") return { kind: "PAUSE", raw };
  if (line === "~") return { kind: "RESUME", raw };
  if (line === "%") return { kind: "RESET", raw };

  // Homing: $H, $H1..$H7
  const homeMatch = line.match(/^\$H(\d)?\b/i);
  if (homeMatch) {
    return {
      kind: "HOME",
      axis: homeMatch[1] ? Number(homeMatch[1]) : undefined,
      raw,
    };
  }

  // Controller config commands ($49=height, $45=0/1, etc. from Mirobot.cpp)
  if (/^\$\d+=/.test(line)) {
    return { kind: "ACK_ONLY", note: `Config ${line}`, raw };
  }

  // Run saved G-code file: 0111=vec2501, o111=data25, or o111vec2501 (Mirobot.cpp line 403)
  const runFileMatch = line.match(/^(?:0111|o111)=?(.+)$/i);
  if (runFileMatch) {
    const fileName = runFileMatch[1].trim();
    return { kind: "RUN_FILE", fileName, raw };
  }

  // Standalone feed speed command: F2000 (from Mirobot.cpp setMoveSpeed & homing)
  const speedOnlyMatch = line.match(/^F\s*(\d+(?:\.\d+)?)$/i);
  if (speedOnlyMatch) {
    return { kind: "SET_SPEED", feed: Number(speedOnlyMatch[1]), raw };
  }

  // 1. JSON payload
  if (line.startsWith("{")) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const gripper: GripperState | undefined =
        obj.grip === 1 || obj.grip === true || obj.grip === "close" || obj.grip === "CLOSE"
          ? "CLOSE"
          : obj.grip === 0 || obj.grip === false || obj.grip === "open" || obj.grip === "OPEN"
            ? "OPEN"
            : undefined;

      if (obj.cmd === "home" || obj.home === true) {
        return { kind: "HOME", raw };
      }

      if (Array.isArray(obj.j) || Array.isArray(obj.joints)) {
        const arr = ((obj.j ?? obj.joints) as unknown[]).map(Number);
        const err = validateJoints(arr);
        if (err) return { kind: "ERROR", message: err, raw };
        const speed = Number(obj.speed ?? obj.f);
        return {
          kind: "MOVE_JOINT",
          joints: arr,
          feedDegPerMin: Number.isFinite(speed) && speed > 0 ? speed * 60 : undefined,
          gripper,
          raw,
        };
      }

      if (Array.isArray(obj.xyz) || Array.isArray(obj.pose)) {
        const arr = ((obj.xyz ?? obj.pose) as unknown[]).map(Number);
        if (arr.length < 3 || arr.some((v) => !Number.isFinite(v))) {
          return { kind: "ERROR", message: "JSON xyz requires at least [x, y, z]", raw };
        }
        const currPose = fkPose6DFromJointsDeg(options.currentJoints);
        const pose: Pose6D = {
          x: arr[0],
          y: arr[1],
          z: arr[2],
          rx: arr[3] ?? currPose.rx,
          ry: arr[4] ?? currPose.ry,
          rz: arr[5] ?? currPose.rz,
        };
        const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, DEFAULT_WORKSPACE);
        if (!ws.ok) return { kind: "ERROR", message: ws.message, raw };
        return { kind: "MOVE_CARTESIAN", pose, gripper, raw };
      }

      if (gripper) {
        return {
          kind: "GRIPPER",
          state: gripper,
          pwm: gripper === "CLOSE" ? 1000 : 0,
          label: `Gripper ${gripper}`,
          raw,
        };
      }

      return { kind: "IGNORED", reason: "JSON contains no robot command", raw };
    } catch {
      return { kind: "ERROR", message: "Invalid JSON frame", raw };
    }
  }

  // 2. CSV format: J,10,20,-15,0,-10,0 or XYZ,200,30,210,0,0,0
  const csvUpper = line.toUpperCase();
  if (csvUpper.startsWith("J,") || csvUpper.startsWith("XYZ,")) {
    const parts = line.split(",").map((s) => s.trim());
    const nums = parts.slice(1, 7).map(Number);
    if (csvUpper.startsWith("J,")) {
      const err = validateJoints(nums);
      if (err) return { kind: "ERROR", message: err, raw };
      return { kind: "MOVE_JOINT", joints: nums, raw };
    } else {
      if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) {
        return { kind: "ERROR", message: "CSV XYZ requires at least 3 numbers", raw };
      }
      const currPose = fkPose6DFromJointsDeg(options.currentJoints);
      const pose: Pose6D = {
        x: nums[0],
        y: nums[1],
        z: nums[2],
        rx: nums[3] ?? currPose.rx,
        ry: nums[4] ?? currPose.ry,
        rz: nums[5] ?? currPose.rz,
      };
      const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, DEFAULT_WORKSPACE);
      if (!ws.ok) return { kind: "ERROR", message: ws.message, raw };
      return { kind: "MOVE_CARTESIAN", pose, raw };
    }
  }

  // 3. WLKATA G-code command
  const code = line.replace(/\([^)]*\)/g, " ").split(";", 1)[0].trim().toUpperCase();
  if (!code) return { kind: "IGNORED", reason: "Comment", raw };

  const words: Array<{ letter: string; value: number }> = [];
  WORD_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_PATTERN.exec(code))) {
    const val = Number(m[2]);
    if (Number.isFinite(val)) words.push({ letter: m[1].toUpperCase(), value: val });
  }
  if (!words.length) return { kind: "IGNORED", reason: "Non-command bus traffic", raw };

  const mCodes = words.filter((w) => w.letter === "M").map((w) => w.value);
  const gCodes = words.filter((w) => w.letter === "G").map((w) => w.value);

  if (gCodes.includes(28)) return { kind: "HOME", raw };

  // G04 / G4 Dwell
  if (gCodes.includes(4)) {
    const sec = words.find((w) => w.letter === "P")?.value ?? words.find((w) => w.letter === "S")?.value ?? 0.5;
    return { kind: "WAIT", durationMs: Math.max(0, Math.round(sec * 1000)), raw };
  }

  // M3 / M4 / M5: meaning depends on the mounted tool (WLKATA SDK pump(): M3 S1000/S500/S0,
  // gripper(): M3 S40/S60/S0; pneumatic gripper valve: M4 E65/E40)
  const tool = options.toolType ?? DEFAULT_TOOL;
  if (mCodes.includes(3) || mCodes.includes(4) || mCodes.includes(5)) {
    const codeKind = mCodes.includes(3) ? "M3" : mCodes.includes(4) ? "M4" : "M5";
    const value =
      codeKind === "M3"
        ? words.find((w) => w.letter === "S")?.value
        : codeKind === "M4"
          ? words.find((w) => w.letter === "E")?.value
          : undefined;
    const res = interpretToolCommand(tool, codeKind, value);
    return { kind: "GRIPPER", state: res.state, pwm: res.pwm, label: res.label, raw };
  }

  // MS4220 conveyor controller: G6 F<-100..100> (continuous speed, % of max)
  if (gCodes.includes(6)) {
    const f = words.find((w) => w.letter === "F")?.value ?? 0;
    return { kind: "CONVEYOR_SPEED", percent: Math.max(-100, Math.min(100, f)), raw };
  }

  const isRelative = gCodes.includes(91);
  const feed = words.find((w) => w.letter === "F")?.value ?? options.defaultFeed;
  const axes: Partial<Record<"x" | "y" | "z" | "a" | "b" | "c", number>> = {};
  words.forEach(({ letter, value }) => {
    if ("XYZABC".includes(letter)) {
      axes[letter.toLowerCase() as keyof typeof axes] = value;
    }
  });

  if (!Object.keys(axes).length) {
    // Conveyor / Rail D-axis move or modal command without XYZABC
    // Conveyor / sliding rail 7th axis (WLKATA SDK writeexpand: G90G00D100, G91G01D-20)
    const dWord = words.find((w) => w.letter === "D");
    if (dWord) {
      return {
        kind: "CONVEYOR_MOVE",
        distanceMm: dWord.value,
        absolute: !isRelative,
        feed: words.find((w) => w.letter === "F")?.value,
        raw,
      };
    }
    return { kind: "IGNORED", reason: "No axis coordinates", raw };
  }

  const useCartesian =
    mCodes.includes(20) || (!mCodes.includes(21) && options.defaultMotionMode === "Cartesian");

  if (useCartesian) {
    const currPose = fkPose6DFromJointsDeg(options.currentJoints);
    const nextPose: Pose6D = { ...currPose };
    const map: Record<keyof typeof axes, keyof Pose6D> = {
      x: "x",
      y: "y",
      z: "z",
      a: "rx",
      b: "ry",
      c: "rz",
    };
    (Object.keys(axes) as Array<keyof typeof axes>).forEach((ax) => {
      const k = map[ax];
      const v = axes[ax]!;
      nextPose[k] = isRelative ? nextPose[k] + v : v;
    });
    const ws = checkWorkspaceXYZ(nextPose.x, nextPose.y, nextPose.z, DEFAULT_WORKSPACE);
    if (!ws.ok) return { kind: "ERROR", message: ws.message, raw };
    return {
      kind: "MOVE_CARTESIAN",
      pose: nextPose,
      feedMmPerMin: feed && feed > 0 ? feed : 2000,
      raw,
    };
  }

  // M21 Joint Move
  const nextJoints = (options.currentJoints.length === 6 ? options.currentJoints : HOME_JOINTS).slice();
  const jMap: Record<keyof typeof axes, number> = { x: 0, y: 1, z: 2, a: 3, b: 4, c: 5 };
  (Object.keys(axes) as Array<keyof typeof axes>).forEach((ax) => {
    const idx = jMap[ax];
    const v = axes[ax]!;
    nextJoints[idx] = isRelative ? nextJoints[idx] + v : v;
  });

  const jErr = validateJoints(nextJoints);
  if (jErr) return { kind: "ERROR", message: jErr, raw };
  return {
    kind: "MOVE_JOINT",
    joints: nextJoints,
    feedDegPerMin: feed && feed > 0 ? feed : 2000,
    raw,
  };
}

export const ESP32_RS485_ARDUINO_SKETCH = `/*
 * IDX-485 (ESP32-C5) <-> Virtual Mi Robot Simulator via USB-RS485
 * ---------------------------------------------------------------
 * Compatible with 0vec-skill Lab 03 / Lab 05 & official <Mirobot.h> library!
 *
 * IDX-485 Onboard RS-485 Pins (Auto-Direction):
 *   GPIO 4 = RX485 (Serial2 RX)
 *   GPIO 5 = TX485 (Serial2 TX)
 *   Baud   = 115200 bps (8N1)
 *
 * Wiring:
 *   IDX-485 +A     --> USB-RS485 A (D+)   [also parallel to HMI-485 +A if used]
 *   IDX-485 -B     --> USB-RS485 B (D-)   [also parallel to HMI-485 -B if used]
 *   IDX-485 S.GND  --> USB-RS485 GND
 *
 * (If using generic ESP32 + MAX485: RX=16, TX=17, DE/RE=4)
 */

#include <Arduino.h>

#define PIN_RS485_RX  4       // IDX-485: GPIO4 (Generic ESP32: GPIO16)
#define PIN_RS485_TX  5       // IDX-485: GPIO5 (Generic ESP32: GPIO17)
#define RS485_BAUD    115200
#define ARM_ADDR      "@01"

void sendArm(const String &cmd) {
  Serial2.print(String(ARM_ADDR) + cmd + "\\r\\n");
  Serial2.flush();
  Serial.println("[TX -> Virtual Arm] " + String(ARM_ADDR) + cmd);
}

bool waitArmIdle(unsigned long timeoutMs = 15000) {
  unsigned long t0 = millis();
  delay(150);
  while (millis() - t0 < timeoutMs) {
    Serial2.print("@01?\\r\\n");
    unsigned long waitStart = millis();
    String resp = "";
    while (millis() - waitStart < 250) {
      if (Serial2.available()) {
        resp = Serial2.readStringUntil('\\n');
        resp.trim();
        if (resp.length() > 0) break;
      }
    }
    if (resp.indexOf("Idle") >= 0) return true;
    delay(150);
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(RS485_BAUD, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);
  delay(800);
  sendArm("$H");
  waitArmIdle();
}

void loop() {
  // Pick & Place sequence matching OVEC Lab 03
  sendArm("M21 G90 G00 X35 Y15 Z-10 A0 B-5 C0 F2000");
  waitArmIdle();

  sendArm("M21 G90 G00 X35 Y28 Z-15 A0 B-13 C0 F2000");
  waitArmIdle();

  sendArm("M3 S1000"); // Suction ON / Grab
  delay(400);

  sendArm("M21 G90 G00 X-35 Y15 Z-10 A0 B-5 C0 F2000");
  waitArmIdle();

  sendArm("M21 G90 G00 X-35 Y28 Z-15 A0 B-13 C0 F2000");
  waitArmIdle();

  sendArm("M3 S500");  // Air Blow Release
  delay(350);
  sendArm("M3 S0");    // Pump OFF

  sendArm("M21 G90 G00 X0 Y0 Z0 A0 B0 C0 F2000");
  waitArmIdle();
  delay(1000);
}
`;
