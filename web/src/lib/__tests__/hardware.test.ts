import { describe, expect, it } from "vitest";
import { HOME_JOINTS } from "../kinematics/constants";
import { fkPose6DFromJointsDeg } from "../kinematics/fk";
import {
  formatWlkataStatusReport,
  parseIncomingHardwareLine,
} from "../hardware/protocol";

describe("ESP32 + RS485 Virtual Mirobot Protocol Parser", () => {
  it("parses RS485 addressed WLKATA M21/M20/M3/M5/? commands and enforces address filter", () => {
    const moveJ = parseIncomingHardwareLine("@01 M21 G90 X30 Y15 Z-20 A0 B-10 C5 F3000", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(moveJ.kind).toBe("MOVE_JOINT");
    if (moveJ.kind === "MOVE_JOINT") {
      expect(moveJ.joints).toEqual([30, 15, -20, 0, -10, 5]);
      expect(moveJ.feedDegPerMin).toBe(3000);
    }

    const ignoredOther = parseIncomingHardwareLine("@02 M21 G90 X10 Y0 Z0 A0 B0 C0", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(ignoredOther.kind).toBe("IGNORED");

    const query = parseIncomingHardwareLine("@01 ?", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(query.kind).toBe("STATUS_QUERY");

    const gripClose = parseIncomingHardwareLine("@01 M3 S1000", {
      currentJoints: HOME_JOINTS,
      addressFilter: "01",
    });
    expect(gripClose.kind).toBe("GRIPPER");
    if (gripClose.kind === "GRIPPER") expect(gripClose.state).toBe("CLOSE");
  });

  it("parses JSON and CSV telemetry frames from ESP32", () => {
    const jsonJ = parseIncomingHardwareLine('@01 {"j":[-20, 15, -18, 5, -12, 10], "grip":1}', {
      currentJoints: HOME_JOINTS,
      addressFilter: "ANY",
    });
    expect(jsonJ.kind).toBe("MOVE_JOINT");
    if (jsonJ.kind === "MOVE_JOINT") {
      expect(jsonJ.joints[0]).toBe(-20);
      expect(jsonJ.gripper).toBe("CLOSE");
    }

    const csvXyz = parseIncomingHardwareLine("XYZ,200,20,210,0,0,0", {
      currentJoints: HOME_JOINTS,
    });
    expect(csvXyz.kind).toBe("MOVE_CARTESIAN");
    if (csvXyz.kind === "MOVE_CARTESIAN") {
      expect(csvXyz.pose.x).toBe(200);
      expect(csvXyz.pose.z).toBe(210);
    }
  });

  it("formats real WLKATA Mirobot status reply string", () => {
    const pose = fkPose6DFromJointsDeg(HOME_JOINTS);
    const reply = formatWlkataStatusReport({
      state: "Idle",
      joints: HOME_JOINTS,
      eePose: pose,
      gripperPwm: 1000,
    });
    expect(reply).toContain("<Idle,Angle(ABCDXYZ):");
    expect(reply).toContain("Cartesian coordinate(XYZ RxRyRz):198.67,0.00,230.72");
    expect(reply).toContain("Pump PWM:1000");
  });
});
