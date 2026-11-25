# Mi Robot Simulator

A browser-based 3D simulator for desktop robot arms. You can jog an arm, teach and play back paths, write programs as Blocks, Script or G-code, run a small work cell (conveyor, boxes, light sensor), and connect to real hardware.

Supported arms:

| Robot | Axes | 3D model | Hardware link |
|---|---|---|---|
| **WLKATA Mirobot** | 6 | STL meshes | Acts as a virtual Mirobot controller driven over RS-485 / ESP32 Wi-Fi |
| **Hiwonder xArm 2.0** | 5 + gripper | Placeholder geometry (boxes/cylinders) | Drives the real arm's bus servos over USB (WebHID or serial) |

The app asks which arm to use when it opens. To switch later, click the robot name in the toolbar.

## Quick start

Requires Node.js 20+ and a desktop Chromium browser (Chrome or Edge) for the hardware features.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

### Configuration (`web/.env`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | Name shown in the toolbar (default "Mi Robot Simulator") |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional. When both are set, visitors must pass a Cloudflare Turnstile check before the app and its 3D models load |

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing them.

## Features

- **Manual control:** joint sliders, Cartesian (XYZ / RxRyRz) jog, 3D gizmos, quick poses.
- **Inverse kinematics:** analytic, damped-least-squares and constrained solvers, plus a workspace envelope check.
- **Path:** teach targets, then play them back with MoveJ / MoveL / MoveC moves and a choice of trajectory profiles (linear, cubic, quintic, trapezoidal, S-curve). Export the path as G-code.
- **Code:** a Blocks editor, a Script editor and a G-code editor (WLKATA dialect), all running on the same step engine.
- **Tools:** suction cup, two-finger, soft three-finger, micro-servo and xArm grippers, each with its own TCP offset and grasp rules.
- **Work cell:** conveyor, boxes, light sensor and color query, with collision detection that stops a program.
- **Work history:** the session autosaves, and you can save named snapshots (Ctrl+S). Each robot keeps its own session and history.

## Hardware

### Mirobot: virtual controller over RS-485

In this mode the simulator plays the role of the robot. An external controller sends WLKATA `@01 …` commands to it, and the simulator moves and replies the way a real Mirobot would. The external controller can be an ESP32, a PLC or a PC, connected through a USB-RS485 adapter (Web Serial) or over Wi-Fi (WebSocket).

Wiring and protocols are covered in [`esp32-rs485-demo/README.md`](esp32-rs485-demo/README.md). That folder also has a ready-made Arduino sketch, which you can download from the app's hardware dialog as well.

### xArm 2.0: drive the real arm over USB

Here the simulator is the master and drives the real arm. Open **Real arm** in the toolbar and connect with **USB (HID)**, or with **USB serial** (9600 baud) through a USB-TTL adapter.

- **Follow simulator:** every jog, path or program step moves the real arm. A speed cap keeps sudden jumps gentle.
- **Teach by hand:** releases servo torque so you can pose the arm by hand while the simulator follows.
- **Read positions / Send pose / Servos off:** one-shot commands. The dialog also shows the battery voltage.

> **Calibrate before the first run.** The xArm link lengths, joint limits, servo IDs, directions, offsets and gripper positions are first estimates, and the USB protocol comes from the xArm 1S open-source driver. To check them:
> 1. Press **Read positions**.
> 2. Jog one joint at a time at low speed and confirm each turns the same way as the simulator.
> 3. Correct any differences in [`web/src/lib/robots/xarm2.ts`](web/src/lib/robots/xarm2.ts). That one file feeds the kinematics, the 3D model and the driver.

## Adding a robot

1. Create a `RobotProfile` in `web/src/lib/robots/`. It holds the Craig MDH table, joint limits and labels, home pose, workspace, jog presets, allowed tools, IK kind, mesh source and hardware driver. Register it in `web/src/lib/robots/index.ts`.
2. Either supply STL meshes per link (`base`, `link1`–`link6`) under `web/public/models/`, or use `meshSource: "primitive"`.
3. Add round-trip FK/IK tests, following the example of `web/src/lib/__tests__/xarm2-kinematics.test.ts`.

Joint arrays always have 6 elements. A robot with fewer axes locks its unused joints at 0.

## Repository layout

```
web/               Next.js app (the simulator)
esp32-rs485-demo/  ESP32 RS-485 bench sketch and wiring guide
clone/, evidence/  Archived mirror of the original Vue v0.0.1 build (reference only; see STATUS.md)
```

## Credits

Original Mirobot Simulator v0.0.1 by WLKATA Robotics and inex. The Mirobot 3D models come from that build.
