import type { RobotProfile } from "./types";

/** WLKATA Mirobot (6-DOF, stepper). Values are the original simulator v0.0.1 constants. */
export const MIROBOT_PROFILE: RobotProfile = {
  id: "mirobot",
  name: "WLKATA Mirobot",
  vendor: "WLKATA Robotics",
  summary: "6-axis desktop arm with stepper motors and interchangeable tools",
  activeJointCount: 6,
  mdhParams: [
    { i: 1, alpha: 0, a: 0, d: 127, thetaOffset: 0 },
    { i: 2, alpha: -Math.PI / 2, a: 29.69, d: 0, thetaOffset: -Math.PI / 2 },
    { i: 3, alpha: 0, a: 108, d: 0, thetaOffset: 0 },
    { i: 4, alpha: -Math.PI / 2, a: 20, d: 168.98, thetaOffset: 0 },
    { i: 5, alpha: Math.PI / 2, a: 0, d: 0, thetaOffset: Math.PI / 2 },
    { i: 6, alpha: Math.PI / 2, a: 0, d: -24.28, thetaOffset: 0 },
  ],
  jointLimits: [
    { min: -100, max: 160 }, // J1 base
    { min: -40, max: 70 }, // J2 shoulder
    { min: -170, max: 60 }, // J3 elbow
    { min: -170, max: 170 }, // J4 wrist pitch
    { min: -180, max: 36 }, // J5 wrist roll
    { min: -180, max: 180 }, // J6 tool rotation
  ],
  jointLabels: [
    "J1 (Base)",
    "J2 (Shoulder)",
    "J3 (Elbow)",
    "J4 (Wrist Pitch)",
    "J5 (Wrist Roll)",
    "J6 (Tool)",
  ],
  home: [0, 0, 0, 0, 0, 0],
  jogPresets: [
    { label: "Home", joints: [0, 0, 0, 0, 0, 0] },
    { label: "Ready", joints: [0, 15, -20, 0, -25, 0] },
    { label: "Reach", joints: [30, 32, -25, 0, -10, 0] },
    { label: "Pick", joints: [-35, 28, -32, 0, -18, 0] },
  ],
  workspace: {
    xMin: -325.62,
    xMax: 325.62,
    yMin: -325.62,
    yMax: 325.62,
    zMin: 30.5,
    zMax: 429.4,
    radiusMin: 80,
    radiusMax: 325.62,
    baseMinDeg: -110,
    baseMaxDeg: 160,
  },
  reachMm: 315,
  analyticIk: "MIROBOT_6DOF",
  meshSource: "stl",
  stlDir: "/models",
  meshColors: {
    base: 0x616161,
    link1: 0xbdbdbd,
    link2: 0xf57c00,
    link3: 0xbdbdbd,
    link4: 0xf57c00,
    link5: 0xbdbdbd,
    link6: 0xbdbdbd,
  },
  allowedTools: ["NONE", "SUCTION", "TWO_FINGER", "THREE_FINGER_SOFT", "MICRO_SERVO"],
  defaultTool: "TWO_FINGER",
  hardwareDriver: "WLKATA_RS485",
};
