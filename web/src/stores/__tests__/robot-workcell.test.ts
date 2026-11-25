import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PLATFORMS } from "@/lib/sim/workcell";
import { XARM2_PROFILE } from "@/lib/robots";
import { activateRobotModel } from "../useRobotModelStore";
import { useWorkcellStore } from "../useWorkcellStore";

describe("activating a robot sets up its workcell", () => {
  afterEach(() => activateRobotModel("mirobot"));

  it("uses the xArm layout after activating the xArm", () => {
    activateRobotModel("xarm2");
    const s = useWorkcellStore.getState();
    expect(s.platforms).toEqual(XARM2_PROFILE.workcell!.platforms);
    expect(s.conveyor).toEqual(XARM2_PROFILE.workcell!.conveyor);
    expect(s.boxes.every((b) => !b.held)).toBe(true);
  });

  it("restores the generic layout for the Mirobot", () => {
    activateRobotModel("xarm2");
    activateRobotModel("mirobot");
    expect(useWorkcellStore.getState().platforms).toEqual(DEFAULT_PLATFORMS);
  });
});
