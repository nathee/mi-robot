import { beforeEach, describe, expect, it } from "vitest";
import { usePathStore } from "../usePathStore";
import { useProjectStore } from "../useProjectStore";
import { useRobotStore } from "../useRobotStore";
import { useSerialStore } from "../useSerialStore";
import { useThemeStore } from "../useThemeStore";
import { useViewerStore } from "../useViewerStore";

describe("Zustand Simulator Stores", () => {
  beforeEach(() => {
    useRobotStore.getState().setHome();
    usePathStore.getState().newProgram();
    useSerialStore.getState().clear();
    useProjectStore.getState().resetProject();
  });

  it("updates joints, FK eePose, IK solver, and workspace validation", () => {
    const robot = useRobotStore.getState();
    robot.setJoint(0, 30, { log: true });
    expect(useRobotStore.getState().joints[0]).toBe(30);
    expect(useRobotStore.getState().eePose.y).toBeGreaterThan(50);

    // Out of workspace rejected
    const okOut = useRobotStore.getState().setIkTarget({ x: 500, y: 0, z: 200 });
    expect(okOut).toBe(false);
    expect(useRobotStore.getState().workspaceStatus.out).toBe(true);

    // Valid IK target (shift Z by -15 mm from current reachable pose) solves cleanly
    const currPose = useRobotStore.getState().eePose;
    const okIn = useRobotStore.getState().setIkTarget({ z: currPose.z - 15 });
    expect(okIn).toBe(true);
    const solved = useRobotStore.getState().applyIk({ withLog: true });
    expect(solved).toBe(true);
    expect(useRobotStore.getState().lastIkErr.posMm).toBeLessThan(0.6);
  });

  it("manages Path targets CRUD, undo/redo, copy/paste, playback, and JSON/G-code I/O", () => {
    // Teach 2 targets
    useRobotStore.getState().setJoints([0, 0, 0, 0, 0, 0]);
    const p1 = usePathStore.getState().teachTarget("Start");
    expect(p1?.name).toBe("Start");

    useRobotStore.getState().setJoints([30, 15, -15, 0, -10, 15]);
    const p2 = usePathStore.getState().teachTarget("Pick");
    expect(p2?.name).toBe("Pick");
    expect(usePathStore.getState().targets).toHaveLength(2);

    // Copy / Paste / Undo / Redo
    expect(usePathStore.getState().copySelectedTarget()).toBe(true);
    expect(usePathStore.getState().pasteTarget()).toBe(true);
    expect(usePathStore.getState().targets).toHaveLength(3);

    expect(usePathStore.getState().undo()).toBe(true);
    expect(usePathStore.getState().targets).toHaveLength(2);

    expect(usePathStore.getState().redo()).toBe(true);
    expect(usePathStore.getState().targets).toHaveLength(3);

    // Reorder
    usePathStore.getState().reorderTarget(2, 0);
    expect(usePathStore.getState().targets[0].name).toBe("Pick_copy");

    // Step and playback progression
    usePathStore.getState().updateSettings({ durationMode: "FIXED", fixedDurationSec: 0.5 });
    usePathStore.getState().togglePlayback();
    expect(usePathStore.getState().status).toBe("PLAYING");
    usePathStore.getState().advancePlaybackFrame(250);
    expect(usePathStore.getState().trajectoryTelemetry.progress).toBeCloseTo(0.5, 1);

    // Export JSON & re-import
    usePathStore.getState().stopPlayback();
    const json = usePathStore.getState().exportJsonString();
    usePathStore.getState().clearTargets();
    expect(usePathStore.getState().targets).toHaveLength(0);
    usePathStore.getState().importProgramText("sample.json", json);
    expect(usePathStore.getState().targets).toHaveLength(3);
  });

  it("manages Viewer, Theme, and Serial console stores", () => {
    useViewerStore.getState().setField("showZGrid", true);
    useViewerStore.getState().setLinkFrameVisible(2, false);
    expect(useViewerStore.getState().showZGrid).toBe(true);
    expect(useViewerStore.getState().linkFrameVisibility[2]).toBe(false);

    useThemeStore.getState().setMode("light");
    expect(useThemeStore.getState().isDark).toBe(false);

    useSerialStore.getState().appendLog({ dir: "sys", text: "Test log line" });
    expect(useSerialStore.getState().formatConsoleText()).toContain("Test log line");
  });
});
