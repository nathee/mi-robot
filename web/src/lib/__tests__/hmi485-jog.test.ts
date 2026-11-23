import { describe, expect, it } from "vitest";
import { HOME_JOINTS } from "../kinematics/constants";
import { fkPose6DFromJointsDeg } from "../kinematics/fk";
import { formatWlkataStatusReport, parseIncomingHardwareLine } from "../hardware/protocol";

// Exact lines sent by 0vec-skill lab09_hmi485.ino (HMI-485 jog screen)
const opts = { currentJoints: HOME_JOINTS, addressFilter: "01" };

describe("0vec-skill Lab 09 HMI-485 jog commands", () => {
  it("joint jog (M21 G91) moves one joint relative to the current joints", () => {
    const cmd = parseIncomingHardwareLine("@01M21 G91 G01 X5 F2000", opts);
    expect(cmd.kind).toBe("MOVE_JOINT");
    if (cmd.kind === "MOVE_JOINT") expect(cmd.joints).toEqual([5, 0, 0, 0, 0, 0]);

    const j6 = parseIncomingHardwareLine("@01M21 G91 G01 C-10 F500", {
      ...opts,
      currentJoints: [10, 0, 0, 0, 0, 20],
    });
    expect(j6.kind).toBe("MOVE_JOINT");
    if (j6.kind === "MOVE_JOINT") expect(j6.joints).toEqual([10, 0, 0, 0, 0, 10]);
  });

  it("joint jog past a limit is rejected with an error", () => {
    const cmd = parseIncomingHardwareLine("@01M21 G91 G01 Y10 F2000", {
      ...opts,
      currentJoints: [0, 65, 0, 0, 0, 0],
    });
    expect(cmd.kind).toBe("ERROR");
  });

  it("cartesian jog (M20 G91) offsets the current pose", () => {
    const start = fkPose6DFromJointsDeg(HOME_JOINTS);
    const cmd = parseIncomingHardwareLine("@01M20 G91 G01 Z-5 F1000", opts);
    expect(cmd.kind).toBe("MOVE_CARTESIAN");
    if (cmd.kind === "MOVE_CARTESIAN") {
      expect(cmd.pose.z).toBeCloseTo(start.z - 5, 3);
      expect(cmd.pose.x).toBeCloseTo(start.x, 3);
    }
  });

  it("buttons and status poll", () => {
    expect(parseIncomingHardwareLine("@01?", opts).kind).toBe("STATUS_QUERY");
    expect(parseIncomingHardwareLine("@01$H", opts).kind).toBe("HOME");
    expect(parseIncomingHardwareLine("@01!", opts).kind).toBe("PAUSE");
    expect(parseIncomingHardwareLine("@01~", opts).kind).toBe("RESUME");
    expect(parseIncomingHardwareLine("@01%", opts).kind).toBe("RESET");
    expect(parseIncomingHardwareLine("@01M3 S1000", opts).kind).toBe("GRIPPER");
    expect(parseIncomingHardwareLine("@01M3 S0", opts).kind).toBe("GRIPPER");
    const zero = parseIncomingHardwareLine("@01M21 G90 G00 X0 Y0 Z0 A0 B0 C0 F2000", {
      ...opts,
      currentJoints: [30, 10, -20, 5, 0, 15],
    });
    expect(zero.kind).toBe("MOVE_JOINT");
    if (zero.kind === "MOVE_JOINT") expect(zero.joints).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("status reply keeps the keys the HMI parser looks for", () => {
    const reply = formatWlkataStatusReport({
      state: "Idle",
      joints: [1, 2, 3, 4, 5, 6],
      eePose: fkPose6DFromJointsDeg([1, 2, 3, 4, 5, 6]),
      pumpPwm: 1000,
    });
    expect(reply).toMatch(/^<Idle,Angle\(ABCDXYZ\):4\.00,5\.00,6\.00,0\.00,1\.00,2\.00,3\.00,/);
    expect(reply).toContain("Cartesian coordinate(XYZ RxRyRz):");
    expect(reply).toContain("Pump PWM:1000");
  });
});
