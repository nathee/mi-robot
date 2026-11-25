import { describe, expect, it } from "vitest";
import {
  buildBatteryPacket,
  buildMovePacket,
  buildPoseMovePacket,
  buildReadPositionsPacket,
  buildServoOffPacket,
  jointDegToServoPos,
  jointsFromServoPositions,
  parseReply,
  servoPosToJointDeg,
  toHidReport,
} from "../hardware/hiwonderXarm";
import { XARM2_PROFILE } from "../robots";

const hex = (u8: Uint8Array) => Array.from(u8);

describe("Hiwonder xArm bus-servo protocol", () => {
  it("encodes a single-servo move like the reference driver", () => {
    // setPosition(1, 500, duration=1000): 55 55 08 03 01 E8 03 01 F4 01
    expect(hex(buildMovePacket([{ id: 1, pos: 500 }], 1000))).toEqual([
      0x55, 0x55, 0x08, 0x03, 0x01, 0xe8, 0x03, 0x01, 0xf4, 0x01,
    ]);
  });

  it("encodes a multi-servo move with len = 3N + 5", () => {
    const pkt = buildMovePacket(
      [
        { id: 6, pos: 300 },
        { id: 5, pos: 1000 },
      ],
      250
    );
    expect(pkt[2]).toBe(3 * 2 + 5);
    expect(hex(pkt)).toEqual([0x55, 0x55, 11, 0x03, 2, 0xfa, 0x00, 6, 0x2c, 0x01, 5, 0xe8, 0x03]);
  });

  it("clamps positions to 0..1000", () => {
    const pkt = buildMovePacket([{ id: 2, pos: 1400 }], 100);
    expect(pkt[8] | (pkt[9] << 8)).toBe(1000);
  });

  it("encodes read / servo-off / battery requests", () => {
    expect(hex(buildReadPositionsPacket([1, 2, 3]))).toEqual([0x55, 0x55, 6, 0x15, 3, 1, 2, 3]);
    expect(hex(buildServoOffPacket([1, 2, 3, 4, 5, 6]))).toEqual([0x55, 0x55, 9, 0x14, 6, 1, 2, 3, 4, 5, 6]);
    expect(hex(buildBatteryPacket())).toEqual([0x55, 0x55, 2, 0x0f]);
  });

  it("pads HID reports to 64 bytes", () => {
    const r = toHidReport(buildBatteryPacket());
    expect(r.length).toBe(64);
    expect(hex(r.subarray(0, 5))).toEqual([0x55, 0x55, 2, 0x0f, 0]);
  });

  it("parses a position reply", () => {
    // two servos: id 6 = 300, id 5 = 712, followed by HID padding
    const reply = new Uint8Array(64);
    reply.set([0x55, 0x55, 9, 0x15, 2, 6, 0x2c, 0x01, 5, 0xc8, 0x02]);
    const parsed = parseReply(reply);
    expect(parsed?.kind).toBe("POSITIONS");
    if (parsed?.kind !== "POSITIONS") return;
    expect(parsed.positions.get(6)).toBe(300);
    expect(parsed.positions.get(5)).toBe(712);
  });

  it("parses battery voltage and rejects garbage", () => {
    const parsed = parseReply(Uint8Array.from([0x55, 0x55, 4, 0x0f, 0x1c, 0x1d]));
    expect(parsed).toEqual({ kind: "BATTERY", volts: 7.452 });
    expect(parseReply(Uint8Array.from([0x00, 0x55, 4, 0x0f]))).toBeNull();
    expect(parseReply(Uint8Array.from([0x55, 0x55, 9, 0x15, 2]))).toBeNull();
  });

  it("converts degrees <-> servo units (500 = 0°, 4 units/°) with direction and offset", () => {
    expect(jointDegToServoPos(0, { direction: 1, offsetDeg: 0 })).toBe(500);
    expect(jointDegToServoPos(90, { direction: 1, offsetDeg: 0 })).toBe(860);
    expect(jointDegToServoPos(90, { direction: -1, offsetDeg: 0 })).toBe(140);
    expect(jointDegToServoPos(10, { direction: 1, offsetDeg: 5 })).toBe(560);
    for (const map of [
      { direction: 1 as const, offsetDeg: 0 },
      { direction: -1 as const, offsetDeg: 7.5 },
    ]) {
      expect(servoPosToJointDeg(jointDegToServoPos(-42, map), map)).toBeCloseTo(-42, 6);
    }
  });

  it("maps a simulator pose onto the xArm 2.0 servo IDs and back", () => {
    const { joints: maps, gripper } = XARM2_PROFILE.busServos!;
    const q = [10, -20, 30, -40, 50, 0];
    const pkt = buildPoseMovePacket(q, maps, 500, { map: gripper, closed: true });
    expect(pkt[4]).toBe(6); // 5 joints + gripper

    const positions = new Map<number, number>();
    for (let i = 0; i < 6; i++) {
      const o = 7 + i * 3;
      positions.set(pkt[o], pkt[o + 1] | (pkt[o + 2] << 8));
    }
    expect(positions.get(gripper.servoId)).toBe(gripper.closePos);
    expect(jointsFromServoPositions(positions, maps, [0, 0, 0, 0, 0, 0])).toEqual(q);
  });
});

describe("UART frame splitter", () => {
  it("extracts frames across chunk boundaries and skips noise", async () => {
    const { extractFrames } = await import("../hardware/hiwonderXarm");
    const a = Uint8Array.from([0x00, 0x13, 0x55, 0x55, 4, 0x0f, 0x1c]);
    const first = extractFrames(a);
    expect(first.frames).toHaveLength(0);
    const merged = Uint8Array.from([...first.rest, 0x1d, 0x55, 0x55, 2, 0x0f, 0x55]);
    const second = extractFrames(merged);
    expect(second.frames.map((f) => Array.from(f))).toEqual([
      [0x55, 0x55, 4, 0x0f, 0x1c, 0x1d],
      [0x55, 0x55, 2, 0x0f],
    ]);
    expect(Array.from(second.rest)).toEqual([0x55]);
  });
});
