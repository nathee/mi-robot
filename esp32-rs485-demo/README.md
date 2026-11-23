# ESP32 + RS485 Virtual Mirobot Bench Setup

Use a real **ESP32** + **RS485 transceiver** + **USB-to-RS485 dongle** to control the 3D Virtual Mi Robot Simulator just like a physical WLKATA Mirobot!

## Wiring Diagram

| ESP32 Pin | MAX485 / XY-485 Pin | USB-to-RS485 Adapter |
|---|---|---|
| `GPIO17 (TX2)` | `DI` / `TXD` | — |
| `GPIO16 (RX2)` | `RO` / `RXD` | — |
| `GPIO4` | `DE` + `RE` *(skip on XY-485)* | — |
| `3.3V` / `5V` | `VCC` *(match module rating)* | — |
| `GND` | `GND` | `GND` |
| — | `A` (`D+`) | `A` (`D+`) |
| — | `B` (`D-`) | `B` (`D-`) |

> **Tip:** If you use an **XY-485** (auto-direction) module, set `#define RS485_DE_PIN -1` in `mirobot_rs485_controller.ino`.

## Supported Protocols (all work over RS485 / Serial / WebSocket)
1. **WLKATA RS485 G-code**:
   - `@01 M21 G90 X-35 Y22 Z-28 A0 B-15 C0 F3000` (Joint move)
   - `@01 M20 G90 G1 X210 Y40 Z200 A0 B0 C0 F4800` (Cartesian linear move via IK)
   - `@01 M3 S1000` (Close Gripper) / `@01 M5` (Open Gripper)
   - `@01 $H` or `@01 G28` (Home)
   - `@01 ?` (Status query — virtual robot replies `<Idle,Angle(ABCDXYZ):...,Cartesian coordinate(...):...>`)
2. **JSON**:
   - `@01 {"j":[30,15,-20,0,-10,0],"grip":1}`
   - `@01 {"xyz":[200,30,210,0,0,0],"grip":0}`
3. **CSV**:
   - `J,30,15,-20,0,-10,0`
   - `XYZ,200,30,210,0,0,0`
