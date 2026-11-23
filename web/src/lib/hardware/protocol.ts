import {
  DEFAULT_WORKSPACE,
  HOME_JOINTS,
  JOINT_LIMITS,
  type Pose6D,
} from "@/lib/kinematics/constants";
import { checkWorkspaceXYZ, fkPose6DFromJointsDeg } from "@/lib/kinematics/fk";
import type { GripperState } from "@/lib/program/types";

export type HardwareCommand =
  | { kind: "MOVE_JOINT"; joints: number[]; feedDegPerMin?: number; gripper?: GripperState; raw: string }
  | { kind: "MOVE_CARTESIAN"; pose: Pose6D; feedMmPerMin?: number; gripper?: GripperState; raw: string }
  | { kind: "GRIPPER"; state: GripperState; pwm: number; raw: string }
  | { kind: "HOME"; raw: string }
  | { kind: "STATUS_QUERY"; raw: string }
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
 * Formats a WLKATA Mirobot compatible real-time status response string for `?` queries over RS485/Serial.
 */
export function formatWlkataStatusReport(params: {
  state: "Idle" | "Run";
  joints: readonly number[];
  eePose: Pose6D;
  gripperPwm: number;
}): string {
  const j = params.joints.map((v) => v.toFixed(2));
  const p = params.eePose;
  // Real WLKATA reports Angle(ABCDXYZ) where A=J4, B=J5, C=J6, D=Rail(0), X=J1, Y=J2, Z=J3
  return `<${params.state},Angle(ABCDXYZ):${j[3]},${j[4]},${j[5]},0.00,${j[0]},${j[1]},${j[2]},Cartesian coordinate(XYZ RxRyRz):${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${p.rx.toFixed(2)},${p.ry.toFixed(2)},${p.rz.toFixed(2)},Pump PWM:${params.gripperPwm},Valve PWM:0,Motion_MODE:0>`;
}

/**
 * Parses a single incoming line from ESP32 / RS485 / WebSocket.
 * Supports:
 * 1. Optional RS485 address prefix: `@01 ...` (filtered by addressFilter if set)
 * 2. WLKATA Status Query: `?`
 * 3. JSON: `{"j":[...],"grip":1}` | `{"xyz":[...],"grip":0}` | `{"cmd":"home"}`
 * 4. CSV: `J,10,20,-15,0,-10,0` | `XYZ,200,30,210,0,0,0`
 * 5. WLKATA G-code: `M21 ...`, `M20 ...`, `M3 S1000`, `M5`, `$H`, `G28`
 */
export function parseIncomingHardwareLine(
  rawLine: string,
  options: {
    currentJoints: readonly number[];
    addressFilter?: string; // "" or "ANY" means accept all; e.g. "01" matches @01
  }
): HardwareCommand {
  const raw = String(rawLine ?? "").trim();
  if (!raw) return { kind: "IGNORED", reason: "Empty line", raw };

  let line = raw;
  const filter = (options.addressFilter ?? "").trim().toUpperCase();

  // Check optional RS485 slave address prefix: @01 <payload>
  const addrMatch = line.match(/^@(\d{1,2})\s*(.*)$/);
  if (addrMatch) {
    const addr = addrMatch[1].padStart(2, "0");
    if (filter && filter !== "ANY" && addr !== filter.padStart(2, "0")) {
      return { kind: "IGNORED", reason: `Addressed to @${addr} (filter @${filter})`, raw };
    }
    line = addrMatch[2].trim();
    if (!line) return { kind: "IGNORED", reason: "Empty RS485 payload", raw };
  }

  // Real-time status query `?`
  if (line === "?") {
    return { kind: "STATUS_QUERY", raw };
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
  if (code === "$H" || code.startsWith("$H ")) return { kind: "HOME", raw };

  const words: Array<{ letter: string; value: number }> = [];
  WORD_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_PATTERN.exec(code))) {
    const val = Number(m[2]);
    if (Number.isFinite(val)) words.push({ letter: m[1].toUpperCase(), value: val });
  }
  if (!words.length) return { kind: "IGNORED", reason: "Non-command text", raw };

  const mCodes = words.filter((w) => w.letter === "M").map((w) => w.value);
  const gCodes = words.filter((w) => w.letter === "G").map((w) => w.value);

  if (gCodes.includes(28)) return { kind: "HOME", raw };

  if (mCodes.includes(3)) {
    const pwm = Math.max(0, Math.min(1000, Math.round(words.find((w) => w.letter === "S")?.value ?? 1000)));
    return { kind: "GRIPPER", state: pwm > 0 ? "CLOSE" : "OPEN", pwm, raw };
  }
  if (mCodes.includes(5)) {
    return { kind: "GRIPPER", state: "OPEN", pwm: 0, raw };
  }

  const isRelative = gCodes.includes(91);
  const feed = words.find((w) => w.letter === "F")?.value;
  const axes: Partial<Record<"x" | "y" | "z" | "a" | "b" | "c", number>> = {};
  words.forEach(({ letter, value }) => {
    if ("XYZABC".includes(letter)) {
      axes[letter.toLowerCase() as keyof typeof axes] = value;
    }
  });

  if (!Object.keys(axes).length) {
    return { kind: "IGNORED", reason: "No axis coordinates", raw };
  }

  if (mCodes.includes(20)) {
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
      feedMmPerMin: feed && feed > 0 ? feed : 4800,
      raw,
    };
  }

  // Default or M21 = Joint Move
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
    feedDegPerMin: feed && feed > 0 ? feed : 2700,
    raw,
  };
}

export const ESP32_RS485_ARDUINO_SKETCH = `/*
 * ESP32 + RS485 Controller for Virtual Mi Robot Simulator
 * -------------------------------------------------------
 * Hardware Wiring:
 *   ESP32 GPIO17 (TX2) --> RS485 Module DI / TXD
 *   ESP32 GPIO16 (RX2) --> RS485 Module RO / RXD
 *   ESP32 GPIO4        --> RS485 Module DE + RE (skip if using XY-485 auto-direction)
 *   RS485 A            --> USB-RS485 A (D+)
 *   RS485 B            --> USB-RS485 B (D-)
 *   GND                --> USB-RS485 GND
 *
 * Web Simulator Settings:
 *   Open "RS485 / ESP32" -> USB / RS485 Serial -> Baud: 115200 -> RS485 Addr: 01 -> Connect
 */

#include <Arduino.h>

#define RS485_RX_PIN   16
#define RS485_TX_PIN   17
#define RS485_DE_PIN   4     // Set to -1 if using XY-485 / auto-direction module
#define RS485_BAUD     115200
#define ROBOT_ADDR     "01"

HardwareSerial RS485(2);

void rs485SendLine(const String &cmd) {
  if (RS485_DE_PIN >= 0) {
    digitalWrite(RS485_DE_PIN, HIGH); // Transmit mode
    delayMicroseconds(100);
  }
  RS485.print(cmd);
  RS485.print("\\r\\n");
  RS485.flush();
  if (RS485_DE_PIN >= 0) {
    delayMicroseconds(100);
    digitalWrite(RS485_DE_PIN, LOW);  // Back to Receive mode
  }
  Serial.println("[TX RS485] " + cmd);
}

void readRs485Reply(unsigned long waitMs = 300) {
  unsigned long start = millis();
  while (millis() - start < waitMs) {
    if (RS485.available()) {
      String reply = RS485.readStringUntil('\\n');
      reply.trim();
      if (reply.length() > 0) {
        Serial.println("[RX Robot] " + reply);
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  if (RS485_DE_PIN >= 0) {
    pinMode(RS485_DE_PIN, OUTPUT);
    digitalWrite(RS485_DE_PIN, LOW);
  }
  RS485.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  delay(1000);
  Serial.println("ESP32 RS485 Virtual Mirobot Controller Ready!");
}

void loop() {
  // 1. Go Home (WLKATA RS485 addressed G-code)
  rs485SendLine(String("@") + ROBOT_ADDR + " M21 G90 X0 Y0 Z0 A0 B0 C0 F3000");
  readRs485Reply(1800);

  // 2. Open Gripper
  rs485SendLine(String("@") + ROBOT_ADDR + " M5");
  readRs485Reply(400);

  // 3. Move to Pick pose
  rs485SendLine(String("@") + ROBOT_ADDR + " M21 G90 X-35 Y22 Z-28 A0 B-15 C0 F3000");
  readRs485Reply(1800);

  // 4. Close Gripper
  rs485SendLine(String("@") + ROBOT_ADDR + " M3 S1000");
  readRs485Reply(600);

  // 5. Move to Place pose (JSON format also works!)
  rs485SendLine("@01 {\\"j\\":[45, 26, -32, 0, -12, -20], \\"grip\\":1}");
  readRs485Reply(2200);

  // 6. Release & Query Virtual Robot Status
  rs485SendLine(String("@") + ROBOT_ADDR + " M5");
  readRs485Reply(500);

  rs485SendLine(String("@") + ROBOT_ADDR + " ?");
  readRs485Reply(600);
}
`;
