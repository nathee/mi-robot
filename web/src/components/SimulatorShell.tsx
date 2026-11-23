"use client";

import { useEffect, useRef, useState } from "react";
import { useCodeStore } from "@/stores/useCodeStore";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { usePathStore } from "@/stores/usePathStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { ControlSidebar } from "./ControlSidebar";
import { HardwareModal } from "./HardwareModal";
import { ConfirmModal, DownloadRobotModal, HistoryModal, TextPromptModal } from "./Modals";
import { SerialConsole } from "./SerialConsole";
import { StatusBar } from "./StatusBar";
import { Toolbar, triggerTextDownload } from "./Toolbar";
import { ViewerCanvas } from "./ViewerCanvas";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function SimulatorShell() {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const mainRowRef = useRef<HTMLDivElement | null>(null);

  const [sidebarWidthPx, setSidebarWidthPx] = useState(340);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [consoleHeightPx, setConsoleHeightPx] = useState(170);
  const [draggingSplit, setDraggingSplit] = useState<"sidebar" | "console" | null>(null);

  // Modal states
  const [renameProjectOpen, setRenameProjectOpen] = useState(false);
  const [renameTargetState, setRenameTargetState] = useState<{
    open: boolean;
    index: number;
    name: string;
  }>({ open: false, index: -1, name: "" });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);

  const projectName = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const setProjectName = useProjectStore((s) => s.setName);
  const historyEntries = useHistoryStore((s) => s.entries);
  const saveToHistory = useHistoryStore((s) => s.saveToHistory);
  const restoreFromHistory = useHistoryStore((s) => s.restoreFromHistory);
  const deleteFromHistory = useHistoryStore((s) => s.deleteFromHistory);
  const clearHistory = useHistoryStore((s) => s.clearHistory);
  const targets = usePathStore((s) => s.targets);
  const exportGcodeString = usePathStore((s) => s.exportGcodeString);
  const newProgram = usePathStore((s) => s.newProgram);
  const clearTargets = usePathStore((s) => s.clearTargets);
  const renameTarget = usePathStore((s) => s.renameTarget);
  const appendLog = useSerialStore((s) => s.appendLog);

  // Initialize theme, console ready log, and restore previous session from localStorage
  useEffect(() => {
    useThemeStore.getState().init();
    useSerialStore.getState().initReady();
    useHistoryStore.getState().hydrate();
  }, []);

  // Warn before closing or refreshing when there are unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Debounced auto-save draft to localStorage whenever workspace changes
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleAutosave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        useHistoryStore.getState().saveAutosave();
      }, 400);
    };

    const unsubs = [
      useProjectStore.subscribe(scheduleAutosave),
      usePathStore.subscribe(scheduleAutosave),
      useCodeStore.subscribe(scheduleAutosave),
      useRobotStore.subscribe(scheduleAutosave),
    ];

    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);

  // Global Keyboard Shortcuts (including Ctrl+S to save snapshot)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        useHistoryStore.getState().saveToHistory("Ctrl+S save");
        return;
      }

      if (isEditableTarget(e.target)) return;
      const path = usePathStore.getState();

      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        path.teachTarget();
      } else if (mod && e.key.toLowerCase() === "c") {
        if (path.activeTargetIndex >= 0) {
          e.preventDefault();
          path.copySelectedTarget();
        }
      } else if (mod && e.key.toLowerCase() === "v") {
        if (path.clipboard) {
          e.preventDefault();
          path.pasteTarget();
        }
      } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (path.undoStack.length) {
          e.preventDefault();
          path.undo();
        }
      } else if (
        (mod && e.key.toLowerCase() === "y") ||
        (mod && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        if (path.redoStack.length) {
          e.preventDefault();
          path.redo();
        }
      } else if (e.key === "Delete") {
        if (path.activeTargetIndex >= 0 && path.status !== "PLAYING" && path.status !== "PAUSED") {
          e.preventDefault();
          path.removeTarget();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Split pane pointer dragging
  useEffect(() => {
    if (!draggingSplit) return;

    const onMove = (e: PointerEvent) => {
      if (draggingSplit === "sidebar" && mainRowRef.current) {
        const rect = mainRowRef.current.getBoundingClientRect();
        const rightWidth = rect.right - e.clientX;
        setSidebarWidthPx(Math.min(480, Math.max(290, Math.round(rightWidth))));
      } else if (draggingSplit === "console" && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const h = rect.bottom - e.clientY;
        setConsoleHeightPx(Math.min(360, Math.max(100, Math.round(h))));
      }
    };

    const onUp = () => setDraggingSplit(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingSplit]);

  const handleRequestNewProgram = () => {
    if (dirty) {
      setConfirmNewOpen(true);
    } else {
      newProgram();
    }
  };

  const handleSendWebSerial = async () => {
    const nav = navigator as Navigator & {
      serial?: {
        requestPort: (options?: { filters?: Array<{ usbVendorId: number }> }) => Promise<{
          open: (opts: { baudRate: number }) => Promise<void>;
          writable: WritableStream<Uint8Array> | null;
          close: () => Promise<void>;
        }>;
      };
    };
    if (!nav.serial) {
      throw new Error("Web Serial API is not available in this browser.");
    }
    const port = await nav.serial.requestPort({ filters: [{ usbVendorId: 0x1a86 }] });
    await port.open({ baudRate: 115200 });
    const gcode = exportGcodeString();
    const lines = gcode
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(";"));

    const writer = port.writable?.getWriter();
    if (!writer) throw new Error("Serial port is not writable.");

    const encoder = new TextEncoder();
    try {
      for (const line of lines) {
        await writer.write(encoder.encode(`${line}\r\n`));
        appendLog({ dir: "out", text: line });
        await new Promise((r) => setTimeout(r, 40));
      }
      appendLog({ dir: "ok", text: `Streamed ${lines.length} G-code commands via USB Serial.` });
    } finally {
      writer.releaseLock();
      await port.close();
    }
  };

  const safeSlug =
    projectName
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "mirobot-program";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Toolbar
        onRequestRenameProject={() => setRenameProjectOpen(true)}
        onRequestNewProgram={handleRequestNewProgram}
        onRequestDownloadRobot={() => setDownloadModalOpen(true)}
        onRequestOpenHistory={() => setHistoryModalOpen(true)}
        onRequestOpenHardware={() => setHardwareModalOpen(true)}
      />

      {/* Main Workspace: 3D Viewport + Control Sidebar + Collapsible Console */}
      <div ref={workspaceRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={mainRowRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
        >
          {/* Unobstructed 3D Viewport */}
          <div className="min-h-0 min-w-0 flex-1">
            <ViewerCanvas />
          </div>

          {/* Horizontal Resizer (Desktop) */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize workspace and control sidebar"
            tabIndex={0}
            onPointerDown={() => setDraggingSplit("sidebar")}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setSidebarWidthPx((w) => Math.min(480, w + 16));
              if (e.key === "ArrowRight") setSidebarWidthPx((w) => Math.max(290, w - 16));
            }}
            className={`hidden w-1 shrink-0 cursor-col-resize bg-slate-200 transition hover:bg-sky-500/70 md:block dark:bg-slate-800 ${
              draggingSplit === "sidebar" ? "bg-sky-500" : ""
            }`}
          />

          {/* Right Control Sidebar */}
          <div className="h-72 shrink-0 overflow-hidden md:h-full">
            <div className="hidden h-full md:block" style={{ width: `${sidebarWidthPx}px` }}>
              <ControlSidebar
                onRequestRenameTarget={(index, name) =>
                  setRenameTargetState({ open: true, index, name })
                }
                onRequestClearTargets={() => setConfirmClearOpen(true)}
              />
            </div>
            <div className="h-full md:hidden">
              <ControlSidebar
                onRequestRenameTarget={(index, name) =>
                  setRenameTargetState({ open: true, index, name })
                }
                onRequestClearTargets={() => setConfirmClearOpen(true)}
              />
            </div>
          </div>
        </div>

        {/* Vertical Resizer (only when console is expanded) */}
        {consoleExpanded && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize console height"
            tabIndex={0}
            onPointerDown={() => setDraggingSplit("console")}
            className={`flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-slate-200 transition hover:bg-sky-500/60 dark:bg-slate-800 ${
              draggingSplit === "console" ? "bg-sky-500" : ""
            }`}
          />
        )}

        {/* Collapsible Bottom Console */}
        <div
          style={{ height: consoleExpanded ? `${consoleHeightPx}px` : "36px" }}
          className="shrink-0 overflow-hidden transition-[height] duration-150"
        >
          <SerialConsole
            expanded={consoleExpanded}
            onToggleExpand={() => setConsoleExpanded((v) => !v)}
          />
        </div>
      </div>

      <StatusBar />

      {/* Modals */}
      <TextPromptModal
        open={renameProjectOpen}
        title="Rename Project"
        description="Enter a new project name for your Mirobot simulation."
        initialValue={projectName}
        confirmLabel="Rename"
        onConfirm={(next) => {
          setProjectName(next, true);
          appendLog({ dir: "sys", text: `Renamed project to "${next}"` });
        }}
        onClose={() => setRenameProjectOpen(false)}
      />

      <TextPromptModal
        open={renameTargetState.open}
        title="Rename Waypoint"
        description="Enter a new label for the selected waypoint."
        initialValue={renameTargetState.name}
        confirmLabel="Rename"
        onConfirm={(next) => renameTarget(renameTargetState.index, next)}
        onClose={() => setRenameTargetState({ open: false, index: -1, name: "" })}
      />

      <ConfirmModal
        open={confirmClearOpen}
        title="Clear All Waypoints?"
        message="This removes all waypoints from the current path (you can still Undo)."
        confirmLabel="Clear All"
        danger
        onConfirm={() => clearTargets()}
        onClose={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        open={confirmNewOpen}
        title="Start New Program?"
        message="You have unsaved changes. Starting a new program will save a backup to Work History first, then reset your workspace."
        confirmLabel="Backup & Start New"
        onConfirm={() => {
          saveToHistory("Auto-backup before New");
          newProgram();
        }}
        onClose={() => setConfirmNewOpen(false)}
      />

      <HistoryModal
        open={historyModalOpen}
        entries={historyEntries}
        isDirty={dirty}
        onSaveNow={() => saveToHistory("Manual snapshot")}
        onRestore={(id) => restoreFromHistory(id)}
        onDelete={(id) => deleteFromHistory(id)}
        onClearAll={() => clearHistory()}
        onClose={() => setHistoryModalOpen(false)}
      />

      <HardwareModal
        open={hardwareModalOpen}
        onClose={() => setHardwareModalOpen(false)}
      />

      <DownloadRobotModal
        open={downloadModalOpen}
        gcodePreview={exportGcodeString()}
        targetCount={targets.length}
        onDownloadGcode={() => {
          triggerTextDownload(`${safeSlug}.gcode`, exportGcodeString(), "text/plain");
          appendLog({ dir: "ok", text: `[PATH] Exported ${safeSlug}.gcode` });
        }}
        onSendWebSerial={handleSendWebSerial}
        onClose={() => setDownloadModalOpen(false)}
      />
    </div>
  );
}
