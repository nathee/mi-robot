import { applyRobotProfile, getActiveRobotProfile } from "@/lib/kinematics/constants";
import { MIROBOT_PROFILE } from "./mirobot";
import type { RobotModelId, RobotProfile } from "./types";
import { XARM2_PROFILE } from "./xarm2";

export type { RobotModelId, RobotProfile } from "./types";
export { MIROBOT_PROFILE } from "./mirobot";
export { XARM2_PROFILE, XARM2_DIMENSIONS_MM } from "./xarm2";

export const ROBOT_PROFILES: Record<RobotModelId, RobotProfile> = {
  mirobot: MIROBOT_PROFILE,
  xarm2: XARM2_PROFILE,
};

export const ROBOT_MODEL_IDS = Object.keys(ROBOT_PROFILES) as RobotModelId[];

export function isRobotModelId(value: unknown): value is RobotModelId {
  return typeof value === "string" && value in ROBOT_PROFILES;
}

/** Switches FK/IK, limits, workspace and labels to `id`. Returns the profile now active. */
export function setActiveRobotModel(id: RobotModelId): RobotProfile {
  const profile = ROBOT_PROFILES[id];
  applyRobotProfile(profile);
  return profile;
}

export function getActiveRobot(): RobotProfile {
  return getActiveRobotProfile();
}
