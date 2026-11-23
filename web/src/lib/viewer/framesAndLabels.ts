import {
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from "three";
import type { AxisColors, FrameAxesVisibility } from "@/stores/useViewerStore";

const SUBSCRIPTS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

export function frameIndexSubscript(n: number): string {
  return String(n)
    .split("")
    .map((ch) => SUBSCRIPTS[Number(ch)] ?? ch)
    .join("");
}

export function themedAxisHex(hex: string, isDark: boolean): number {
  const c = new Color(hex);
  if (!isDark) {
    c.multiplyScalar(0.75);
  }
  return c.getHex();
}

export function hexToRgba(hex: number, alpha = 1): string {
  const c = new Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createGridLabelSprite(
  text: string,
  colorCss: string,
  fontSize = 14
): Sprite {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const px = Math.max(10, Math.min(28, fontSize)) * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${px}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 12 * dpr;
  const h = px + 8 * dpr;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `600 ${px}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = colorCss;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new Sprite(mat);
  const scale = 0.00042 * (fontSize / 14);
  sp.scale.set(w * scale, h * scale, 1);
  return sp;
}

export interface GridBuildOutput {
  xyGrid: GridHelper;
  zGrid: GridHelper;
  xyAxes: Group;
  zAxes: Group;
  xyLabels: Group;
  zLabels: Group;
}

export function buildGridSet(params: {
  gridMain: number;
  gridSub: number;
  colors: AxisColors;
  isDark: boolean;
  gridFontSize: number;
}): GridBuildOutput {
  const { gridMain, gridSub, colors, isDark, gridFontSize } = params;
  const xyHalfMm = 400;
  const zHalfMm = 500;
  const gridHalfM = xyHalfMm / 1000;
  const zGridHalfM = zHalfMm / 1000;
  const labelOffsetM = gridHalfM + 0.015;
  const zLabelOffsetM = zGridHalfM + 0.015;
  const divisions = (xyHalfMm * 2) / 5;
  const zDivisions = (zHalfMm * 2) / 5;

  const xHex = themedAxisHex(colors.x, isDark);
  const yHex = themedAxisHex(colors.y, isDark);
  const zHex = themedAxisHex(colors.z, isDark);

  const xLabelColor = isDark ? hexToRgba(xHex, 0.98) : "rgba(132,24,31,1)";
  const yLabelColor = isDark ? hexToRgba(yHex, 0.98) : "rgba(0,82,38,1)";
  const zLabelColor = isDark ? hexToRgba(zHex, 0.98) : "rgba(15,61,119,1)";

  const xyGrid = new GridHelper(gridHalfM * 2, divisions, gridMain, gridSub);
  xyGrid.rotation.x = Math.PI / 2;

  const zGrid = new GridHelper(zGridHalfM * 2, zDivisions, gridMain, gridSub);
  zGrid.name = "zGrid";

  const xyAxes = new Group();
  xyAxes.name = "gridAxes";
  xyAxes.add(
    new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(-gridHalfM, 0, 0.003),
        new Vector3(gridHalfM, 0, 0.003),
      ]),
      new LineBasicMaterial({ color: xHex, depthTest: false })
    ),
    new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(0, -gridHalfM, 0.003),
        new Vector3(0, gridHalfM, 0.003),
      ]),
      new LineBasicMaterial({ color: yHex, depthTest: false })
    )
  );

  const zAxes = new Group();
  zAxes.name = "zGridAxes";
  zAxes.add(
    new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(0, 0, -zGridHalfM),
        new Vector3(0, 0, zGridHalfM),
      ]),
      new LineBasicMaterial({ color: zHex, depthTest: false })
    )
  );

  const xyLabels = new Group();
  xyLabels.name = "gridLabels";
  const majorStepMm = 50;
  for (let mm = -xyHalfMm; mm <= xyHalfMm; mm += majorStepMm) {
    const m = mm / 1000;
    const xBottom = createGridLabelSprite(`${mm}`, xLabelColor, gridFontSize);
    xBottom.position.set(m, -labelOffsetM, 0.002);
    xyLabels.add(xBottom);

    const xTop = createGridLabelSprite(`${mm}`, xLabelColor, gridFontSize);
    xTop.position.set(m, labelOffsetM, 0.002);
    xyLabels.add(xTop);

    if (mm !== -xyHalfMm) {
      const yLeft = createGridLabelSprite(`${mm}`, yLabelColor, gridFontSize);
      yLeft.position.set(-labelOffsetM, m, 0.002);
      xyLabels.add(yLeft);
    }
    if (mm !== xyHalfMm) {
      const yRight = createGridLabelSprite(`${mm}`, yLabelColor, gridFontSize);
      yRight.position.set(labelOffsetM, m, 0.002);
      xyLabels.add(yRight);
    }
  }

  const zLabels = new Group();
  zLabels.name = "zGridLabels";
  for (let mm = -zHalfMm; mm <= zHalfMm; mm += majorStepMm) {
    const m = mm / 1000;
    const zLeft = createGridLabelSprite(`${mm}`, zLabelColor, gridFontSize);
    zLeft.position.set(-zLabelOffsetM, 0.002, m);
    zLabels.add(zLeft);

    const zRight = createGridLabelSprite(`${mm}`, zLabelColor, gridFontSize);
    zRight.position.set(zLabelOffsetM, 0.002, m);
    zLabels.add(zRight);
  }

  return { xyGrid, zGrid, xyAxes, zAxes, xyLabels, zLabels };
}

function createAxisBadgeSprite(
  letter: string,
  sub: string,
  colorHex: number,
  axisFontSize: number,
  subFontSize: number
): Sprite {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const mainPx = Math.max(12, axisFontSize) * dpr;
  const subPx = Math.max(10, subFontSize) * dpr;
  canvas.width = Math.ceil(mainPx * 2.4);
  canvas.height = Math.ceil(mainPx * 1.6);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const css = hexToRgba(colorHex, 1);
  ctx.fillStyle = css;
  ctx.textBaseline = "middle";
  ctx.font = `700 ${mainPx}px Inter, system-ui, sans-serif`;
  const mainW = ctx.measureText(letter).width;
  const startX = canvas.width * 0.5 - (mainW + (sub ? subPx * 0.5 : 0)) * 0.5;
  ctx.fillText(letter, startX, canvas.height * 0.48);
  if (sub) {
    ctx.font = `700 ${subPx}px Inter, system-ui, sans-serif`;
    ctx.fillText(sub, startX + mainW + 1, canvas.height * 0.62);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new Sprite(mat);
  const s = 0.00038;
  sp.scale.set(canvas.width * s, canvas.height * s, 1);
  return sp;
}

function addFrameArrow(params: {
  parent: Group;
  axisKey: keyof FrameAxesVisibility;
  dir: Vector3;
  len: number;
  shaftRadius: number;
  headRadius: number;
  colorHex: number;
  labelLetter: string;
  subText: string;
  axisFontSize: number;
  subFontSize: number;
}): void {
  const {
    parent,
    axisKey,
    dir,
    len,
    shaftRadius,
    headRadius,
    colorHex,
    labelLetter,
    subText,
    axisFontSize,
    subFontSize,
  } = params;

  const arrowGrp = new Group();
  arrowGrp.userData.frameAxisKey = axisKey;

  const headLen = Math.min(len * 0.28, headRadius * 2.4);
  const shaftLen = Math.max(len - headLen, len * 0.5);

  const mat = new MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.15,
  });
  mat.userData.sceneLightBaseEmissiveIntensity = 0.35;

  const shaft = new Mesh(new CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 10), mat);
  const head = new Mesh(new ConeGeometry(headRadius, headLen, 12), mat);

  const unit = dir.clone().normalize();
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), unit);

  shaft.quaternion.copy(quat);
  shaft.position.copy(unit).multiplyScalar(shaftLen * 0.5);

  head.quaternion.copy(quat);
  head.position.copy(unit).multiplyScalar(shaftLen + headLen * 0.5);

  arrowGrp.add(shaft, head);

  if (labelLetter) {
    const labelSp = createAxisBadgeSprite(
      labelLetter,
      subText,
      colorHex,
      axisFontSize,
      subFontSize
    );
    labelSp.position.copy(unit).multiplyScalar(len + headRadius * 1.8);
    labelSp.userData.isAxisLabel = true;
    arrowGrp.add(labelSp);
  }

  parent.add(arrowGrp);
}

export function buildFrameGroup(params: {
  len: number;
  width: number;
  headRadius: number;
  colors: AxisColors;
  frameIndex: number;
  isDark: boolean;
  axisFontSize: number;
  subFontSize: number;
}): Group {
  const { len, width, headRadius, colors, frameIndex, isDark, axisFontSize, subFontSize } = params;
  const grp = new Group();
  grp.name = `frame_${frameIndex}`;

  const xHex = themedAxisHex(colors.x, isDark);
  const yHex = themedAxisHex(colors.y, isDark);
  const zHex = themedAxisHex(colors.z, isDark);
  const sub = String(frameIndex);

  const originDot = new Mesh(
    new SphereGeometry(Math.max(width * 1.45, 0.0045), 12, 12),
    new MeshStandardMaterial({ color: isDark ? 0xe2e8f0 : 0x334155, roughness: 0.4 })
  );
  grp.add(originDot);

  addFrameArrow({
    parent: grp,
    axisKey: "xPos",
    dir: new Vector3(1, 0, 0),
    len,
    shaftRadius: width,
    headRadius,
    colorHex: xHex,
    labelLetter: "X",
    subText: sub,
    axisFontSize,
    subFontSize,
  });
  addFrameArrow({
    parent: grp,
    axisKey: "xNeg",
    dir: new Vector3(-1, 0, 0),
    len,
    shaftRadius: width,
    headRadius,
    colorHex: xHex,
    labelLetter: "-X",
    subText: sub,
    axisFontSize,
    subFontSize,
  });
  addFrameArrow({
    parent: grp,
    axisKey: "yPos",
    dir: new Vector3(0, 1, 0),
    len,
    shaftRadius: width,
    headRadius,
    colorHex: yHex,
    labelLetter: "Y",
    subText: sub,
    axisFontSize,
    subFontSize,
  });
  addFrameArrow({
    parent: grp,
    axisKey: "yNeg",
    dir: new Vector3(0, -1, 0),
    len,
    shaftRadius: width,
    headRadius,
    colorHex: yHex,
    labelLetter: "-Y",
    subText: sub,
    axisFontSize,
    subFontSize,
  });
  addFrameArrow({
    parent: grp,
    axisKey: "zPos",
    dir: new Vector3(0, 0, 1),
    len,
    shaftRadius: width,
    headRadius,
    colorHex: zHex,
    labelLetter: "Z",
    subText: sub,
    axisFontSize,
    subFontSize,
  });
  addFrameArrow({
    parent: grp,
    axisKey: "zNeg",
    dir: new Vector3(0, 0, -1),
    len,
    shaftRadius: width,
    headRadius,
    colorHex: zHex,
    labelLetter: "-Z",
    subText: sub,
    axisFontSize,
    subFontSize,
  });

  return grp;
}

export function applyFrameAxesVisibility(
  root: Object3D | null | undefined,
  axes: FrameAxesVisibility,
  showLabels: boolean
): void {
  if (!root) return;
  root.traverse((obj) => {
    const key = obj.userData?.frameAxisKey as keyof FrameAxesVisibility | undefined;
    if (key) {
      obj.visible = Boolean(axes[key]);
    }
    if (obj.userData?.isAxisLabel) {
      obj.visible = showLabels;
    }
  });
}

export interface FrameLabelEntry {
  group: Group;
  label: Sprite;
  leader: Line;
  anchor: Object3D;
  index: number;
}

export function createFrameLabelWithLeader(
  text: string,
  isDark: boolean,
  fontSize = 14
): { group: Group; label: Sprite; leader: Line } {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const px = Math.max(11, fontSize) * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `700 ${px}px Inter, system-ui, sans-serif`;
  const textW = Math.ceil(ctx.measureText(text).width);
  const padX = 8 * dpr;
  const padY = 4 * dpr;
  canvas.width = textW + padX * 2;
  canvas.height = px + padY * 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoundedRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, 6 * dpr);
  ctx.fillStyle = isDark ? "rgba(15, 23, 42, 0.86)" : "rgba(255, 255, 255, 0.9)";
  ctx.fill();
  ctx.strokeStyle = isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(51, 65, 85, 0.45)";
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  ctx.font = `700 ${px}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = isDark ? "#f8fafc" : "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const label = new Sprite(mat);
  label.renderOrder = 20;
  label.userData.aspect = canvas.width / canvas.height;

  const leaderGeo = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]);
  const leaderMat = new LineBasicMaterial({
    color: isDark ? 0x94a3b8 : 0x475569,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  });
  const leader = new Line(leaderGeo, leaderMat);
  leader.renderOrder = 19;

  const group = new Group();
  group.add(leader, label);
  return { group, label, leader };
}

/**
 * Projects link frame labels F1..F6 with horizontal offset and vertical de-overlapping.
 */
export function updateLinkFrameLabelLayout(
  entries: FrameLabelEntry[],
  camera: PerspectiveCamera,
  labelFontSize: number
): void {
  const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const camUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const anchorWorld = new Vector3();

  entries.forEach((entry, idx) => {
    if (!entry.group.visible) return;
    entry.anchor.getWorldPosition(anchorWorld);
    const dist = Math.max(camera.position.distanceTo(anchorWorld), 0.1);
    const worldPerPx =
      (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(window.innerHeight, 600);

    const hWorld = Math.max(18, labelFontSize * 1.8) * worldPerPx;
    const aspect = Number(entry.label.userData.aspect) || 1.6;
    entry.label.scale.set(hWorld * aspect, hWorld, 1);

    // Spread alternating sides & slight vertical lane separation to avoid stacking
    const side = idx % 2 === 0 ? -1 : 1;
    const horizOffset = (48 + (idx % 3) * 18) * worldPerPx * side;
    const vertOffset = ((idx - 2.5) * 14) * worldPerPx;
    const labelPos = anchorWorld
      .clone()
      .addScaledVector(camRight, horizOffset)
      .addScaledVector(camUp, vertOffset);

    entry.label.position.copy(labelPos);
    entry.leader.geometry.setFromPoints([anchorWorld.clone(), labelPos]);
  });
}

export function createTcpCoordLabelSprite(isDark: boolean): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 310;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new Sprite(mat);
  sprite.name = "tcpCartesianDragLabel";
  sprite.renderOrder = 30;
  sprite.userData.canvas = canvas;
  sprite.userData.texture = tex;
  sprite.userData.lastText = "";
  sprite.userData.isDark = isDark;
  return sprite;
}

export function updateTcpCoordLabelSprite(
  sprite: Sprite,
  lines: string[],
  isDark: boolean,
  anchorWorld: Vector3,
  camera: PerspectiveCamera,
  labelFontSize: number
): void {
  const joined = `${isDark ? "D" : "L"}|${lines.join("\n")}`;
  if (sprite.userData.lastText !== joined) {
    sprite.userData.lastText = joined;
    const canvas = sprite.userData.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawRoundedRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 18);
    ctx.fillStyle = isDark ? "rgba(15, 23, 42, 0.90)" : "rgba(255, 255, 255, 0.93)";
    ctx.fill();
    ctx.strokeStyle = isDark ? "rgba(56, 189, 248, 0.7)" : "rgba(2, 132, 199, 0.65)";
    ctx.lineWidth = 4;
    ctx.stroke();

    lines.forEach((line, idx) => {
      const y = 44 + idx * 38;
      if (idx === 0) {
        ctx.font = "700 28px Inter, system-ui, sans-serif";
        ctx.fillStyle = isDark ? "#38bdf8" : "#0284c7";
      } else {
        ctx.font = "600 24px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = isDark ? "#e2e8f0" : "#0f172a";
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(line, 26, y);
    });

    (sprite.userData.texture as CanvasTexture).needsUpdate = true;
  }

  const dist = Math.max(camera.position.distanceTo(anchorWorld), 0.1);
  const worldPerPx =
    (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(window.innerHeight, 600);
  const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const camUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const scaleFactor = Math.max(0.75, labelFontSize / 14);
  const cardH = 115 * scaleFactor * worldPerPx;
  const cardW = cardH * (420 / 310);

  sprite.scale.set(cardW, cardH, 1);
  sprite.position
    .copy(anchorWorld)
    .addScaledVector(camRight, cardW * 0.72)
    .addScaledVector(camUp, cardH * 0.48);
}
