/**
 * Hiwonder / LewanSoul xArm controller-board protocol (bus servos behind a USB-HID / UART board).
 *
 * Frame: 0x55 0x55 <len> <cmd> <data…>, where len = data.length + 2. No checksum.
 * Over USB-HID the frame goes in output report 0, zero-padded to 64 bytes. Over UART: 9600 baud.
 * Positions are 0..1000 servo units, 500 = 0°, 4 units per degree (±125°). All 16-bit values
 * are little-endian.
 *
 * Source: the open-source xArm Python driver (ccourson/Hiwonder-xArm1S, controller.py). The xArm
 * 2.0 board is assumed to speak the same protocol; verify with the "Read positions" button first.
 */
import type { BusServoGripperMap, BusServoJointMap } from "@/lib/robots/types";

export const XARM_HID_VENDOR_ID = 0x0483;
export const XARM_HID_PRODUCT_ID = 0x5750;
export const XARM_HID_REPORT_ID = 0;
export const XARM_HID_REPORT_SIZE = 64;
export const XARM_UART_BAUD = 9600;

export const XARM_CMD = {
  SERVO_MOVE: 0x03,
  GET_BATTERY_VOLTAGE: 0x0f,
  SERVO_OFF: 0x14,
  GET_SERVO_POSITION: 0x15,
} as const;

export const SERVO_POS_MIN = 0;
export const SERVO_POS_MAX = 1000;
export const SERVO_POS_CENTER = 500;
export const SERVO_UNITS_PER_DEG = 4;

const HEADER = 0x55;

function u16(value: number): [number, number] {
  const v = Math.max(0, Math.min(0xffff, Math.round(value)));
  return [v & 0xff, (v >> 8) & 0xff];
}

export function buildFrame(cmd: number, data: readonly number[] = []): Uint8Array {
  return Uint8Array.from([HEADER, HEADER, data.length + 2, cmd & 0xff, ...data.map((b) => b & 0xff)]);
}

/** Frame zero-padded to the 64-byte HID output report (the report ID is sent separately). */
export function toHidReport(frame: Uint8Array): Uint8Array {
  const report = new Uint8Array(XARM_HID_REPORT_SIZE);
  report.set(frame.subarray(0, XARM_HID_REPORT_SIZE));
  return report;
}

export function clampServoPos(pos: number): number {
  return Math.max(SERVO_POS_MIN, Math.min(SERVO_POS_MAX, Math.round(pos)));
}

/** Simulator joint angle (deg) -> raw servo position, applying the joint's direction and offset. */
export function jointDegToServoPos(deg: number, map: Pick<BusServoJointMap, "direction" | "offsetDeg">): number {
  const servoDeg = map.direction * deg + map.offsetDeg;
  return clampServoPos(SERVO_POS_CENTER + servoDeg * SERVO_UNITS_PER_DEG);
}

/** Raw servo position -> simulator joint angle (deg). Inverse of jointDegToServoPos. */
export function servoPosToJointDeg(pos: number, map: Pick<BusServoJointMap, "direction" | "offsetDeg">): number {
  const servoDeg = (pos - SERVO_POS_CENTER) / SERVO_UNITS_PER_DEG;
  return (servoDeg - map.offsetDeg) * map.direction;
}

export function gripperServoPos(closed: boolean, gripper: BusServoGripperMap): number {
  return clampServoPos(closed ? gripper.closePos : gripper.openPos);
}

/** Moves several servos together over `durationMs`. */
export function buildMovePacket(
  targets: ReadonlyArray<{ id: number; pos: number }>,
  durationMs: number
): Uint8Array {
  const data: number[] = [targets.length, ...u16(Math.max(0, durationMs))];
  for (const t of targets) data.push(t.id & 0xff, ...u16(clampServoPos(t.pos)));
  return buildFrame(XARM_CMD.SERVO_MOVE, data);
}

export function buildReadPositionsPacket(ids: readonly number[]): Uint8Array {
  return buildFrame(XARM_CMD.GET_SERVO_POSITION, [ids.length, ...ids]);
}

/** Turns the servos' torque off so the arm can be moved by hand. */
export function buildServoOffPacket(ids: readonly number[]): Uint8Array {
  return buildFrame(XARM_CMD.SERVO_OFF, [ids.length, ...ids]);
}

export function buildBatteryPacket(): Uint8Array {
  return buildFrame(XARM_CMD.GET_BATTERY_VOLTAGE);
}

export type XarmReply =
  | { kind: "POSITIONS"; positions: Map<number, number> }
  | { kind: "BATTERY"; volts: number }
  | { kind: "OTHER"; cmd: number; data: Uint8Array };

/**
 * Parses one reply. `bytes` starts at the 0x55 0x55 header (a HID input report as received,
 * or a UART buffer). Returns null for anything that isn't a complete frame.
 */
export function parseReply(bytes: Uint8Array): XarmReply | null {
  if (bytes.length < 4 || bytes[0] !== HEADER || bytes[1] !== HEADER) return null;
  const len = bytes[2];
  const cmd = bytes[3];
  const data = bytes.subarray(4, 4 + Math.max(0, len - 2));
  if (data.length < len - 2) return null;

  if (cmd === XARM_CMD.GET_SERVO_POSITION) {
    const count = data[0] ?? 0;
    const positions = new Map<number, number>();
    for (let i = 0; i < count; i++) {
      const o = 1 + i * 3;
      if (o + 2 >= data.length) break; // truncated reply
      positions.set(data[o], data[o + 1] | (data[o + 2] << 8));
    }
    return { kind: "POSITIONS", positions };
  }
  if (cmd === XARM_CMD.GET_BATTERY_VOLTAGE && data.length >= 2) {
    return { kind: "BATTERY", volts: (data[0] | (data[1] << 8)) / 1000 };
  }
  return { kind: "OTHER", cmd, data };
}

/** Builds the move for all mapped joints (+ gripper) of a simulator joint vector. */
export function buildPoseMovePacket(
  joints: readonly number[],
  maps: readonly BusServoJointMap[],
  durationMs: number,
  gripper?: { map: BusServoGripperMap; closed: boolean }
): Uint8Array {
  const targets = maps.map((m) => ({ id: m.servoId, pos: jointDegToServoPos(joints[m.jointIndex] ?? 0, m) }));
  if (gripper) targets.push({ id: gripper.map.servoId, pos: gripperServoPos(gripper.closed, gripper.map) });
  return buildMovePacket(targets, durationMs);
}

/** Simulator joint vector from servo positions; joints without a reading keep `fallback`. */
export function jointsFromServoPositions(
  positions: ReadonlyMap<number, number>,
  maps: readonly BusServoJointMap[],
  fallback: readonly number[]
): number[] {
  const q = fallback.slice();
  for (const m of maps) {
    const pos = positions.get(m.servoId);
    if (pos !== undefined) q[m.jointIndex] = servoPosToJointDeg(pos, m);
  }
  return q;
}

export function formatFrameHex(frame: Uint8Array): string {
  return Array.from(frame, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

/**
 * Splits a UART byte stream into complete frames. Bytes before a header are dropped;
 * an incomplete trailing frame is returned in `rest` to prepend to the next chunk.
 */
export function extractFrames(buffer: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const frames: Uint8Array[] = [];
  let i = 0;
  while (i < buffer.length) {
    if (buffer[i] !== HEADER || buffer[i + 1] !== HEADER) {
      if (i + 1 >= buffer.length) break; // a lone trailing 0x55 may start the next header
      i++;
      continue;
    }
    if (i + 2 >= buffer.length) break;
    const total = buffer[i + 2] + 2;
    if (total < 4) {
      i += 2;
      continue;
    }
    if (i + total > buffer.length) break;
    frames.push(buffer.slice(i, i + total));
    i += total;
  }
  const rest = buffer.slice(i);
  return { frames, rest: rest.length === 1 && rest[0] !== HEADER ? new Uint8Array(0) : rest };
}
