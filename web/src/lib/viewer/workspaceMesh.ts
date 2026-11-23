import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import type { WorkspaceConfig } from "@/lib/kinematics/constants";

function addWorkspaceWall(
  parent: Group,
  r0: number,
  r1: number,
  aMin: number,
  aMax: number,
  zMin: number,
  zMax: number,
  mat: MeshBasicMaterial
): void {
  const seg = 72;
  const verts: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = aMin + (aMax - aMin) * (i / seg);
    const a1 = aMin + (aMax - aMin) * ((i + 1) / seg);
    const p0 = [r0 * Math.cos(a0), r0 * Math.sin(a0)];
    const p1 = [r1 * Math.cos(a1), r1 * Math.sin(a1)];
    verts.push(p0[0], p0[1], zMin, p1[0], p1[1], zMin, p1[0], p1[1], zMax);
    verts.push(p0[0], p0[1], zMin, p1[0], p1[1], zMax, p0[0], p0[1], zMax);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(verts, 3));
  parent.add(new Mesh(geo, mat));
}

function addWorkspaceRadialWall(
  parent: Group,
  rMin: number,
  rMax: number,
  angle: number,
  zMin: number,
  zMax: number,
  mat: MeshBasicMaterial
): void {
  const p0 = [rMin * Math.cos(angle), rMin * Math.sin(angle)];
  const p1 = [rMax * Math.cos(angle), rMax * Math.sin(angle)];
  const verts = [
    p0[0], p0[1], zMin,
    p1[0], p1[1], zMin,
    p1[0], p1[1], zMax,
    p0[0], p0[1], zMin,
    p1[0], p1[1], zMax,
    p0[0], p0[1], zMax,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(verts, 3));
  parent.add(new Mesh(geo, mat));
}

function addWorkspaceArc(
  parent: Group,
  r: number,
  aMin: number,
  aMax: number,
  z: number,
  mat: LineBasicMaterial
): void {
  const pts: Vector3[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = aMin + (aMax - aMin) * (i / 72);
    pts.push(new Vector3(r * Math.cos(a), r * Math.sin(a), z));
  }
  parent.add(new Line(new BufferGeometry().setFromPoints(pts), mat));
}

function addWorkspaceRadialLine(
  parent: Group,
  rMin: number,
  rMax: number,
  angle: number,
  z: number,
  mat: LineBasicMaterial
): void {
  const pts = [
    new Vector3(rMin * Math.cos(angle), rMin * Math.sin(angle), z),
    new Vector3(rMax * Math.cos(angle), rMax * Math.sin(angle), z),
  ];
  parent.add(new Line(new BufferGeometry().setFromPoints(pts), mat));
}

export function buildWorkspaceGroup(ws: WorkspaceConfig, isDark: boolean): Group {
  const rMin = ws.radiusMin / 1000;
  const rMax = ws.radiusMax / 1000;
  const zMin = ws.zMin / 1000;
  const zMax = ws.zMax / 1000;
  const aMin = (ws.baseMinDeg * Math.PI) / 180;
  const aMax = (ws.baseMaxDeg * Math.PI) / 180;

  const baseColor = isDark ? 0x7fb7c2 : 0x668b93;
  const lineColor = isDark ? 0x4c8fad : 0x507780;

  const grp = new Group();
  grp.name = "workspace";

  const surfaceMat = new MeshBasicMaterial({
    color: baseColor,
    transparent: true,
    opacity: isDark ? 0.18 : 0.1,
    side: DoubleSide,
    depthWrite: false,
  });
  surfaceMat.userData.normalColor = baseColor;
  surfaceMat.userData.normalOpacity = isDark ? 0.18 : 0.1;

  const topMat = surfaceMat.clone();
  topMat.opacity = isDark ? 0.1 : 0.06;
  topMat.userData.normalColor = baseColor;
  topMat.userData.normalOpacity = isDark ? 0.1 : 0.06;

  const wallMat = surfaceMat.clone();
  wallMat.opacity = isDark ? 0.08 : 0.045;
  wallMat.userData.normalColor = baseColor;
  wallMat.userData.normalOpacity = isDark ? 0.08 : 0.045;

  const lineMat = new LineBasicMaterial({
    color: lineColor,
    transparent: true,
    opacity: isDark ? 0.78 : 0.68,
  });
  lineMat.userData.normalColor = lineColor;
  lineMat.userData.normalOpacity = isDark ? 0.78 : 0.68;

  const shape = new Shape();
  shape.absarc(0, 0, rMax, aMin, aMax, false);
  shape.absarc(0, 0, rMin, aMax, aMin, true);
  shape.closePath();

  const bottom = new Mesh(new ShapeGeometry(shape), surfaceMat);
  bottom.position.z = zMin;
  grp.add(bottom);

  const top = new Mesh(new ShapeGeometry(shape), topMat);
  top.position.z = zMax;
  grp.add(top);

  addWorkspaceWall(grp, rMax, rMax, aMin, aMax, zMin, zMax, wallMat);
  addWorkspaceWall(grp, rMin, rMin, aMin, aMax, zMin, zMax, wallMat);
  addWorkspaceRadialWall(grp, rMin, rMax, aMin, zMin, zMax, wallMat);
  addWorkspaceRadialWall(grp, rMin, rMax, aMax, zMin, zMax, wallMat);

  addWorkspaceArc(grp, rMax, aMin, aMax, zMin, lineMat);
  addWorkspaceArc(grp, rMax, aMin, aMax, zMax, lineMat);
  addWorkspaceArc(grp, rMin, aMin, aMax, zMin, lineMat);
  addWorkspaceArc(grp, rMin, aMin, aMax, zMax, lineMat);
  addWorkspaceRadialLine(grp, rMin, rMax, aMin, zMin, lineMat);
  addWorkspaceRadialLine(grp, rMin, rMax, aMax, zMin, lineMat);
  addWorkspaceRadialLine(grp, rMin, rMax, aMin, zMax, lineMat);
  addWorkspaceRadialLine(grp, rMin, rMax, aMax, zMax, lineMat);

  return grp;
}

export function applyWorkspaceHighlight(workspaceGroup: Group | null, outOfBounds: boolean): void {
  if (!workspaceGroup) return;
  const warnColor = 0xff4d4f;
  workspaceGroup.traverse((obj) => {
    const mat = (obj as Mesh | Line).material;
    if (!mat || Array.isArray(mat)) return;
    if (mat instanceof MeshBasicMaterial) {
      const normalColor = mat.userData.normalColor ?? 0x7fb7c2;
      const normalOpacity = mat.userData.normalOpacity ?? 0.1;
      mat.color.setHex(outOfBounds ? warnColor : normalColor);
      mat.opacity = outOfBounds ? Math.min(0.32, normalOpacity * 2.2) : normalOpacity;
    } else if (mat instanceof LineBasicMaterial) {
      const normalColor = mat.userData.normalColor ?? 0x4c8fad;
      const normalOpacity = mat.userData.normalOpacity ?? 0.72;
      mat.color.setHex(outOfBounds ? warnColor : normalColor);
      mat.opacity = outOfBounds ? 0.95 : normalOpacity;
    }
  });
}
