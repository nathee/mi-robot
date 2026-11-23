import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Spherical,
  Sprite,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LINK_NAMES } from "@/lib/kinematics/constants";
import { finiteOr, forwardTxRxTzRz } from "@/lib/kinematics/fk";
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useViewerStore } from "@/stores/useViewerStore";
import {
  applyFrameAxesVisibility,
  buildFrameGroup,
  buildGridSet,
  createFrameLabelWithLeader,
  createTcpCoordLabelSprite,
  frameIndexSubscript,
  updateLinkFrameLabelLayout,
  updateTcpCoordLabelSprite,
  type FrameLabelEntry,
  type GridBuildOutput,
} from "./framesAndLabels";
import { createGizmoController, type GizmoController } from "./gizmos";
import { rebuildPathVisualGroup } from "./pathVisuals";
import { disposeObjectTree, loadMirobotSTLs } from "./stlLoader";
import { applyWorkspaceHighlight, buildWorkspaceGroup } from "./workspaceMesh";

export type ViewAxisKey = "x+" | "x-" | "y+" | "y-" | "z+" | "z-";

export interface ViewGizmoProjection {
  axes: Array<{
    key: ViewAxisKey;
    axis: "x" | "y" | "z";
    negative: boolean;
    label: string;
    x: number;
    y: number;
    z: number;
  }>;
}

export class MirobotSceneEngine {
  private container: HTMLElement;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;
  private controls: OrbitControls;
  private keyLight: DirectionalLight;
  private ambientLight: AmbientLight;
  private hemisphereLight: HemisphereLight;

  private robotGroup: Group;
  private linkMeshes = new Map<string, Object3D>();
  private linkFrames = new Map<string, Group>();
  private linkLabels: FrameLabelEntry[] = [];
  private worldFrame: Group | null = null;
  private tcpFrame: Group | null = null;
  private tcpCoordLabel: Sprite | null = null;
  private gridSet: GridBuildOutput | null = null;
  private workspaceGroup: Group | null = null;
  private pathGroup: Group;
  private gizmos: GizmoController;

  private resizeObserver: ResizeObserver;
  private animFrameId = 0;
  private lastFrameTs = 0;
  private unsubscribers: Array<() => void> = [];
  private onViewGizmoUpdate?: (proj: ViewGizmoProjection) => void;
  private onLoaded?: () => void;
  private disposed = false;

  constructor(
    container: HTMLElement,
    callbacks: {
      onViewGizmoUpdate?: (proj: ViewGizmoProjection) => void;
      onLoaded?: () => void;
    } = {}
  ) {
    this.container = container;
    this.onViewGizmoUpdate = callbacks.onViewGizmoUpdate;
    this.onLoaded = callbacks.onLoaded;

    // Enforce Z-up robotics convention
    Object3D.DEFAULT_UP.set(0, 0, 1);

    this.scene = new Scene();
    this.scene.up.set(0, 0, 1);

    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    this.camera = new PerspectiveCamera(1, w / h, 0.1, 2000);
    this.camera.position.set(0, 0, 50);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.keyLight = new DirectionalLight(0xffffff, 0.9);
    this.keyLight.position.set(1.5, 1.8, 1.2);
    this.ambientLight = new AmbientLight(0xffffff, 0.25);
    this.hemisphereLight = new HemisphereLight(0xf4f9ff, 0x697385, 0.3);
    this.scene.add(this.keyLight, this.ambientLight, this.hemisphereLight);

    this.robotGroup = new Group();
    this.robotGroup.name = "mirobotArm";
    this.scene.add(this.robotGroup);

    this.pathGroup = new Group();
    this.pathGroup.name = "taughtTargetsAndPath";
    this.scene.add(this.pathGroup);

    this.gizmos = createGizmoController({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      orbitControls: this.controls,
    });

    this.applyTheme();
    this.bindStoreSubscriptions();

    loadMirobotSTLs(this.robotGroup).then(({ links }) => {
      if (this.disposed) return;
      this.linkMeshes = links;
      this.applyCurrentLinkTransforms();
      this.rebuildFramesAndLabels();
      this.rebuildPathVisuals();
      this.applyVisibility();
      this.fitCamera();
      this.onLoaded?.();
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.lastFrameTs = performance.now();
    this.animate(this.lastFrameTs);
  }

  private bindStoreSubscriptions(): void {
    this.unsubscribers.push(
      useThemeStore.subscribe(() => {
        this.applyTheme();
      })
    );

    this.unsubscribers.push(
      useViewerStore.subscribe((state, prev) => {
        if (
          state.frameLen !== prev.frameLen ||
          state.frameWidth !== prev.frameWidth ||
          state.frameHeadRadius !== prev.frameHeadRadius ||
          state.colors !== prev.colors ||
          state.axisFontSize !== prev.axisFontSize ||
          state.subscriptFontSize !== prev.subscriptFontSize ||
          state.labelFontSize !== prev.labelFontSize
        ) {
          this.rebuildFramesAndLabels();
        }
        if (state.gridFontSize !== prev.gridFontSize || state.colors !== prev.colors) {
          this.rebuildGrid();
        }
        if (state.sceneBrightness !== prev.sceneBrightness) {
          this.applySceneBrightness();
        }
        if (
          state.showPath !== prev.showPath ||
          state.showPoints !== prev.showPoints ||
          state.showPointFrames !== prev.showPointFrames ||
          state.showLabels !== prev.showLabels ||
          state.frameAxes !== prev.frameAxes
        ) {
          this.rebuildPathVisuals();
        }
        if (
          state.poseMode !== prev.poseMode ||
          state.enableTcpMouseDrag !== prev.enableTcpMouseDrag ||
          state.tcpTransformMode !== prev.tcpTransformMode ||
          state.tcpGizmoSize !== prev.tcpGizmoSize
        ) {
          if (state.poseMode === "IK" && prev.poseMode !== "IK") {
            useRobotStore.getState().syncIkTargetFromJoints();
          }
          this.gizmos.applyVisibilityAndSettings();
        }
        this.applyVisibility();
      })
    );

    this.unsubscribers.push(
      useRobotStore.subscribe((state, prev) => {
        if (state.workspaceStatus.out !== prev.workspaceStatus.out) {
          applyWorkspaceHighlight(this.workspaceGroup, state.workspaceStatus.out);
        }
      })
    );

    this.unsubscribers.push(
      usePathStore.subscribe((state, prev) => {
        if (
          state.targets !== prev.targets ||
          state.activeTargetIndex !== prev.activeTargetIndex ||
          state.settings.motionType !== prev.settings.motionType
        ) {
          this.rebuildPathVisuals();
        }
      })
    );
  }

  private isDark(): boolean {
    return useThemeStore.getState().isDark;
  }

  private rebuildGrid(): void {
    if (this.gridSet) {
      this.scene.remove(
        this.gridSet.xyGrid,
        this.gridSet.zGrid,
        this.gridSet.xyAxes,
        this.gridSet.zAxes,
        this.gridSet.xyLabels,
        this.gridSet.zLabels
      );
      disposeObjectTree(this.gridSet.xyAxes);
      disposeObjectTree(this.gridSet.zAxes);
      disposeObjectTree(this.gridSet.xyLabels);
      disposeObjectTree(this.gridSet.zLabels);
    }

    const isDark = this.isDark();
    const viewer = useViewerStore.getState();
    this.gridSet = buildGridSet({
      gridMain: isDark ? 0x333a40 : 0x8e9ba3,
      gridSub: isDark ? 0x2a2f34 : 0xbec9ce,
      colors: viewer.colors,
      isDark,
      gridFontSize: viewer.gridFontSize,
    });

    this.scene.add(
      this.gridSet.xyGrid,
      this.gridSet.zGrid,
      this.gridSet.xyAxes,
      this.gridSet.zAxes,
      this.gridSet.xyLabels,
      this.gridSet.zLabels
    );
  }

  private rebuildWorkspace(): void {
    if (this.workspaceGroup) {
      this.scene.remove(this.workspaceGroup);
      disposeObjectTree(this.workspaceGroup);
    }
    this.workspaceGroup = buildWorkspaceGroup(
      useViewerStore.getState().workspace,
      this.isDark()
    );
    this.scene.add(this.workspaceGroup);
    applyWorkspaceHighlight(this.workspaceGroup, useRobotStore.getState().workspaceStatus.out);
  }

  private rebuildFramesAndLabels(): void {
    const viewer = useViewerStore.getState();
    const isDark = this.isDark();

    // Remove old world frame
    if (this.worldFrame) {
      this.scene.remove(this.worldFrame);
      disposeObjectTree(this.worldFrame);
      this.worldFrame = null;
    }

    // Remove old link frames & labels
    this.linkFrames.forEach((grp) => {
      grp.parent?.remove(grp);
      disposeObjectTree(grp);
    });
    this.linkFrames.clear();

    this.linkLabels.forEach((entry) => {
      this.scene.remove(entry.group);
      disposeObjectTree(entry.group);
    });
    this.linkLabels = [];

    if (this.tcpFrame) {
      this.tcpFrame.parent?.remove(this.tcpFrame);
      disposeObjectTree(this.tcpFrame);
      this.tcpFrame = null;
    }
    if (this.tcpCoordLabel) {
      this.scene.remove(this.tcpCoordLabel);
      disposeObjectTree(this.tcpCoordLabel);
      this.tcpCoordLabel = null;
    }

    // World frame F0
    this.worldFrame = buildFrameGroup({
      len: viewer.frameLen,
      width: viewer.frameWidth,
      headRadius: viewer.frameHeadRadius,
      colors: viewer.colors,
      frameIndex: 0,
      isDark,
      axisFontSize: viewer.axisFontSize,
      subFontSize: viewer.subscriptFontSize,
    });
    this.scene.add(this.worldFrame);

    // Link frames F1..F6 + leader labels
    LINK_NAMES.forEach((linkName, idx) => {
      const mesh = this.linkMeshes.get(linkName);
      if (!mesh) return;
      const frame = buildFrameGroup({
        len: viewer.frameLen,
        width: viewer.frameWidth,
        headRadius: viewer.frameHeadRadius,
        colors: viewer.colors,
        frameIndex: idx + 1,
        isDark,
        axisFontSize: viewer.axisFontSize,
        subFontSize: viewer.subscriptFontSize,
      });
      mesh.add(frame);
      this.linkFrames.set(linkName, frame);

      const { group, label, leader } = createFrameLabelWithLeader(
        `F${frameIndexSubscript(idx + 1)}`,
        isDark,
        viewer.labelFontSize
      );
      this.scene.add(group);
      this.linkLabels.push({ group, label, leader, anchor: frame, index: idx });
    });

    // TCP frame + floating coord sprite
    const link6 = this.linkMeshes.get("link6");
    if (link6) {
      this.tcpFrame = buildFrameGroup({
        len: viewer.frameLen * 1.15,
        width: viewer.frameWidth * 1.1,
        headRadius: viewer.frameHeadRadius * 1.1,
        colors: viewer.colors,
        frameIndex: 6,
        isDark,
        axisFontSize: viewer.axisFontSize,
        subFontSize: viewer.subscriptFontSize,
      });
      link6.add(this.tcpFrame);

      this.tcpCoordLabel = createTcpCoordLabelSprite(isDark);
      this.scene.add(this.tcpCoordLabel);
    }

    this.gizmos.registerJointHitTargets(this.linkFrames);
    this.applySceneBrightness();
    this.applyVisibility();
  }

  private rebuildPathVisuals(): void {
    const viewer = useViewerStore.getState();
    const path = usePathStore.getState();
    rebuildPathVisualGroup({
      pathGroup: this.pathGroup,
      targets: path.targets,
      activeTargetIndex: path.activeTargetIndex,
      motionType: path.settings.motionType,
      showPath: viewer.showPath,
      showPoints: viewer.showPoints,
      showPointFrames: viewer.showPointFrames,
      showLabels: viewer.showLabels,
      isDark: this.isDark(),
      colors: viewer.colors,
      frameAxes: viewer.frameAxes,
    });
  }

  private applySceneBrightness(): void {
    const brightness = MathUtils.clamp(
      finiteOr(useViewerStore.getState().sceneBrightness, 2.75),
      0.5,
      5
    );
    const isDark = this.isDark();
    const frameScale = brightness / 1.2;

    this.keyLight.intensity = (isDark ? 0.9 : 1.05) * brightness;
    this.ambientLight.intensity = (isDark ? 0.25 : 0.42) * brightness;
    this.hemisphereLight.intensity = (isDark ? 0.18 : 0.38) * brightness;

    this.scene.traverse((obj) => {
      const mat = (obj as Mesh).material;
      const list = Array.isArray(mat) ? mat : [mat];
      list.filter(Boolean).forEach((m) => {
        const std = m as unknown as {
          emissiveIntensity?: number;
          userData?: { sceneLightBaseEmissiveIntensity?: number };
        };
        const base = std.userData?.sceneLightBaseEmissiveIntensity;
        if (typeof base === "number" && typeof std.emissiveIntensity === "number") {
          std.emissiveIntensity = base * frameScale;
        }
      });
    });
  }

  private applyTheme(): void {
    const isDark = this.isDark();
    this.scene.background = new Color(isDark ? "#121417" : "#cfd9df");
    this.rebuildGrid();
    this.rebuildWorkspace();
    this.rebuildFramesAndLabels();
    this.rebuildPathVisuals();
    this.applySceneBrightness();
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const viewer = useViewerStore.getState();

    if (this.gridSet) {
      this.gridSet.xyGrid.visible = viewer.showGrid;
      this.gridSet.xyAxes.visible = viewer.showGrid;
      this.gridSet.xyLabels.visible = viewer.showGrid && viewer.showLabels;
      this.gridSet.zGrid.visible = viewer.showZGrid;
      this.gridSet.zAxes.visible = viewer.showZGrid;
      this.gridSet.zLabels.visible = viewer.showZGrid && viewer.showLabels;
    }

    if (this.workspaceGroup) {
      this.workspaceGroup.visible = viewer.showWorkspace;
    }

    if (this.worldFrame) {
      this.worldFrame.visible = viewer.poseMode !== "IK" && viewer.showWorldFrame;
      applyFrameAxesVisibility(this.worldFrame, viewer.frameAxes, viewer.showLabels);
    }

    LINK_NAMES.forEach((name, idx) => {
      const frame = this.linkFrames.get(name);
      const showThis = viewer.showLinkFrames && Boolean(viewer.linkFrameVisibility[idx]);
      if (frame) {
        frame.visible = showThis;
        applyFrameAxesVisibility(frame, viewer.frameAxes, viewer.showLabels);
      }
      const lbl = this.linkLabels[idx];
      if (lbl) {
        lbl.group.visible = showThis && viewer.showLabels;
      }
    });

    if (this.tcpFrame) {
      this.tcpFrame.visible = viewer.showTcpFrame;
      applyFrameAxesVisibility(this.tcpFrame, viewer.frameAxes, viewer.showLabels);
    }

    if (this.tcpCoordLabel) {
      this.tcpCoordLabel.visible = viewer.showTcpValue;
    }

    this.gizmos.applyVisibilityAndSettings();
  }

  private applyCurrentLinkTransforms(): { tcpPos: Vector3; tcpQuat: Quaternion } | null {
    const joints = useRobotStore.getState().joints;
    const Ts = forwardTxRxTzRz(joints);
    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();

    LINK_NAMES.forEach((name, idx) => {
      const mesh = this.linkMeshes.get(name);
      const T = Ts[idx];
      if (!mesh || !T) return;
      T.decompose(pos, quat, scale);
      mesh.position.copy(pos);
      mesh.quaternion.copy(quat);
    });

    if (!Ts.length) return null;
    const tcpPos = new Vector3();
    const tcpQuat = new Quaternion();
    Ts[Ts.length - 1].decompose(tcpPos, tcpQuat, scale);
    return { tcpPos, tcpQuat };
  }

  private emitViewGizmoProjection(): void {
    if (!this.onViewGizmoUpdate) return;
    const invQ = this.camera.quaternion.clone().invert();
    const defs: Array<{ key: ViewAxisKey; axis: "x" | "y" | "z"; negative: boolean; label: string; vec: Vector3 }> = [
      { key: "x+", axis: "x", negative: false, label: "X+", vec: new Vector3(1, 0, 0) },
      { key: "x-", axis: "x", negative: true, label: "X-", vec: new Vector3(-1, 0, 0) },
      { key: "y+", axis: "y", negative: false, label: "Y+", vec: new Vector3(0, 1, 0) },
      { key: "y-", axis: "y", negative: true, label: "Y-", vec: new Vector3(0, -1, 0) },
      { key: "z+", axis: "z", negative: false, label: "Z+", vec: new Vector3(0, 0, 1) },
      { key: "z-", axis: "z", negative: true, label: "Z-", vec: new Vector3(0, 0, -1) },
    ];
    const axes = defs.map((d) => {
      const v = d.vec.clone().applyQuaternion(invQ);
      return {
        key: d.key,
        axis: d.axis,
        negative: d.negative,
        label: d.label,
        x: v.x,
        y: -v.y,
        z: v.z,
      };
    });
    this.onViewGizmoUpdate({ axes });
  }

  private animate = (ts: number): void => {
    if (this.disposed) return;
    const dtMs = Math.min(ts - this.lastFrameTs, 100);
    this.lastFrameTs = ts;

    // Advance trajectory playback if PLAYING
    if (usePathStore.getState().status === "PLAYING") {
      usePathStore.getState().advancePlaybackFrame(dtMs);
    }

    this.controls.update();
    this.emitViewGizmoProjection();

    const tcp = this.applyCurrentLinkTransforms();
    const viewer = useViewerStore.getState();

    if (tcp) {
      this.gizmos.syncTcpHandleToPose(tcp.tcpPos, tcp.tcpQuat);
      if (this.tcpCoordLabel && this.tcpCoordLabel.visible) {
        const e = new Euler().setFromQuaternion(tcp.tcpQuat, "XYZ");
        const lines = [
          "TCP",
          `X: ${(tcp.tcpPos.x * 1000).toFixed(1)} mm`,
          `Y: ${(tcp.tcpPos.y * 1000).toFixed(1)} mm`,
          `Z: ${(tcp.tcpPos.z * 1000).toFixed(1)} mm`,
          `Rx: ${((e.x * 180) / Math.PI).toFixed(1)}°`,
          `Ry: ${((e.y * 180) / Math.PI).toFixed(1)}°`,
          `Rz: ${((e.z * 180) / Math.PI).toFixed(1)}°`,
        ];
        updateTcpCoordLabelSprite(
          this.tcpCoordLabel,
          lines,
          this.isDark(),
          tcp.tcpPos,
          this.camera,
          viewer.labelFontSize
        );
      }
    }

    updateLinkFrameLabelLayout(this.linkLabels, this.camera, viewer.labelFontSize);
    this.gizmos.updateFrame();

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(this.animate);
  };

  public handleResize(): void {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public fitCamera(offset = 1.35): void {
    const box = new Box3().setFromObject(this.robotGroup);
    if (box.isEmpty()) return;
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.35);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const camZ = Math.abs(maxDim / (2 * Math.tan(fovRad / 2))) * offset;

    this.camera.up.set(0, 0, 1);
    this.camera.position.set(center.x + camZ * 0.65, center.y + camZ * 0.65, center.z + camZ * 0.85);
    this.camera.near = Math.max(camZ / 100, 0.05);
    this.camera.far = Math.max(camZ * 100, 500);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  public resetCamera(): void {
    this.fitCamera(1.35);
  }

  public zoomIn(): void {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(0.88);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  public zoomOut(): void {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(1.14);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  public setViewAxis(axis: ViewAxisKey): void {
    const target = this.controls.target.clone();
    const dist = Math.max(this.camera.position.distanceTo(target), 1);
    const eps = 1e-3;
    const dirs: Record<ViewAxisKey, Vector3> = {
      "x+": new Vector3(1, 0, 0),
      "x-": new Vector3(-1, 0, 0),
      "y+": new Vector3(0, 1, 0),
      "y-": new Vector3(0, -1, 0),
      "z+": new Vector3(0, -eps, 1).normalize(),
      "z-": new Vector3(0, eps, -1).normalize(),
    };
    const dir = dirs[axis] ?? dirs["z+"];
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.controls.target.copy(target);
    this.controls.update();
  }

  public orbitByViewGizmo(dx: number, dy: number): void {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    // Z-up spherical orbit
    const yUpOffset = new Vector3(offset.x, offset.z, -offset.y);
    const sph = new Spherical().setFromVector3(yUpOffset);
    sph.theta -= dx * 0.012;
    sph.phi = MathUtils.clamp(sph.phi - dy * 0.012, 0.05, Math.PI - 0.05);
    yUpOffset.setFromSpherical(sph);
    offset.set(yUpOffset.x, -yUpOffset.z, yUpOffset.y);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
    this.controls.update();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver.disconnect();
    this.unsubscribers.forEach((unsub) => unsub());
    this.gizmos.dispose();
    this.controls.dispose();
    disposeObjectTree(this.scene);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
