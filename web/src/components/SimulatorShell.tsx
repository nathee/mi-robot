"use client";

import { useEffect, useRef, useState } from "react";
import { usePathStore } from "@/stores/usePathStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { ControlSidebar } from "./ControlSidebar";
import { ConfirmModal, DownloadRobotModal, TextPromptModal } from "./Modals";
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

  const [sidebarPct, setSidebarPct] = useState(26);
  const [viewerRowPct, setViewerRowPct] = useState(78);
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

  const projectName = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const setProjectName = useProjectStore((s) => s.setName);
  const targets = usePathStore((s) => s.targets);
  const exportGcodeString = usePathStore((s) => s.exportGcodeString);
  const newProgram = usePathStore((s) => s.newProgram);
  const clearTargets = usePathStore((s) => s.clearTargets);
  const renameTarget = usePathStore((s) => s.renameTarget);
  const appendLog = useSerialStore((s) => s.appendLog);

  // Initialize theme from localStorage
  useEffect(() => {
    useThemeStore.getState().init();
  }, []);

  // Global Path Keyboard Shortcuts (matching V2.4.7)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
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
        const pct = Math.min(46, Math.max(18, (rightWidth / rect.width) * 100));
        setSidebarPct(pct);
      } else if (draggingSplit === "console" && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const topHeight = e.clientY - rect.top;
        const pct = Math.min(92, Math.max(45, (topHeight / rect.height) * 100));
        setViewerRowPct(pct);
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
    if (dirty && targets.length > 0) {
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
      />

      {/* Main Vertical Split: (Viewer + Sidebar) over Console */}
      <div ref={workspaceRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={mainRowRef}
          style={{ height: `${viewerRowPct}%` }}
          className="flex min-h-0 w-full flex-col overflow-hidden md:flex-row"
        >
          {/* 3D Viewport */}
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
              if (e.key === "ArrowLeft") setSidebarPct((p) => Math.min(46, p + 2));
              if (e.key === "ArrowRight") setSidebarPct((p) => Math.max(18, p - 2));
            }}
            className={`hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-slate-200 transition hover:bg-sky-500/60 md:flex dark:bg-slate-800 ${
              draggingSplit === "sidebar" ? "bg-sky-500" : ""
            }`}
          />

          {/* Control Sidebar */}
          <div
            style={{ width: undefined }}
            className="h-72 shrink-0 overflow-hidden md:h-full"
          >
            <div
              className="hidden h-full md:block"
              style={{ width: `clamp(290px, ${sidebarPct}vw, 520px)` }}
            >
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

        {/* Vertical Resizer (Viewer vs Console) */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize simulator and console"
          tabIndex={0}
          onPointerDown={() => setDraggingSplit("console")}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") setViewerRowPct((p) => Math.max(45, p - 3));
            if (e.key === "ArrowDown") setViewerRowPct((p) => Math.min(92, p + 3));
          }}
          className={`flex h-2 shrink-0 cursor-row-resize items-center justify-center bg-slate-200 transition hover:bg-sky-500/50 dark:bg-slate-800 ${
            draggingSplit === "console" ? "bg-sky-500" : ""
          }`}
        >
          <span className="h-0.5 w-10 rounded-full bg-slate-400/70 dark:bg-slate-500" />
        </div>

        {/* Bottom Console */}
        <div style={{ height: `${100 - viewerRowPct}%` }} className="min-h-0 overflow-hidden">
          <SerialConsole />
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
        title="Rename Target"
        description="Enter a new label for the selected taught target."
        initialValue={renameTargetState.name}
        confirmLabel="Rename"
        onConfirm={(next) => renameTarget(renameTargetState.index, next)}
        onClose={() => setRenameTargetState({ open: false, index: -1, name: "" })}
      />

      <ConfirmModal
        open={confirmClearOpen}
        title="Clear All Targets?"
        message="This removes all taught path targets from the current program (you can still Undo)."
        confirmLabel="Clear All"
        danger
        onConfirm={() => clearTargets()}
        onClose={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        open={confirmNewOpen}
        title="Start New Program?"
        message="You have unsaved changes in the current path program. Discard them and start fresh?"
        confirmLabel="Discard & New"
        danger
        onConfirm={() => newProgram()}
        onClose={() => setConfirmNewOpen(false)}
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
