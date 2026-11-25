import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMovePacket, jointDegToServoPos, parseReply, XARM_CMD } from "@/lib/hardware/hiwonderXarm";
import { setActiveToolOffsetMm } from "@/lib/kinematics/fk";
import { MIROBOT_PROFILE, setActiveRobotModel, XARM2_PROFILE } from "@/lib/robots";
import { TOOL_DEFS } from "@/lib/tools/toolDefs";
import { activateRobotModel } from "../useRobotModelStore";
import { useRobotStore } from "../useRobotStore";
import { useViewerStore } from "../useViewerStore";
import { useXarmLinkStore, type XarmTransport } from "../useXarmLinkStore";

function fakeTransport() {
  const sent: Uint8Array[] = [];
  const t: XarmTransport = {
    kind: "HID",
    label: "fake xArm",
    send: async (frame) => {
      sent.push(frame.slice());
    },
    close: async () => undefined,
  };
  return { t, sent, cmds: () => sent.map((f) => f[3]) };
}

const maps = XARM2_PROFILE.busServos!.joints;

describe("xArm link store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    activateRobotModel("xarm2");
  });
  afterEach(async () => {
    await useXarmLinkStore.getState().disconnect();
    vi.useRealTimers();
    setActiveRobotModel("mirobot");
    useViewerStore.setState({ workspace: { ...MIROBOT_PROFILE.workspace } });
    useRobotStore.getState().setToolType("TWO_FINGER", { log: false });
    setActiveToolOffsetMm(TOOL_DEFS.TWO_FINGER.tcpOffsetMm);
    useRobotStore.getState().setHome();
  });

  it("activating the xArm selects its gripper, workspace and home pose", () => {
    expect(useRobotStore.getState().toolType).toBe("XARM_GRIPPER");
    expect(useViewerStore.getState().workspace).toEqual(XARM2_PROFILE.workspace);
    expect(useRobotStore.getState().joints).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("does not move the arm until Follow simulator is enabled", async () => {
    const { t, cmds } = fakeTransport();
    useXarmLinkStore.getState().attachTransport(t);
    useRobotStore.getState().setJoint(0, 30);
    await vi.advanceTimersByTimeAsync(200);
    expect(cmds()).not.toContain(XARM_CMD.SERVO_MOVE);
  });

  it("mirrors simulator poses as speed-limited multi-servo moves", async () => {
    const { t, sent } = fakeTransport();
    useXarmLinkStore.getState().attachTransport(t);
    useXarmLinkStore.getState().setMirror(true);
    await vi.advanceTimersByTimeAsync(0);
    const sync = sent.filter((f) => f[3] === XARM_CMD.SERVO_MOVE);
    expect(sync).toHaveLength(1);
    expect(sync[0][5] | (sync[0][6] << 8)).toBe(1500); // slow initial sync

    useRobotStore.getState().setJoint(0, 45); // base +45° at 90°/s => 500 ms
    await vi.advanceTimersByTimeAsync(100);
    const moves = sent.filter((f) => f[3] === XARM_CMD.SERVO_MOVE);
    expect(moves).toHaveLength(2);
    const last = moves[1];
    expect(last[5] | (last[6] << 8)).toBe(500);
    // base = servo 6 is the first target: [count, durLo, durHi, id, lo, hi]
    expect(last[7]).toBe(6);
    expect(last[8] | (last[9] << 8)).toBe(jointDegToServoPos(45, maps[0]));

    // An unchanged pose sends nothing more
    useRobotStore.getState().setJoint(0, 45);
    await vi.advanceTimersByTimeAsync(100);
    expect(sent.filter((f) => f[3] === XARM_CMD.SERVO_MOVE)).toHaveLength(2);
  });

  it("Read positions pulls the real arm pose into the simulator without echoing it", async () => {
    const { t, sent } = fakeTransport();
    const link = useXarmLinkStore.getState();
    link.attachTransport(t);
    link.setMirror(true);
    await vi.advanceTimersByTimeAsync(0);
    const before = sent.length;

    await link.readPositions();
    expect(sent.at(-1)![3]).toBe(XARM_CMD.GET_SERVO_POSITION);

    // Board replies: base (6) = +20°, shoulder (5) = -10°
    const reply = Uint8Array.from([
      0x55, 0x55, 9, XARM_CMD.GET_SERVO_POSITION, 2,
      6, ...[jointDegToServoPos(20, maps[0])].flatMap((p) => [p & 0xff, p >> 8]),
      5, ...[jointDegToServoPos(-10, maps[1])].flatMap((p) => [p & 0xff, p >> 8]),
    ]);
    link.handleIncomingBytes(reply);
    const q = useRobotStore.getState().joints;
    expect(q[0]).toBeCloseTo(20, 6);
    expect(q[1]).toBeCloseTo(-10, 6);

    await vi.advanceTimersByTimeAsync(200);
    // Only the read request was sent after the sync, no move echo
    expect(sent.slice(before).map((f) => f[3])).toEqual([XARM_CMD.GET_SERVO_POSITION]);
  });

  it("teach mode releases torque and polls positions until turned off", async () => {
    const { t, cmds } = fakeTransport();
    const link = useXarmLinkStore.getState();
    link.attachTransport(t);
    link.setTeach(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(cmds()).toContain(XARM_CMD.SERVO_OFF);
    const polls = cmds().filter((c) => c === XARM_CMD.GET_SERVO_POSITION).length;
    expect(polls).toBeGreaterThanOrEqual(3);
    expect(useXarmLinkStore.getState().mirror).toBe(false);

    link.setTeach(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(cmds().filter((c) => c === XARM_CMD.GET_SERVO_POSITION).length).toBe(polls);
  });

  it("stores the battery voltage", () => {
    const { t } = fakeTransport();
    useXarmLinkStore.getState().attachTransport(t);
    useXarmLinkStore.getState().handleIncomingBytes(Uint8Array.from([0x55, 0x55, 4, 0x0f, 0x1c, 0x1d]));
    expect(useXarmLinkStore.getState().batteryVolts).toBeCloseTo(7.452, 3);
    // sanity: helpers agree on frame layout
    expect(parseReply(buildMovePacket([{ id: 1, pos: 1 }], 1))?.kind).toBe("OTHER");
  });

  it("allows changing the serial baud rate", () => {
    expect(useXarmLinkStore.getState().baudRate).toBe(9600);
    useXarmLinkStore.getState().setBaudRate(115200);
    expect(useXarmLinkStore.getState().baudRate).toBe(115200);
    useXarmLinkStore.getState().setBaudRate(9600);
  });
});
