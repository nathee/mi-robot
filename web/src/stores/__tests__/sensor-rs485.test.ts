import { afterEach, describe, expect, it, vi } from "vitest";
import { useHardwareStore } from "@/stores/useHardwareStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";

describe("light sensor over RS-485", () => {
  const original = useHardwareStore.getState().sendRawLine;
  afterEach(() => useHardwareStore.setState({ sendRawLine: original, connected: false, reportSensor: true }));

  it("pushes SENSOR=1 / SENSOR=0 on change and answers SENSOR?", () => {
    const sent: string[] = [];
    useHardwareStore.setState({
      connected: true,
      reportSensor: true,
      sendRawLine: vi.fn(async (l: string) => void sent.push(l)),
    });
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    useWorkcellStore.getState().setAutoFeed(true, 100);
    for (let i = 0; i < 400 && !useWorkcellStore.getState().sensorBlocked; i++) useWorkcellStore.getState().step(50);
    expect(sent).toContain("SENSOR=1");

    useHardwareStore.getState().handleIncomingLine("@01SENSOR?");
    expect(sent.at(-1)).toBe("SENSOR=1");

    // Lift the box away -> beam clears -> SENSOR=0, belt restarts
    const id = useWorkcellStore.getState().boxes.reduce((a, b) => (a.x < b.x ? a : b)).id;
    useWorkcellStore.getState().removeBox(id);
    useWorkcellStore.getState().step(16);
    expect(sent.at(-1)).toBe("SENSOR=0");
    useWorkcellStore.getState().step(16);
    expect(useWorkcellStore.getState().conveyorRuntime.speedMmS).toBeLessThan(0);

    useHardwareStore.getState().handleIncomingLine("@01AUTO=0");
    expect(useWorkcellStore.getState().autoFeed.enabled).toBe(false);
  });

  it("stays silent when reporting is off", () => {
    const sent: string[] = [];
    useHardwareStore.setState({ connected: true, reportSensor: false, sendRawLine: vi.fn(async (l: string) => void sent.push(l)) });
    useWorkcellStore.getState().loadPreset("CONVEYOR");
    useWorkcellStore.getState().setAutoFeed(true, 100);
    for (let i = 0; i < 400; i++) useWorkcellStore.getState().step(50);
    expect(sent.filter((l) => l.startsWith("SENSOR="))).toEqual([]);
  });
});
