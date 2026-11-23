import { describe, expect, it } from "vitest";
import { HOME_JOINTS } from "../kinematics/constants";
import { fkPose6DFromJointsDeg } from "../kinematics/fk";
import {
  formatO103StatusReply,
  formatWlkataStatusReport,
  parseIncomingHardwareLine,
} from "../hardware/protocol";

describe("IDX-485 / HMI-485 / WLKATA Mirobot RS-485 Protocol Parser", () => {
  it("parses compact IDX-485 frames without space after @01 ($H, M21, M3, M4, !, ~, %, G04, 0111=)", () => {
    expect(parseIncomingHardwareLine("@01$H", { currentJoints: HOME_JOINTS }).kind).toBe("HOME");
    expect(parseIncomingHardwareLine("@01!", { currentJoints: HOME_JOINTS }).kind).toBe("PAUSE");
    expect(parseIncomingHardwareLine("@01~", { currentJoints: HOME_JOINTS }).kind).toBe("RESUME");
    expect(parseIncomingHardwareLine("@01%", { currentJoints: HOME_JOINTS }).kind).toBe("RESET");

    const moveJ = parseIncomingHardwareLine("@01M21 G90 G00 X35 Y22 Z-15 A0 B-10 C0 F2000", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(moveJ.kind).toBe("MOVE_JOINT");
    if (moveJ.kind === "MOVE_JOINT") {
      expect(moveJ.joints).toEqual([35, 22, -15, 0, -10, 0]);
      expect(moveJ.feedDegPerMin).toBe(2000);
    }

    const dwell = parseIncomingHardwareLine("@01G04 P1.5", { currentJoints: HOME_JOINTS });
    expect(dwell.kind).toBe("WAIT");
    if (dwell.kind === "WAIT") expect(dwell.durationMs).toBe(1500);

    const runFile = parseIncomingHardwareLine("@010111=vec2501", { currentJoints: HOME_JOINTS });
    expect(runFile.kind).toBe("RUN_FILE");
    if (runFile.kind === "RUN_FILE") expect(runFile.fileName).toBe("vec2501");

    const gripM4 = parseIncomingHardwareLine("@01M4 E65", { currentJoints: HOME_JOINTS });
    expect(gripM4.kind).toBe("GRIPPER");
    if (gripM4.kind === "GRIPPER") expect(gripM4.state).toBe("CLOSE");
  });

  it("supports RS485_Mirobot library O103 status query & servo gripper M3 S40/S60", () => {
    const qO103 = parseIncomingHardwareLine("@01O103", { currentJoints: HOME_JOINTS });
    expect(qO103.kind).toBe("STATUS_QUERY");
    if (qO103.kind === "STATUS_QUERY") expect(qO103.format).toBe("O103");
    expect(formatO103StatusReply("Idle")).toBe("State:Idle");
    expect(formatO103StatusReply("Home")).toBe("State:Homing");
    expect(formatO103StatusReply("Hold")).toBe("State:Busy");

    const s40 = parseIncomingHardwareLine("@01M3 S40", { currentJoints: HOME_JOINTS });
    expect(s40.kind === "GRIPPER" && s40.state === "CLOSE").toBe(true);
    const s60 = parseIncomingHardwareLine("@01M3 S60", { currentJoints: HOME_JOINTS });
    expect(s60.kind === "GRIPPER" && s60.state === "OPEN").toBe(true);
    const s500 = parseIncomingHardwareLine("@01M3 S500", { currentJoints: HOME_JOINTS });
    expect(s500.kind === "GRIPPER" && s500.state === "OPEN").toBe(true);
  });

  it("sniffs HMI-485 @99 bus traffic silently without replying", () => {
    const hmi = parseIncomingHardwareLine("@99o200=72,1,1", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(hmi.kind).toBe("HMI_BUS");

    const other = parseIncomingHardwareLine("@02M21 G90 X10 Y0 Z0 A0 B0 C0", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(other.kind).toBe("IGNORED");
  });

  it("formats real WLKATA Mirobot status reply string for @01?", () => {
    const pose = fkPose6DFromJointsDeg(HOME_JOINTS);
    const reply = formatWlkataStatusReport({
      state: "Idle",
      joints: HOME_JOINTS,
      eePose: pose,
      pumpPwm: 1000,
      valvePwm: 65,
    });
    expect(reply).toContain("<Idle,Angle(ABCDXYZ):");
    expect(reply).toContain("Cartesian coordinate(XYZ RxRyRz):198.67,0.00,230.72");
    expect(reply).toContain("Pump PWM:1000,Valve PWM:65");
  });
});
