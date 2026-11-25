/**
 * English UI strings — the source of truth for message keys. Keys are flat and dotted
 * (`panel.thing`); `{name}` placeholders are filled by `translate()`. Add a key here first,
 * then the same key to `th.ts` (typecheck fails until you do).
 */
export const en = {
  "lang.en": "English",
  "lang.th": "ไทย",
  "lang.switch": "Language",

  "toolbar.home": "Home",
  "toolbar.homeTitle": "Return robot to Home position ({joints})",
  "toolbar.themeLight": "Light theme",
  "toolbar.themeDark": "Dark theme",
  "toolbar.themeAuto": "Auto theme",
  "toolbar.clickToSwitch": "{label} — click to switch",
  "toolbar.hidePanel": "Hide control panel",
  "toolbar.showPanel": "Show control panel",

  // Toolbar
  "toolbar.switchRobot": "{name} — click to switch robot arm",
  "toolbar.renameProject": "Click to rename project",
  "toolbar.unsaved": "Unsaved changes — press Ctrl+S or click Save",
  "toolbar.saved": "Saved",
  "toolbar.save": "Save",
  "toolbar.hwBusTitle": "Connect the real arm over USB",
  "toolbar.hwRs485Title": "Connect USB-RS485 or ESP32 Wi-Fi",
  "toolbar.realArm": "Real arm",
  "toolbar.saveTitle": "Save snapshot to Work History (Ctrl+S)",
  "toolbar.historyTitle": "Work History — view and restore snapshots",
  "toolbar.program": "Program",
  "toolbar.newProgram": "New Program",
  "toolbar.open": "Open JSON / G-code…",
  "toolbar.downloadJson": "Download Project (.json)",
  "toolbar.exportGcode": "Export WLKATA G-code",
  "toolbar.sendToRobot": "Send to Robot (USB / File)",
  "toolbar.resetWorkspace": "Reset Workspace…",
  "history.exportedGcode": "Exported G-code",
  "history.savedJson": "Saved JSON",
  "history.opened": "Opened {file}",
  "history.manualSave": "Manual save",
  "log.exportNothing": "Nothing valid to export as G-code.",
  "log.saved": "Saved {file}",
  "log.loadFailed": "Failed to load file",

  // StatusBar
  "status.orbit": "Orbit",
  "status.pan": "Pan",
  "status.scroll": "Scroll",
  "status.zoom": "Zoom",
  "status.vendor": "eleccom.in.th, Thailand",

  // ControlSidebar
  "sidebar.manual": "Manual",
  "sidebar.tools": "Tools",
  "sidebar.path": "Path",
  "sidebar.code": "Code",
  "sidebar.panels": "Control panels",
  "common.running": "Running",

  // TurnstileGate
  "turnstile.failed": "Verification failed. Please try again.",
  "turnstile.unreachable": "Could not reach the server. Check your connection and try again.",
  "turnstile.error": "The security check hit an error. Please retry.",
  "turnstile.expired": "The check expired. Please verify again.",
  "turnstile.loadFailed": "Could not load the security check. Disable blockers for challenges.cloudflare.com and retry.",
  "turnstile.prompt": "Confirm you are human to open the simulator.",
  "turnstile.loading": "Loading security check…",
  "turnstile.verifying": "Verifying…",
  "common.retry": "Retry",

  // RobotSelectScreen
  "common.close": "Close",
  "common.cancel": "Cancel",
  "robot.summary.mirobot": "6-axis desktop arm with stepper motors and interchangeable tools",
  "robot.summary.xarm2": "5-axis bus-servo arm with a built-in gripper",
  "robotSelect.switchTitle": "Switch robot arm",
  "robotSelect.chooseTitle": "Choose a robot arm",
  "robotSelect.robotArm": "Robot arm",
  "robotSelect.axes": "{n} axes",
  "robotSelect.axesGripper": "{n} axes + gripper",
  "robotSelect.reach": "~{mm} mm reach",
  "robotSelect.current": "Current",
  "robotSelect.remember": "Open this robot directly next time",
  "robotSelect.switching": "Switching…",
  "robotSelect.switchRobot": "Switch robot",
  "robotSelect.open": "Open {name}",
  "robotSelect.reloadNote": "The simulator reloads for the new robot. Each robot keeps its own session and work history, so your {name} program is saved and comes back when you switch back.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
