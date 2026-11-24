import { create } from "zustand";
import {
  DEFAULT_DLS_CONFIG,
  DEFAULT_WORKSPACE,
  type DlsConfig,
  type IkSolverType,
  type WorkspaceConfig,
} from "@/lib/kinematics/constants";

export type PoseMode = "JOINT" | "IK";
export type SidebarPanel = "JOG" | "TOOLS" | "PATH" | "CODE";
export type TcpTransformMode = "translate" | "rotate";

export interface FrameAxesVisibility {
  xNeg: boolean;
  xPos: boolean;
  yNeg: boolean;
  yPos: boolean;
  zNeg: boolean;
  zPos: boolean;
}

export interface AxisColors {
  x: string;
  y: string;
  z: string;
}

export interface ViewerState {
  // Display toggles
  showGrid: boolean;
  showZGrid: boolean;
  showWorldFrame: boolean;
  showLinkFrames: boolean;
  linkFrameVisibility: boolean[];
  showTcpFrame: boolean;
  showTcpValue: boolean;
  showWorkspace: boolean;
  showWorkcell: boolean;
  showPath: boolean;
  showPoints: boolean;
  showPointFrames: boolean;
  showLabels: boolean;
  frameAxes: FrameAxesVisibility;
  colors: AxisColors;

  // Geometry & label sizing
  frameLen: number;
  frameWidth: number;
  frameHeadRadius: number;
  linearJogWidth: number;
  linearJogLen: number;
  linearJogHeadRadius: number;
  jointJogWidth: number;
  jointJogLen: number;
  jointJogHead: number;
  jointJogIconSize: number;
  sceneBrightness: number;
  gridFontSize: number;
  labelFontSize: number;
  axisFontSize: number;
  subscriptFontSize: number;

  // Control & IK settings
  poseMode: PoseMode;
  sidebarPanel: SidebarPanel;
  workspace: WorkspaceConfig;
  ikAutoApply: boolean;
  enableTcpMouseDrag: boolean;
  tcpTransformMode: TcpTransformMode;
  tcpDragScale: number;
  tcpGizmoSize: number;
  ikSolver: IkSolverType;
  dls: DlsConfig;

  // Actions
  setField: <K extends keyof ViewerDataFields>(key: K, value: ViewerDataFields[K]) => void;
  setControlMode: (mode: "JOINT" | "IK_MOVE" | "IK_ROTATE") => void;
  setLinkFrameVisible: (index: number, visible: boolean) => void;
  setFrameAxisVisible: (axis: keyof FrameAxesVisibility, visible: boolean) => void;
  setAxisColor: (axis: keyof AxisColors, color: string) => void;
  setDlsConfig: (partial: Partial<DlsConfig>) => void;
}

type ViewerDataFields = Omit<
  ViewerState,
  | "setField"
  | "setControlMode"
  | "setLinkFrameVisible"
  | "setFrameAxisVisible"
  | "setAxisColor"
  | "setDlsConfig"
>;

export const useViewerStore = create<ViewerState>((set) => ({
  showGrid: true,
  showZGrid: false,
  showWorldFrame: false,
  showLinkFrames: false,
  linkFrameVisibility: [true, true, true, true, true, true],
  showTcpFrame: true,
  showTcpValue: false,
  showWorkspace: true,
  showWorkcell: true,
  showPath: true,
  showPoints: true,
  showPointFrames: false,
  showLabels: true,
  frameAxes: {
    xNeg: false,
    xPos: true,
    yNeg: false,
    yPos: true,
    zNeg: false,
    zPos: true,
  },
  colors: { x: "#ff4d4d", y: "#37d67a", z: "#4ea1ff" },

  frameLen: 0.08,
  frameWidth: 0.003,
  frameHeadRadius: 0.009,
  linearJogWidth: 0.01,
  linearJogLen: 0.08,
  linearJogHeadRadius: 0.052,
  jointJogWidth: 0.018,
  jointJogLen: 0.56,
  jointJogHead: 0.15,
  jointJogIconSize: 0.2,
  sceneBrightness: 2.75,
  gridFontSize: 14,
  labelFontSize: 14,
  axisFontSize: 18,
  subscriptFontSize: 16,

  poseMode: "JOINT",
  sidebarPanel: "JOG",
  workspace: { ...DEFAULT_WORKSPACE },
  ikAutoApply: true,
  enableTcpMouseDrag: true,
  tcpTransformMode: "translate",
  tcpDragScale: 0.25,
  tcpGizmoSize: 1.75,
  ikSolver: "CONSTRAINED",
  dls: { ...DEFAULT_DLS_CONFIG },

  setField(key, value) {
    set({ [key]: value } as Partial<ViewerState>);
  },

  setControlMode(mode) {
    if (mode === "JOINT") {
      set({ poseMode: "JOINT" });
    } else if (mode === "IK_MOVE") {
      set({ poseMode: "IK", enableTcpMouseDrag: true, tcpTransformMode: "translate" });
    } else {
      set({ poseMode: "IK", enableTcpMouseDrag: true, tcpTransformMode: "rotate" });
    }
  },

  setLinkFrameVisible(index, visible) {
    set((state) => {
      const next = state.linkFrameVisibility.slice();
      if (index >= 0 && index < next.length) next[index] = visible;
      return { linkFrameVisibility: next };
    });
  },

  setFrameAxisVisible(axis, visible) {
    set((state) => ({
      frameAxes: { ...state.frameAxes, [axis]: visible },
    }));
  },

  setAxisColor(axis, color) {
    set((state) => ({
      colors: { ...state.colors, [axis]: color },
    }));
  },

  setDlsConfig(partial) {
    set((state) => ({
      dls: { ...state.dls, ...partial },
    }));
  },
}));
