import type { RobotProfile } from "./types";

/**
 * Hiwonder xArm 2.0: 5-DOF arm with a gripper, driven by bus servos
 * (LX-225 shoulder/elbow, LX-15D wrist, HTS-16L gripper) on a CoreX (ESP32 + STM32) controller.
 *
 * Link lengths come from Hiwonder's dimensional diagram: 65 mm base -> shoulder, 101 mm upper arm,
 * 95 mm forearm, 426 mm total height to the gripper tips (so 165 mm wrist-pitch axis -> tips).
 * The split of those 165 mm between the wrist/roll servo (DF) and the gripper TCP is estimated.
 *
 * ⚠ Joint limits, servo directions/offsets and gripper positions are still estimates. Measure your
 * arm and edit only this file; FK, IK, the 3D model and the hardware driver all read from it.
 *
 * Geometry (mm), Craig MDH. All joints at 0° = arm pointing straight up.
 *   D1  table -> shoulder axis
 *   L2  shoulder axis -> elbow axis
 *   L3  elbow axis -> wrist-pitch axis
 *   DF  wrist-pitch axis -> gripper mounting face (flange); the gripper's TCP offset is added on top
 * J2, J3 and J4 are parallel pitch axes; positive angles lean the arm away from the base (+radial).
 * J5 rolls the gripper about its own axis. J6 does not exist and is locked at 0.
 */
export const XARM2_DIMENSIONS_MM = {
  D1: 65,
  L2: 101,
  L3: 95,
  DF: 75,
} as const;

/** Base plate (277 x 155 mm); the arm's base axis sits on its centre line, near the front end. */
export const XARM2_BASE_PLATE_MM = {
  length: 277,
  width: 155,
  /** Distance from the base axis to the plate's front (+X) edge. */
  axisToFrontEdge: 77.5,
} as const;

const { D1, L2, L3, DF } = XARM2_DIMENSIONS_MM;

export const XARM2_PROFILE: RobotProfile = {
  id: "xarm2",
  name: "Hiwonder xArm 2.0",
  vendor: "Hiwonder",
  summary: "5-axis bus-servo arm with a built-in gripper",
  activeJointCount: 5,
  mdhParams: [
    { i: 1, alpha: 0, a: 0, d: D1, thetaOffset: 0 },
    { i: 2, alpha: -Math.PI / 2, a: 0, d: 0, thetaOffset: -Math.PI / 2 },
    { i: 3, alpha: 0, a: L2, d: 0, thetaOffset: 0 },
    { i: 4, alpha: 0, a: L3, d: 0, thetaOffset: Math.PI / 2 },
    { i: 5, alpha: -Math.PI / 2, a: 0, d: 0, thetaOffset: 0 },
    // Virtual J6: fixed flange frame. The tool tip lies along its -Z, like the Mirobot.
    { i: 6, alpha: 0, a: 0, d: -DF, thetaOffset: 0 },
  ],
  jointLimits: [
    { min: -120, max: 120 }, // J1 base (servo range is ±125°)
    { min: -90, max: 90 }, // J2 shoulder
    { min: -120, max: 120 }, // J3 elbow
    { min: -120, max: 120 }, // J4 wrist pitch
    { min: -120, max: 120 }, // J5 wrist roll
    { min: 0, max: 0 }, // J6 (not present)
  ],
  jointLabels: [
    "J1 (Base)",
    "J2 (Shoulder)",
    "J3 (Elbow)",
    "J4 (Wrist Pitch)",
    "J5 (Wrist Roll)",
    "J6 (—)",
  ],
  home: [0, 0, 0, 0, 0, 0],
  // J2 + J3 + J4 = 180° points the gripper straight down
  jogPresets: [
    { label: "Home", joints: [0, 0, 0, 0, 0, 0] },
    { label: "Ready", joints: [0, 20, 60, 70, 0, 0] },
    { label: "Reach", joints: [30, 45, 45, 60, 0, 0] },
    { label: "Pick", joints: [-35, 40, 70, 70, 0, 0] },
  ],
  workspace: {
    xMin: -350,
    xMax: 350,
    yMin: -350,
    yMax: 350,
    zMin: 0,
    zMax: 430,
    radiusMin: 0,
    radiusMax: 350,
    baseMinDeg: -180,
    baseMaxDeg: 180,
  },
  reachMm: L2 + L3 + DF,
  analyticIk: "PLANAR_5DOF",
  meshSource: "primitive",
  // Anodised-blue brackets on a black base, as on the real arm
  meshColors: {
    base: 0x1f2226,
    link1: 0x1e88e5,
    link2: 0x1e88e5,
    link3: 0x1e88e5,
    link4: 0x1e88e5,
    link5: 0x1e88e5,
    link6: 0x1e88e5,
  },
  allowedTools: ["XARM_GRIPPER", "NONE"],
  defaultTool: "XARM_GRIPPER",
  hardwareDriver: "HIWONDER_BUS_SERVO",
  busServos: {
    // xArm convention: ID 6 = base ... ID 2 = wrist roll, ID 1 = gripper.
    joints: [
      { jointIndex: 0, servoId: 6, direction: 1, offsetDeg: 0 },
      { jointIndex: 1, servoId: 5, direction: 1, offsetDeg: 0 },
      { jointIndex: 2, servoId: 4, direction: 1, offsetDeg: 0 },
      { jointIndex: 3, servoId: 3, direction: 1, offsetDeg: 0 },
      { jointIndex: 4, servoId: 2, direction: 1, offsetDeg: 0 },
    ],
    gripper: { servoId: 1, openPos: 300, closePos: 700 },
  },
};
