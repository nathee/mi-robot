import { describe, expect, it } from "vitest";
import {
  blocksToGcode,
  blocksToScript,
  compileBlocksProgram,
  createDemoBlocks,
} from "../program/blocks";
import { compileGcodeProgram, SAMPLE_GCODE_PROGRAMS } from "../program/gcodeCompiler";
import { compileScriptProgram, SAMPLE_SCRIPTS, scriptToGcode } from "../program/scriptCompiler";

describe("Unified Robot Programming Compilers (Blocks, Script, G-code)", () => {
  it("compiles extended WLKATA G-code with M21, M20, G4 delay, M3/M5 gripper, and $H", () => {
    const res = compileGcodeProgram(SAMPLE_GCODE_PROGRAMS.pickAndPlace.code);
    expect(res.errors).toEqual([]);
    expect(res.steps.length).toBeGreaterThanOrEqual(8);
    expect(res.steps.some((s) => s.type === "WAIT")).toBe(true);
    expect(res.steps.some((s) => s.type === "GRIPPER" && s.state === "CLOSE")).toBe(true);
    expect(res.steps.some((s) => s.type === "GRIPPER" && s.state === "OPEN")).toBe(true);

    const sq = compileGcodeProgram(SAMPLE_GCODE_PROGRAMS.linearSquare.code);
    expect(sq.errors).toEqual([]);
    expect(sq.steps.some((s) => s.type === "MOVE_CARTESIAN")).toBe(true);
  });

  it("reports clear line errors for out-of-range joints or workspace violations in G-code", () => {
    const bad = compileGcodeProgram("M21 G90 X250 Y0 Z0 A0 B0 C0");
    expect(bad.errors).toHaveLength(1);
    expect(bad.errors[0].line).toBe(1);
    expect(bad.errors[0].message).toContain("J1");
  });

  it("compiles Easy Script with nested repeat loops and converts cleanly to WLKATA G-code", () => {
    const res = compileScriptProgram(SAMPLE_SCRIPTS.pickLoop.code);
    expect(res.errors).toEqual([]);
    // 2 initial + 2 * 9 loop body + 2 final = 22 steps
    expect(res.steps.length).toBe(22);

    const conv = scriptToGcode(SAMPLE_SCRIPTS.pickLoop.code, "Loop Test");
    expect(conv.errors).toEqual([]);
    expect(conv.gcode).toContain("M21 G90");
    expect(conv.gcode).toContain("M3 S1000");
    expect(conv.gcode).toContain("G4 P0.40");
  });

  it("compiles Visual Blocks (including Repeat loops) to steps, Easy Script, and WLKATA G-code", () => {
    const blocks = createDemoBlocks();
    const compiled = compileBlocksProgram(blocks);
    expect(compiled.errors).toEqual([]);
    // Home + Open + 2*(6 children) + Home = 15 steps
    expect(compiled.steps).toHaveLength(15);

    const script = blocksToScript(blocks);
    expect(script).toContain("repeat 2:");
    expect(script).toContain('gripper("close")');

    const gcode = blocksToGcode(blocks, "Blocks Demo");
    expect(gcode).toContain("; PROJECT: Blocks Demo");
    expect(gcode).toContain("M3 S1000");
    expect(gcode).toContain("M5");
  });
});
