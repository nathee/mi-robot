import { afterEach, describe, expect, it } from "vitest";
import { HOME_JOINTS } from "@/lib/kinematics/constants";
import {
  fkPose6DFromJointsDeg,
  pose6DToTargetMatrix,
  setActiveToolOffsetMm,
} from "@/lib/kinematics/fk";
import { solveIKPoseCandidate } from "@/lib/kinematics/ik";
import { interpretToolCommand, toolCodeFor, TOOL_DEFS } from "@/lib/tools/toolDefs";

afterEach(() => setActiveToolOffsetMm(0));

describe("tool command interpretation", () => {
  it("suction: S1000 sucks, S500 blows, S0 off", () => {
    expect(interpretToolCommand("SUCTION", "M3", 1000).state).toBe("CLOSE");
    expect(interpretToolCommand("SUCTION", "M3", 500).state).toBe("OPEN");
    expect(interpretToolCommand("SUCTION", "M3", 40).state).toBe("OPEN");
    expect(interpretToolCommand("SUCTION", "M3", 0).state).toBe("OPEN");
  });

  it("micro servo: S40 grabs, S60 and S1000 open", () => {
    expect(interpretToolCommand("MICRO_SERVO", "M3", 40).state).toBe("CLOSE");
    expect(interpretToolCommand("MICRO_SERVO", "M3", 60).state).toBe("OPEN");
    expect(interpretToolCommand("MICRO_SERVO", "M3", 1000).state).toBe("OPEN");
  });

  it("pneumatic grippers: M4 E65 grab, M4 E40 open, M3 S1000 grab, M5 open", () => {
    for (const t of ["TWO_FINGER", "THREE_FINGER_SOFT"] as const) {
      expect(interpretToolCommand(t, "M4", 65).state).toBe("CLOSE");
      expect(interpretToolCommand(t, "M4", 40).state).toBe("OPEN");
      expect(interpretToolCommand(t, "M3", 1000).state).toBe("CLOSE");
      expect(interpretToolCommand(t, "M3", 500).state).toBe("OPEN");
      expect(interpretToolCommand(t, "M5").state).toBe("OPEN");
    }
  });

  it("grab/release codes round-trip through the interpreter", () => {
    for (const def of Object.values(TOOL_DEFS)) {
      if (def.type === "NONE") continue;
      for (const state of ["CLOSE", "OPEN"] as const) {
        const line = toolCodeFor(def.type, state);
        const [code, word] = line.split(" ");
        const value = word ? Number(word.slice(1)) : undefined;
        expect(interpretToolCommand(def.type, code as "M3" | "M4", value).state).toBe(state);
      }
    }
  });
});

describe("tool TCP offset in FK/IK", () => {
  it("offset 0 keeps the flange pose", () => {
    const a = fkPose6DFromJointsDeg(HOME_JOINTS, 0);
    setActiveToolOffsetMm(0);
    const b = fkPose6DFromJointsDeg(HOME_JOINTS);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
  });

  it("moves the TCP by the offset distance along the tool axis", () => {
    const flange = fkPose6DFromJointsDeg(HOME_JOINTS, 0);
    const tip = fkPose6DFromJointsDeg(HOME_JOINTS, 60);
    const d = Math.hypot(tip.x - flange.x, tip.y - flange.y, tip.z - flange.z);
    expect(d).toBeCloseTo(60, 4);
    // At home the tool points down
    expect(tip.z).toBeLessThan(flange.z);
  });

  it("IK reaches a TCP target with a tool mounted", () => {
    setActiveToolOffsetMm(60);
    const q = [10, 15, -20, 0, -30, 5];
    const target = fkPose6DFromJointsDeg(q);
    for (const solver of ["CONSTRAINED", "DLS"] as const) {
      const sol = solveIKPoseCandidate([0, 0, 0, 0, 0, 0], pose6DToTargetMatrix(target), solver);
      expect(sol).not.toBeNull();
      const got = fkPose6DFromJointsDeg(sol!.q);
      expect(Math.hypot(got.x - target.x, got.y - target.y, got.z - target.z)).toBeLessThan(2);
    }
  });
});
