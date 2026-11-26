"use client";

import { useEffect, useState } from "react";
import { useRobotModelStore } from "@/stores/useRobotModelStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useVisitStore } from "@/stores/useVisitStore";
import { IntroModal } from "./Modals";
import { RobotSelectScreen } from "./RobotSelectScreen";
import { SimulatorShell } from "./SimulatorShell";

/**
 * Asks which robot arm to simulate before the simulator mounts, so the 3D model, kinematics and
 * the restored session all belong to that robot. The selector reopens as an overlay to switch.
 */
export function RobotGate() {
  const initialized = useRobotModelStore((s) => s.initialized);
  const loadedModel = useRobotModelStore((s) => s.loadedModel);
  const selecting = useRobotModelStore((s) => s.selecting);
  const [introOpen, setIntroOpen] = useState(true);

  useEffect(() => {
    useThemeStore.getState().init();
    useLocaleStore.getState().init();
    useRobotModelStore.getState().init();
    useVisitStore.getState().init();
  }, []);

  if (!initialized) {
    return <div className="h-screen w-screen bg-slate-100 dark:bg-slate-950" />;
  }

  return (
    <>
      {loadedModel && <SimulatorShell />}
      {(selecting || !loadedModel) && <RobotSelectScreen />}
      <IntroModal open={introOpen} onClose={() => setIntroOpen(false)} />
    </>
  );
}
