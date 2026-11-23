import { describe, expect, it } from "vitest";
import { DEFAULT_PATH_PROGRAM_SETTINGS, type PathTarget } from "../kinematics/constants";
import { fkPose6DFromJointsDeg } from "../kinematics/fk";
import {
  exportPathProgramGcode,
  isWlkataGcodeFile,
  parseGcodePathProgram,
  parsePathProgramJson,
  parseWlkataGcode,
  serializePathProgramJson,
} from "../path/gcode";

function makeTarget(id: number, name: string, joints: number[]): PathTarget {
  return {
    id,
    name,
    joints,
    ...fkPose6DFromJointsDeg(joints),
  };
}

describe("WLKATA G-code & JSON Program I/O", () => {
  it("detects WLKATA G-code file extensions", () => {
    expect(isWlkataGcodeFile("demo.gcode")).toBe(true);
    expect(isWlkataGcodeFile("path.NC")).toBe(true);
    expect(isWlkataGcodeFile("path.json")).toBe(false);
  });

  it("round-trips JSON path program with exact targets and settings", () => {
    const targets = [
      makeTarget(1, "Home", [0, 0, 0, 0, 0, 0]),
      makeTarget(2, "Pick", [20, 15, -20, 5, -10, 15]),
    ];

    const json = serializePathProgramJson({
      projectName: "Lab Pick & Place",
      settings: { ...DEFAULT_PATH_PROGRAM_SETTINGS, motionType: "MOVEL", trajectoryProfile: "SCURVE" },
      repeatCount: 3,
      targets,
    });

    const parsed = parsePathProgramJson(json);
    expect(parsed.projectName).toBe("Lab Pick & Place");
    expect(parsed.repeatCount).toBe(3);
    expect(parsed.settings.motionType).toBe("MOVEL");
    expect(parsed.settings.trajectoryProfile).toBe("SCURVE");
    expect(parsed.targets).toHaveLength(2);
    expect(parsed.targets[1].name).toBe("Pick");
    expect(parsed.targets[1].joints).toEqual([20, 15, -20, 5, -10, 15]);
  });

  it("exports and re-imports WLKATA M21/M20 G-code programs", () => {
    const targets = [
      makeTarget(1, "P1", [0, 0, 0, 0, 0, 0]),
      makeTarget(2, "P2", [30, 10, -15, 0, -10, 20]),
    ];

    const gcode = exportPathProgramGcode({
      projectName: "Gcode Demo",
      settings: DEFAULT_PATH_PROGRAM_SETTINGS,
      targets,
    });

    expect(gcode).toContain("; PROJECT: Gcode Demo");
    expect(gcode).toContain("M21 G90");

    const raw = parseWlkataGcode(gcode);
    expect(raw.projectName).toBe("Gcode Demo");
    expect(raw.commands).toHaveLength(2);

    const program = parseGcodePathProgram(gcode);
    expect(program.projectName).toBe("Gcode Demo");
    expect(program.targets).toHaveLength(2);
    expect(program.targets[1].joints[0]).toBeCloseTo(30, 2);
  });

  it("parses M20 Cartesian G-code via IK solver", () => {
    const p1 = fkPose6DFromJointsDeg([15, 10, -15, 0, -10, 10]);
    const gcode = `; PROJECT: Cart Demo\n; TARGET: P1\nM20 G90 G1 X${p1.x.toFixed(2)} Y${p1.y.toFixed(2)} Z${p1.z.toFixed(2)} A${p1.rx.toFixed(2)} B${p1.ry.toFixed(2)} C${p1.rz.toFixed(2)} F4800\n`;
    const program = parseGcodePathProgram(gcode);
    expect(program.settings.motionType).toBe("MOVEL");
    expect(program.targets).toHaveLength(1);
    expect(program.targets[0].x).toBeCloseTo(p1.x, 0);
    expect(program.targets[0].y).toBeCloseTo(p1.y, 0);
    expect(program.targets[0].z).toBeCloseTo(p1.z, 0);
  });
});
