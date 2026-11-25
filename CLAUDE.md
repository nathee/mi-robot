# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

- `web/` — **the actual app**: Mi Robot Simulator, a Next.js 16 + React 19 + three.js + zustand + Tailwind 4 rewrite of a 6-DOF robot-arm simulator. All development happens here.
- `clone/`, `evidence/` — a byte-identical static mirror of the original Vue build (doc.inex.co.th/mirobot) plus provenance hashes (see `STATUS.md`). Reference only; don't edit.
- `esp32-rs485-demo/` — Arduino sketch + README for driving the simulator from a real ESP32 over RS-485 (WLKATA `@01 …` G-code, JSON and CSV line protocols).

## Commands (run in `web/`)

```bash
npm run dev          # next dev (http://localhost:3000)
npm run build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest run (node env, src/**/*.test.ts)
npx vitest run src/lib/__tests__/ik.test.ts          # single file
npx vitest run -t "CONSTRAINED solver"               # single test by name
```

`web/AGENTS.md` (auto-written by `next dev`): this Next.js version has breaking changes vs. training data — read `web/node_modules/next/dist/docs/` before writing Next-specific code. Note `src/proxy.ts` is the middleware (Next 16 name).

Env (`web/.env`): `NEXT_PUBLIC_APP_NAME`; optional `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` enable a Cloudflare Turnstile gate (`app/page.tsx`) and `proxy.ts` then 403s `/models/*` STLs without the signed session cookie.

## Architecture

**Robot profiles and live constants.** Two arms are supported: WLKATA Mirobot (6-DOF, STL meshes) and Hiwonder xArm 2.0 (5-DOF bus servos, primitive meshes). Each is a `RobotProfile` in `src/lib/robots/` (MDH table, joint limits/labels, home, workspace, jog presets, allowed tools, IK kind, hardware driver, servo map). The robot-specific exports in `src/lib/kinematics/constants.ts` (`MDH_PARAMS`, `JOINT_LIMITS`, `HOME_JOINTS`, `DEFAULT_WORKSPACE`, `JOINT_LABELS`, …) are **ES-module live bindings** (`export let`) reassigned by `setActiveRobotModel()` / `applyRobotProfile()`. Consequences:
- Read them at call time; never snapshot them into module-level values (ik.ts's `geo()` is a function for this reason).
- Joint arrays are always length 6 for every robot; the xArm's J6 is locked to `{min:0,max:0}` and UI shows `activeJointCount` joints.
- Tests that switch robots must restore `setActiveRobotModel("mirobot")` (and tool offset/workspace) in `afterEach`.

**Robot selection flow.** `app/page.tsx` → `RobotGate` → `RobotSelectScreen` until a model is chosen (`stores/useRobotModelStore.ts`), then `SimulatorShell`. Switching robots saves the autosave and **reloads the page** (pending model in sessionStorage) so every store starts clean. Autosave/history are per-robot (`autosaveStorageKey()`/`historyStorageKey()` in `lib/storage/workspaceStorage.ts`; Mirobot keeps the legacy unsuffixed keys).

**Kinematics** (`lib/kinematics/`): FK uses Craig MDH (`mdhWlkata`), meters internally, mm/deg at the `Pose6D` boundary. A module-level tool TCP offset (`setActiveToolOffsetMm`, set by `useRobotStore.setToolType`) makes all Cartesian coordinates refer to the tool tip along link6 −Z. IK: `solveIKPoseCandidate` with `ANALYTIC` (Mirobot spherical-wrist closed form, or `solveIK_Planar5Once` for 5-DOF), `DLS`, and `CONSTRAINED` (analytic seed + damped LS refinement). Use `isIkResultAcceptable()` for accept/reject — on <6-DOF arms orientation is best-effort and only position is checked.

**State** is zustand stores in `src/stores/` that call each other via `getState()`. Key ones: `useRobotStore` (joints, eePose, IK target, gripper, tool), `usePathStore` (taught targets + trajectory playback), `useCodeStore` (Blocks/Script/G-code editor + step runtime), `useWorkcellStore` (conveyor, boxes, light sensor, grasp/collision), `useHardwareStore` (RS-485 virtual controller), `useXarmLinkStore` (real xArm link), `useHistoryStore` (snapshot capture/apply, autosave), `useViewerStore` (display settings, IK solver config, workspace).

**Frame loop.** `lib/viewer/MirobotSceneEngine.ts` (created by `components/ViewerCanvas.tsx`) owns the three.js scene and the single `requestAnimationFrame` loop, which advances path playback, code execution, RS-485 smooth moves and the workcell sim each frame, then poses link meshes from FK. Meshes come from `loadRobotMeshes()` (STLs from `public/models/` or `viewer/primitiveRobot.ts`); each link object lives in its MDH frame.

**Programs.** Three editors compile to one step list (`lib/program/types.ts`: MOVE_JOINT / MOVE_CARTESIAN / WAIT / GRIPPER / …): `blocks.ts` (`compileBlocksProgram`), `scriptCompiler.ts`, `gcodeCompiler.ts` (WLKATA dialect); `lib/path/gcode.ts` handles path export/import. `useCodeStore.advanceCodeFrame` executes steps. Tool semantics of M3/M4/M5 depend on the mounted tool (`lib/tools/toolDefs.ts` `interpretToolCommand`).

**Two hardware directions — don't confuse them.**
- `useHardwareStore` + `lib/hardware/protocol.ts`: the simulator *is* a virtual Mirobot controller; an external master (ESP32 / USB-RS485 via Web Serial, or WebSocket) sends `@01 …` lines and the simulator replies (`ok`, GRBL-style status). `@99…` lines are HMI bus telemetry and must never be answered.
- `useXarmLinkStore` + `lib/hardware/hiwonderXarm.ts`: the simulator is the master driving a real Hiwonder xArm over WebHID (VID 0x0483 / PID 0x5750, 64-byte reports) or Web Serial 9600. Frames `55 55 len cmd data`, positions 0..1000 (500 = 0°, 4 units/°). Modes: mirror ("Follow simulator", speed-capped), teach (torque off + polling), read positions. xArm geometry, servo IDs/directions/offsets and gripper positions in `lib/robots/xarm2.ts` are **unverified estimates**; the protocol was taken from the xArm 1S open-source driver.
