import {
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { MotionType, PathTarget } from "@/lib/kinematics/constants";
import { fkPoseFromJointsDeg } from "@/lib/kinematics/fk";
import {
  buildMoveCGeometry,
  pathTargetPose,
  sampleMoveCGeometry,
} from "@/lib/path/trajectory";
import type { AxisColors, FrameAxesVisibility } from "@/stores/useViewerStore";
import { applyFrameAxesVisibility, buildFrameGroup } from "./framesAndLabels";
import { disposeObjectTree } from "./stlLoader";

function createTargetTagSprite(text: string, isActive: boolean, isDark: boolean): Sprite {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const ctx = canvas.getContext("2d")!;
  const px = 13 * dpr;
  ctx.font = `700 ${px}px Inter, system-ui, sans-serif`;
  const textW = Math.ceil(ctx.measureText(text).width);
  canvas.width = textW + 16 * dpr;
  canvas.height = px + 10 * dpr;

  ctx.fillStyle = isActive
    ? "rgba(14, 165, 233, 0.92)"
    : isDark
      ? "rgba(15, 23, 42, 0.85)"
      : "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = isActive
    ? "#7dd3fc"
    : isDark
      ? "rgba(148, 163, 184, 0.55)"
      : "rgba(71, 85, 105, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = `700 ${px}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = isActive ? "#ffffff" : isDark ? "#e2e8f0" : "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const sp = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const scale = 0.00042;
  sp.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sp.renderOrder = 22;
  return sp;
}

export function rebuildPathVisualGroup(params: {
  pathGroup: Group;
  targets: readonly PathTarget[];
  activeTargetIndex: number;
  motionType: MotionType;
  showPath: boolean;
  showPoints: boolean;
  showPointFrames: boolean;
  showLabels: boolean;
  isDark: boolean;
  colors: AxisColors;
  frameAxes: FrameAxesVisibility;
}): void {
  const {
    pathGroup,
    targets,
    activeTargetIndex,
    motionType,
    showPath,
    showPoints,
    showPointFrames,
    showLabels,
    isDark,
    colors,
    frameAxes,
  } = params;

  // Clear existing children cleanly
  while (pathGroup.children.length > 0) {
    const child = pathGroup.children[0];
    pathGroup.remove(child);
    disposeObjectTree(child);
  }

  if (!targets.length || (!showPath && !showPoints)) {
    pathGroup.visible = false;
    return;
  }
  pathGroup.visible = true;

  // 1. Target point spheres, optional frames, and name labels
  if (showPoints) {
    targets.forEach((target, idx) => {
      const pose = pathTargetPose(target);
      const isActive = idx === activeTargetIndex;

      const sphere = new Mesh(
        new SphereGeometry(isActive ? 0.0085 : 0.006, 16, 16),
        new MeshStandardMaterial({
          color: isActive ? 0x38bdf8 : 0xf59e0b,
          emissive: isActive ? 0x0284c7 : 0xb45309,
          emissiveIntensity: isActive ? 0.65 : 0.3,
          roughness: 0.3,
        })
      );
      sphere.position.copy(pose.p);
      pathGroup.add(sphere);

      if (showPointFrames) {
        const ptFrame = buildFrameGroup({
          len: 0.036,
          width: 0.0018,
          headRadius: 0.005,
          colors,
          frameIndex: idx + 1,
          isDark,
          axisFontSize: 12,
          subFontSize: 10,
        });
        ptFrame.position.copy(pose.p);
        ptFrame.quaternion.copy(pose.q);
        applyFrameAxesVisibility(ptFrame, frameAxes, false);
        pathGroup.add(ptFrame);
      }

      if (showLabels) {
        const tag = createTargetTagSprite(target.name, isActive, isDark);
        tag.position.copy(pose.p).add(new Vector3(0, 0, 0.022));
        pathGroup.add(tag);
      }
    });
  }

  // 2. Trajectory curves
  if (showPath && targets.length >= 2) {
    const curvePts: Vector3[] = [];
    const lineColor =
      motionType === "MOVEJ" ? 0x38bdf8 : motionType === "MOVEL" ? 0x22c55e : 0xa855f7;

    if (motionType === "MOVEJ") {
      const stepsPerSeg = 24;
      for (let seg = 0; seg < targets.length - 1; seg++) {
        const a = targets[seg];
        const b = targets[seg + 1];
        for (let s = 0; s <= stepsPerSeg; s++) {
          if (seg > 0 && s === 0) continue;
          const t = s / stepsPerSeg;
          const q = a.joints.map((v, i) => v + (b.joints[i] - v) * t);
          curvePts.push(fkPoseFromJointsDeg(q).p);
        }
      }
    } else if (motionType === "MOVEL") {
      targets.forEach((target) => {
        curvePts.push(pathTargetPose(target).p);
      });
    } else {
      // MOVEC: 3-point circular arcs (0-1-2, 2-3-4, ...)
      const arcSteps = 32;
      for (let seg = 0; seg + 2 < targets.length; seg += 2) {
        const geom = buildMoveCGeometry(targets[seg], targets[seg + 1], targets[seg + 2]);
        if (!geom) continue;
        for (let s = 0; s <= arcSteps; s++) {
          if (seg > 0 && s === 0) continue;
          curvePts.push(sampleMoveCGeometry(geom, s / arcSteps).p);
        }
      }
    }

    if (curvePts.length >= 2) {
      const geo = new BufferGeometry().setFromPoints(curvePts);
      const mat = new LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: 0.92,
      });
      pathGroup.add(new Line(geo, mat));
    }
  }
}
