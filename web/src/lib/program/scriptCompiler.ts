import { DEFAULT_WORKSPACE, JOINT_LIMITS, type Pose6D } from "@/lib/kinematics/constants";
import { checkWorkspaceXYZ } from "@/lib/kinematics/fk";
import { stepsToGcode } from "./gcodeCompiler";
import { isToolType, TOOL_TYPES, type ToolType } from "@/lib/tools/toolDefs";
import type { CompileError, CompileResult, ProgramStep } from "./types";

interface ScriptNodeLine {
  line: number;
  text: string;
}

function parseNumericArgs(rawArgs: string): { positional: number[]; named: Record<string, number> } {
  const positional: number[] = [];
  const named: Record<string, number> = {};
  if (!rawArgs.trim()) return { positional, named };

  const parts = rawArgs.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const kv = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([-+]?\d*\.?\d+)$/);
    if (kv) {
      named[kv[1].toLowerCase()] = Number(kv[2]);
    } else {
      const n = Number(part);
      if (!Number.isFinite(n)) {
        throw new Error(`Invalid number argument "${part}"`);
      }
      positional.push(n);
    }
  }
  return { positional, named };
}

/**
 * Compiles the Easy Robotics Script DSL into executable ProgramStep[].
 * Supported statements:
 *   home()
 *   moveJ(j1, j2, j3, j4, j5, j6 [, speed=45])
 *   moveL(x, y, z, rx, ry, rz [, speed=80])
 *   wait(seconds)
 *   gripper("open" | "close")
 *   log("message")
 *   repeat N: ... end
 */
export function compileScriptProgram(source: string): CompileResult {
  const steps: ProgramStep[] = [];
  const errors: CompileError[] = [];
  const warnings: string[] = [];

  const rawLines = String(source ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const cleaned: ScriptNodeLine[] = [];
  rawLines.forEach((line, idx) => {
    const stripped = line.replace(/(#|\/\/).*$/, "").trim();
    if (stripped) cleaned.push({ line: idx + 1, text: stripped });
  });

  const MAX_STEPS = 500;

  const execBlock = (startIdx: number, endIdx: number): void => {
    let i = startIdx;
    while (i < endIdx) {
      if (steps.length >= MAX_STEPS) {
        errors.push({ line: cleaned[i].line, message: `Program exceeds ${MAX_STEPS} step limit` });
        return;
      }

      const { line, text } = cleaned[i];

      // Handle repeat N: ... end
      const repeatMatch = text.match(/^repeat\s+(\d+)\s*:?$/i);
      if (repeatMatch) {
        const count = Number(repeatMatch[1]);
        if (count < 1 || count > 50) {
          errors.push({ line, message: "repeat count must be between 1 and 50" });
          return;
        }
        let depth = 1;
        let matchEnd = -1;
        for (let j = i + 1; j < endIdx; j++) {
          if (/^repeat\s+\d+\s*:?$/i.test(cleaned[j].text)) depth++;
          else if (/^end$/i.test(cleaned[j].text)) {
            depth--;
            if (depth === 0) {
              matchEnd = j;
              break;
            }
          }
        }
        if (matchEnd === -1) {
          errors.push({ line, message: `Missing matching "end" for repeat block` });
          return;
        }
        for (let r = 0; r < count; r++) {
          execBlock(i + 1, matchEnd);
          if (errors.length) return;
        }
        i = matchEnd + 1;
        continue;
      }

      if (/^end$/i.test(text)) {
        errors.push({ line, message: `Unexpected "end" without matching "repeat"` });
        return;
      }

      // Function call statement: name(args)
      const callMatch = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/);
      if (!callMatch) {
        errors.push({ line, message: `Invalid syntax: "${text}"` });
        i++;
        continue;
      }

      const fn = callMatch[1].toLowerCase();
      const argsRaw = callMatch[2].trim();

      try {
        if (fn === "home") {
          steps.push({ type: "HOME", sourceLine: line, label: "home()" });
        } else if (fn === "movej") {
          const { positional, named } = parseNumericArgs(argsRaw);
          if (positional.length !== 6) {
            throw new Error("moveJ requires 6 joint angles: moveJ(j1, j2, j3, j4, j5, j6)");
          }
          for (let jIdx = 0; jIdx < 6; jIdx++) {
            const lim = JOINT_LIMITS[jIdx];
            if (positional[jIdx] < lim.min || positional[jIdx] > lim.max) {
              throw new Error(
                `J${jIdx + 1}=${positional[jIdx]}° out of range [${lim.min}°, ${lim.max}°]`
              );
            }
          }
          const speedDegSec = Math.max(5, Math.min(180, named.speed ?? 50));
          steps.push({
            type: "MOVE_JOINT",
            joints: positional,
            feedDegPerMin: speedDegSec * 60,
            sourceLine: line,
            label: `moveJ(${positional.map((v) => v.toFixed(0)).join(", ")})`,
          });
        } else if (fn === "movel") {
          const { positional, named } = parseNumericArgs(argsRaw);
          if (positional.length !== 6) {
            throw new Error("moveL requires 6 values: moveL(x, y, z, rx, ry, rz)");
          }
          const pose: Pose6D = {
            x: positional[0],
            y: positional[1],
            z: positional[2],
            rx: positional[3],
            ry: positional[4],
            rz: positional[5],
          };
          const ws = checkWorkspaceXYZ(pose.x, pose.y, pose.z, DEFAULT_WORKSPACE);
          if (!ws.ok) throw new Error(ws.message);
          const speedMmSec = Math.max(5, Math.min(500, named.speed ?? 80));
          steps.push({
            type: "MOVE_CARTESIAN",
            pose,
            interpolation: "linear",
            feedMmPerMin: speedMmSec * 60,
            sourceLine: line,
            label: `moveL(${pose.x.toFixed(0)}, ${pose.y.toFixed(0)}, ${pose.z.toFixed(0)})`,
          });
        } else if (fn === "wait" || fn === "delay") {
          const { positional } = parseNumericArgs(argsRaw);
          const sec = positional[0];
          if (!Number.isFinite(sec) || sec < 0 || sec > 60) {
            throw new Error("wait(seconds) expects a number between 0 and 60");
          }
          steps.push({
            type: "WAIT",
            durationMs: Math.round(sec * 1000),
            sourceLine: line,
            label: `wait(${sec}s)`,
          });
        } else if (fn === "gripper" || fn === "suction" || fn === "grab" || fn === "release") {
          let state: "OPEN" | "CLOSE";
          if (fn === "grab" || fn === "release") {
            if (argsRaw) throw new Error(`${fn}() takes no arguments`);
            state = fn === "grab" ? "CLOSE" : "OPEN";
          } else {
            const strMatch = argsRaw.match(/^["'](open|close|on|off)["']$/i);
            if (!strMatch) {
              throw new Error(
                fn === "suction" ? `suction() expects "on" or "off"` : `gripper() expects "open" or "close"`
              );
            }
            const arg = strMatch[1].toLowerCase();
            state = arg === "close" || arg === "on" ? "CLOSE" : "OPEN";
          }
          const word =
            fn === "suction" ? (state === "CLOSE" ? "on" : "off") : state === "CLOSE" ? "close" : "open";
          steps.push({
            type: "GRIPPER",
            state,
            pwm: state === "CLOSE" ? 1000 : 0,
            sourceLine: line,
            label: fn === "grab" || fn === "release" ? `${fn}()` : `${fn}("${word}")`,
          });
        } else if (fn === "tool") {
          const strMatch = argsRaw.match(/^["']([A-Za-z_]+)["']$/);
          const name = strMatch?.[1].toUpperCase();
          if (!isToolType(name)) {
            throw new Error(`tool() expects one of: ${TOOL_TYPES.map((t) => `"${t}"`).join(", ")}`);
          }
          steps.push({ type: "TOOL", tool: name, sourceLine: line, label: `tool("${name}")` });
        } else if (fn === "conveyor" || fn === "conveyorto") {
          const { positional } = parseNumericArgs(argsRaw);
          const d = positional[0];
          if (!Number.isFinite(d) || Math.abs(d) > 5000) {
            throw new Error(`${callMatch[1]}(mm) expects a distance between -5000 and 5000`);
          }
          const absolute = fn === "conveyorto";
          steps.push({
            type: "CONVEYOR",
            mode: "MOVE",
            value: d,
            absolute,
            sourceLine: line,
            label: `${callMatch[1]}(${d})`,
          });
        } else if (fn === "conveyorauto") {
          const m = argsRaw.match(/^["'](on|off)["']\s*(?:,\s*(?:speed\s*=\s*)?([-+]?\d+(?:\.\d+)?))?$/i);
          if (!m) throw new Error(`conveyorAuto() expects "on" or "off", e.g. conveyorAuto("on", speed=60)`);
          const on = m[1].toLowerCase() === "on";
          const speed = m[2] !== undefined ? Number(m[2]) : 60;
          if (on && (speed < 5 || speed > 100)) throw new Error("conveyorAuto speed must be between 5 and 100");
          steps.push({
            type: "CONVEYOR",
            mode: "AUTO",
            value: on ? speed : 0,
            sourceLine: line,
            label: on ? `conveyorAuto("on", ${speed})` : `conveyorAuto("off")`,
          });
        } else if (fn === "waitsensor") {
          const m = argsRaw.match(/^(?:["'](box|clear)["'])?\s*,?\s*(?:timeout\s*=\s*)?(\d+(?:\.\d+)?)?$/i);
          if (!m) throw new Error(`waitSensor() usage: waitSensor(), waitSensor("clear"), waitSensor(timeout=20)`);
          const until = m[1]?.toLowerCase() === "clear" ? "CLEAR" : "BLOCKED";
          const timeoutSec = m[2] !== undefined ? Number(m[2]) : 30;
          if (timeoutSec <= 0 || timeoutSec > 300) throw new Error("waitSensor timeout must be 1-300 seconds");
          steps.push({
            type: "WAIT_SENSOR",
            until,
            timeoutMs: Math.round(timeoutSec * 1000),
            sourceLine: line,
            label: until === "CLEAR" ? `waitSensor("clear")` : "waitSensor()",
          });
        } else if (fn === "conveyorspeed") {
          const { positional } = parseNumericArgs(argsRaw);
          const p = positional[0];
          if (!Number.isFinite(p) || p < -100 || p > 100) {
            throw new Error("conveyorSpeed(percent) expects a number between -100 and 100");
          }
          steps.push({ type: "CONVEYOR", mode: "SPEED", value: p, sourceLine: line, label: `conveyorSpeed(${p})` });
        } else if (fn === "log" || fn === "print") {
          const msgMatch = argsRaw.match(/^["'](.*)["']$/);
          const message = msgMatch ? msgMatch[1] : argsRaw;
          steps.push({
            type: "LOG",
            message,
            sourceLine: line,
            label: `log("${message}")`,
          });
        } else {
          throw new Error(`Unknown command "${callMatch[1]}"`);
        }
      } catch (err) {
        errors.push({ line, message: err instanceof Error ? err.message : "Invalid statement" });
      }

      i++;
    }
  };

  execBlock(0, cleaned.length);

  if (!steps.length && !errors.length) {
    warnings.push("Script contains no executable commands.");
  }

  return { steps, errors, warnings };
}

export function scriptToGcode(
  source: string,
  projectName?: string,
  toolType?: ToolType
): { gcode: string; errors: CompileError[] } {
  const res = compileScriptProgram(source);
  return {
    gcode: res.errors.length ? "" : stepsToGcode(res.steps, projectName, toolType),
    errors: res.errors,
  };
}

export const SAMPLE_SCRIPTS: Record<string, { name: string; code: string }> = {
  sensorFeed: {
    name: "Auto Feed + Light Sensor (Suction)",
    code: `# Workcell preset "Conveyor Feed" (Tools tab -> Workcell)
# Auto-feed runs the belt until a box breaks the light beam, then stops.
# When the box is lifted away, the beam clears and the belt runs again.
tool("SUCTION")
home()
conveyorAuto("on", speed=60)

log("Box 1")
  waitSensor(timeout=30)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(132.5, -150, 86, 0, 0, 0, speed=40)
  suction("on")
  wait(0.3)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(200, 70, 110, 0, 0, 0, speed=100)
  moveL(200, 70, 47, 0, 0, 0, speed=40)
  suction("off")
  wait(0.3)
  moveL(200, 70, 110, 0, 0, 0, speed=90)

log("Box 2")
  waitSensor(timeout=30)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(132.5, -150, 86, 0, 0, 0, speed=40)
  suction("on")
  wait(0.3)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(200, 110, 110, 0, 0, 0, speed=100)
  moveL(200, 110, 47, 0, 0, 0, speed=40)
  suction("off")
  wait(0.3)
  moveL(200, 110, 110, 0, 0, 0, speed=90)

log("Box 3")
  waitSensor(timeout=30)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(132.5, -150, 86, 0, 0, 0, speed=40)
  suction("on")
  wait(0.3)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(200, 150, 110, 0, 0, 0, speed=100)
  moveL(200, 150, 47, 0, 0, 0, speed=40)
  suction("off")
  wait(0.3)
  moveL(200, 150, 110, 0, 0, 0, speed=90)

conveyorAuto("off")
home()
log("Done: 3 boxes sorted by the light sensor")
`,
  },
  conveyorPick: {
    name: "Conveyor → Pick → Tray (Suction)",
    code: `# Workcell preset "Conveyor Feed" (Tools tab → Workcell)
# The conveyor brings each box to the end stop, the suction cup
# picks it up and places it on the tray.
tool("SUCTION")
home()

log("Box 1")
conveyor(-80)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(132.5, -150, 86, 0, 0, 0, speed=40)
  suction("on")
  wait(0.3)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(200, 70, 110, 0, 0, 0, speed=100)
  moveL(200, 70, 47, 0, 0, 0, speed=40)
  suction("off")
  wait(0.3)
  moveL(200, 70, 110, 0, 0, 0, speed=90)

log("Box 2")
conveyor(-80)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(132.5, -150, 86, 0, 0, 0, speed=40)
  suction("on")
  wait(0.3)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(200, 110, 110, 0, 0, 0, speed=100)
  moveL(200, 110, 47, 0, 0, 0, speed=40)
  suction("off")
  wait(0.3)
  moveL(200, 110, 110, 0, 0, 0, speed=90)

log("Box 3")
conveyor(-80)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(132.5, -150, 86, 0, 0, 0, speed=40)
  suction("on")
  wait(0.3)
  moveL(132.5, -150, 130, 0, 0, 0, speed=90)
  moveL(200, 150, 110, 0, 0, 0, speed=100)
  moveL(200, 150, 47, 0, 0, 0, speed=40)
  suction("off")
  wait(0.3)
  moveL(200, 150, 110, 0, 0, 0, speed=90)

home()
log("All boxes on the tray!")
`,
  },
  softGripper: {
    name: "Tray → Conveyor (Soft Gripper)",
    code: `# Workcell preset "Pick & Place" (Tools tab → Workcell)
# The three-finger soft gripper moves a box from the tray onto the conveyor,
# then the conveyor carries it away.
tool("THREE_FINGER_SOFT")
home()
gripper("open")
moveL(200, 110, 120, 0, 0, 0, speed=90)
moveL(200, 110, 40, 0, 0, 0, speed=40)
gripper("close")
wait(0.4)
moveL(200, 110, 140, 0, 0, 0, speed=90)
moveL(230, -150, 140, 0, 0, 0, speed=100)
moveL(230, -150, 82, 0, 0, 0, speed=40)
gripper("open")
wait(0.4)
moveL(230, -150, 140, 0, 0, 0, speed=90)
home()
conveyorSpeed(-60)
wait(2)
conveyorSpeed(0)
`,
  },
  pickLoop: {
    name: "Pick & Place Loop (x2)",
    code: `# Easy Mirobot Pick & Place Script
home()
gripper("open")

repeat 2:
  log("Moving to Pick")
  moveJ(-35, 22, -28, 0, -15, 0, speed=55)
  gripper("close")
  wait(0.4)

  log("Moving to Place")
  moveJ(20, 5, -10, 10, -20, 20, speed=60)
  moveJ(45, 26, -32, 0, -12, -20, speed=55)
  gripper("open")
  wait(0.4)
end

home()
log("Cycle complete!")
`,
  },
  linearInspect: {
    name: "Linear Scan (MoveL)",
    code: `# Smooth Cartesian Linear Scan
home()
moveL(200, -50, 200, 0, 0, 0, speed=85)
wait(0.3)
moveL(200, 50, 200, 0, 0, 0, speed=85)
wait(0.3)
moveL(230, 0, 240, 0, 0, 0, speed=85)
home()
`,
  },
};
