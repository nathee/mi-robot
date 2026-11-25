"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useCodeStore } from "@/stores/useCodeStore";
import { useHistoryStore } from "@/stores/useHistoryStore";
import { usePathStore } from "@/stores/usePathStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useRobotModelStore } from "@/stores/useRobotModelStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useSerialStore } from "@/stores/useSerialStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useViewerStore } from "@/stores/useViewerStore";
import { useWorkcellStore } from "@/stores/useWorkcellStore";
import { ControlSidebar } from "./ControlSidebar";
import { getActiveRobotProfile } from "@/lib/kinematics/constants";
import { HardwareModal } from "./HardwareModal";
import { ConfirmModal, DownloadRobotModal, HistoryModal, TextPromptModal } from "./Modals";
import { SerialConsole } from "./SerialConsole";
import { StatusBar } from "./StatusBar";
import { Toolbar, triggerTextDownload } from "./Toolbar";
import { ViewerCanvas } from "./ViewerCanvas";
import { XarmHardwareModal } from "./XarmHardwareModal";
import { useT } from "@/lib/i18n/useT";
import { t as tNow } from "@/lib/i18n";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function SimulatorShell() {
  const t = useT();
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const mainRowRef = useRef<HTMLDivElement | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidthPx, setSidebarWidthPx] = useState(408);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [consoleHeightPx, setConsoleHeightPx] = useState(190);
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
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);

  const anyModalOpen =
    renameProjectOpen ||
    renameTargetState.open ||
    confirmClearOpen ||
    confirmNewOpen ||
    confirmResetOpen ||
    downloadModalOpen ||
    historyModalOpen ||
    hardwareModalOpen;

  const projectName = useProjectStore((s) => s.name);
  const dirty = useProjectStore((s) => s.dirty);
  const setProjectName = useProjectStore((s) => s.setName);
  const historyEntries = useHistoryStore((s) => s.entries);
  const saveToHistory = useHistoryStore((s) => s.saveToHistory);
  const restoreFromHistory = useHistoryStore((s) => s.restoreFromHistory);
  const deleteFromHistory = useHistoryStore((s) => s.deleteFromHistory);
  const clearHistory = useHistoryStore((s) => s.clearHistory);
  const resetWorkspace = useHistoryStore((s) => s.resetWorkspace);
  const targets = usePathStore((s) => s.targets);
  const exportGcodeString = usePathStore((s) => s.exportGcodeString);
  const getCodeGcode = useCodeStore((s) => s.getExportableGcode);
  const newProgram = usePathStore((s) => s.newProgram);
  const clearTargets = usePathStore((s) => s.clearTargets);
  const renameTarget = usePathStore((s) => s.renameTarget);
  const appendLog = useSerialStore((s) => s.appendLog);

  // Initialize theme, console ready log, and restore previous session from localStorage
  useEffect(() => {
    useThemeStore.getState().init();
    useLocaleStore.getState().init();
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
      useWorkcellStore.subscribe(scheduleAutosave),
    ];

    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);

  // Global Keyboard Shortcuts (Ctrl+S save, Ctrl+B toggle panel, Path shortcuts)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (useRobotModelStore.getState().selecting) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "s") {
        e.preventDefault();
        useHistoryStore.getState().saveToHistory(tNow("history.ctrlS"));
        return;
      }

      if (mod && key === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }

      if (anyModalOpen || isEditableTarget(e.target)) return;
      const path = usePathStore.getState();

      if (mod && key === "i") {
        e.preventDefault();
        path.teachTarget();
      } else if (mod && key === "c") {
        if (path.activeTargetIndex >= 0) {
          e.preventDefault();
          path.copySelectedTarget();
        }
      } else if (mod && key === "v") {
        if (path.clipboard) {
          e.preventDefault();
          path.pasteTarget();
        }
      } else if (mod && (key === "z" || key === "y")) {
        // Undo/redo belongs to the editor on screen: Blocks when the Code tab shows Blocks, else Path.
        const redo = key === "y" || e.shiftKey;
        const code = useCodeStore.getState();
        if (useViewerStore.getState().sidebarPanel === "CODE" && code.mode === "BLOCKS") {
          e.preventDefault();
          if (redo) code.redoBlocks();
          else code.undoBlocks();
        } else if (redo ? path.redoStack.length : path.undoStack.length) {
          e.preventDefault();
          if (redo) path.redo();
          else path.undo();
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
  }, [anyModalOpen]);

  // Split pane pointer dragging
  useEffect(() => {
    if (!draggingSplit) return;

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = draggingSplit === "sidebar" ? "col-resize" : "row-resize";

    const onMove = (e: PointerEvent) => {
      if (draggingSplit === "sidebar" && mainRowRef.current) {
        const rect = mainRowRef.current.getBoundingClientRect();
        const rightWidth = rect.right - e.clientX;
        setSidebarWidthPx(Math.min(620, Math.max(340, Math.round(rightWidth))));
      } else if (draggingSplit === "console" && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const h = rect.bottom - e.clientY;
        setConsoleHeightPx(Math.min(400, Math.max(120, Math.round(h))));
      }
    };

    const onUp = () => setDraggingSplit(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = prevCursor;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingSplit]);

  const handleRequestNewProgram = () => {
    if (dirty) {
      setConfirmNewOpen(true);
    } else {
      newProgram();
    }
  };

  // Resolve exportable G-code: prefer Path waypoints when present, otherwise Code program
  const resolvedGcode = (() => {
    if (targets.length > 0) {
      return { source: "path" as const, gcode: exportGcodeString(), count: targets.length };
    }
    const codeGcode = downloadModalOpen ? getCodeGcode() : null;
    if (codeGcode) {
      const lineCount = codeGcode.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith(";")).length;
      return { source: "code" as const, gcode: codeGcode, count: lineCount };
    }
    return { source: "path" as const, gcode: "", count: 0 };
  })();

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
      throw new Error(t("log.webSerialUnavailable"));
    }
    const port = await nav.serial.requestPort({ filters: [{ usbVendorId: 0x1a86 }] });
    await port.open({ baudRate: 115200 });
    const gcode = resolvedGcode.gcode;
    const lines = gcode
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(";"));

    const writer = port.writable?.getWriter();
    if (!writer) throw new Error(t("log.serialNotWritable"));

    const encoder = new TextEncoder();
    try {
      for (const line of lines) {
        await writer.write(encoder.encode(`${line}\r\n`));
        appendLog({ dir: "out", text: line });
        await new Promise((r) => setTimeout(r, 40));
      }
      appendLog({ dir: "ok", text: t("log.streamed", { n: lines.length }) });
    } finally {
      writer.releaseLock();
      await port.close();
    }
  };

  const safeSlug =
    projectName
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "") || `${useRobotModelStore.getState().loadedModel ?? "mirobot"}-program`;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Toolbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onRequestRenameProject={() => setRenameProjectOpen(true)}
        onRequestNewProgram={handleRequestNewProgram}
        onRequestDownloadRobot={() => setDownloadModalOpen(true)}
        onRequestOpenHistory={() => setHistoryModalOpen(true)}
        onRequestOpenHardware={() => setHardwareModalOpen(true)}
        onRequestResetWorkspace={() => setConfirmResetOpen(true)}
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

          {sidebarOpen && (
            <>
              {/* Horizontal Resizer (Desktop) */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("shell.resizeSidebar")}
                tabIndex={0}
                onPointerDown={() => setDraggingSplit("sidebar")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setSidebarWidthPx((w) => Math.min(620, w + 16));
                  if (e.key === "ArrowRight") setSidebarWidthPx((w) => Math.max(340, w - 16));
                }}
                className={`hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200/80 transition hover:bg-sky-500/70 md:block dark:bg-slate-800/90 ${
                  draggingSplit === "sidebar" ? "bg-sky-500" : ""
                }`}
              />

              {/* Single Mounted Right Control Sidebar */}
              <div
                style={{ "--sidebar-w": `${sidebarWidthPx}px` } as CSSProperties}
                className="h-80 w-full shrink-0 overflow-hidden md:h-full md:w-[var(--sidebar-w)]"
              >
                <ControlSidebar
                  onRequestRenameTarget={(index, name) =>
                    setRenameTargetState({ open: true, index, name })
                  }
                  onRequestClearTargets={() => setConfirmClearOpen(true)}
                />
              </div>
            </>
          )}
        </div>

        {/* Vertical Resizer (only when console is expanded) */}
        {consoleExpanded && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t("shell.resizeConsole")}
            tabIndex={0}
            onPointerDown={() => setDraggingSplit("console")}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") setConsoleHeightPx((h) => Math.min(360, h + 16));
              if (e.key === "ArrowDown") setConsoleHeightPx((h) => Math.max(100, h - 16));
            }}
            className={`flex h-1 shrink-0 cursor-row-resize items-center justify-center bg-slate-200/90 transition hover:bg-sky-500/70 dark:bg-slate-800 ${
              draggingSplit === "console" ? "bg-sky-500" : ""
            }`}
          />
        )}

        {/* Collapsible Bottom Console */}
        <div
          style={{ height: consoleExpanded ? `${consoleHeightPx}px` : "40px" }}
          className={`shrink-0 overflow-hidden ${
            draggingSplit === "console" ? "" : "transition-[height] duration-150"
          }`}
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
        title={t("shell.renameProject")}
        description={t("shell.renameProjectDesc")}
        initialValue={projectName}
        confirmLabel={t("shell.rename")}
        onConfirm={(next) => {
          setProjectName(next, true);
          appendLog({ dir: "sys", text: t("log.renamedProject", { name: next }) });
        }}
        onClose={() => setRenameProjectOpen(false)}
      />

      <TextPromptModal
        open={renameTargetState.open}
        title={t("shell.renameWaypoint")}
        description={t("shell.renameWaypointDesc")}
        initialValue={renameTargetState.name}
        confirmLabel={t("shell.rename")}
        onConfirm={(next) => renameTarget(renameTargetState.index, next)}
        onClose={() => setRenameTargetState({ open: false, index: -1, name: "" })}
      />

      <ConfirmModal
        open={confirmClearOpen}
        title={t("shell.clearTitle")}
        message={t("shell.clearMessage")}
        confirmLabel={t("shell.clearAll")}
        danger
        onConfirm={() => clearTargets()}
        onClose={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        open={confirmNewOpen}
        title={t("shell.newTitle")}
        message={t("shell.newMessage")}
        confirmLabel={t("shell.newConfirm")}
        onConfirm={() => {
          saveToHistory(t("history.backupBeforeNew"));
          newProgram();
        }}
        onClose={() => setConfirmNewOpen(false)}
      />

      <ConfirmModal
        open={confirmResetOpen}
        title={t("shell.resetTitle")}
        message={t("shell.resetMessage")}
        confirmLabel={t("shell.resetConfirm")}
        danger
        onConfirm={() => resetWorkspace()}
        onClose={() => setConfirmResetOpen(false)}
      />

      <HistoryModal
        open={historyModalOpen}
        entries={historyEntries}
        isDirty={dirty}
        onSaveNow={() => saveToHistory(t("history.manualSnapshot"))}
        onRestore={(id) => restoreFromHistory(id)}
        onDelete={(id) => deleteFromHistory(id)}
        onClearAll={() => clearHistory()}
        onClose={() => setHistoryModalOpen(false)}
      />

      {getActiveRobotProfile().hardwareDriver === "HIWONDER_BUS_SERVO" ? (
        <XarmHardwareModal open={hardwareModalOpen} onClose={() => setHardwareModalOpen(false)} />
      ) : (
        <HardwareModal open={hardwareModalOpen} onClose={() => setHardwareModalOpen(false)} />
      )}

      <DownloadRobotModal
        open={downloadModalOpen}
        gcodePreview={resolvedGcode.gcode}
        targetCount={resolvedGcode.count}
        sourceLabel={resolvedGcode.source === "code" ? t("modal.sourceCode") : t("modal.sourceWaypoints")}
        onDownloadGcode={() => {
          triggerTextDownload(`${safeSlug}.gcode`, resolvedGcode.gcode, "text/plain");
          appendLog({ dir: "ok", text: `[ROBOT] ${t("log.exported", { file: `${safeSlug}.gcode` })}` });
        }}
        onSendWebSerial={handleSendWebSerial}
        onClose={() => setDownloadModalOpen(false)}
      />
    </div>
  );
}
