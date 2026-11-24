import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";
import {
  conveyorExtent,
  type ConveyorConfig,
  type LightSensorConfig,
  type Platform,
  type WorkBox,
} from "@/lib/sim/workcell";
import { disposeObjectTree } from "./stlLoader";

const MM = 0.001;
const BELT_STRIPE_MM = 20;

interface WorkcellRenderState {
  boxes: readonly WorkBox[];
  platforms: readonly Platform[];
  conveyor: ConveyorConfig;
  conveyorPositionMm: number;
  sensor: LightSensorConfig;
  sensorBlocked: boolean;
}

function beltTexture(): Texture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = "#374151";
  ctx.fillRect(0, 0, 10, 16);
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Three.js mirror of the work-cell store. Static parts (tray, conveyor) are rebuilt when their
 * config changes; boxes are created / removed by id and repositioned every frame.
 */
export class WorkcellView {
  readonly group = new Group();
  private staticGroup = new Group();
  private boxGroup = new Group();
  private boxMeshes = new Map<string, Mesh>();
  private beltTex: Texture | null = null;
  private rollers: Mesh[] = [];
  private staticKey = "";
  private beamMat: MeshStandardMaterial | null = null;
  private sensorLedMat: MeshStandardMaterial | null = null;

  constructor() {
    this.group.name = "workcell";
    this.group.add(this.staticGroup, this.boxGroup);
  }

  sync(state: WorkcellRenderState): void {
    const key = JSON.stringify([state.platforms, state.conveyor, state.sensor]);
    if (key !== this.staticKey) {
      this.staticKey = key;
      this.buildStatic(state.platforms, state.conveyor, state.sensor);
    }
    const hex = state.sensorBlocked ? 0xef4444 : 0x22c55e;
    for (const m of [this.beamMat, this.sensorLedMat]) {
      if (!m) continue;
      m.color.setHex(hex);
      m.emissive.setHex(hex);
    }
    this.syncBelt(state.conveyor, state.conveyorPositionMm);
    this.syncBoxes(state.boxes);
  }

  private buildStatic(platforms: readonly Platform[], c: ConveyorConfig, sensor: LightSensorConfig): void {
    disposeObjectTree(this.staticGroup);
    this.staticGroup.clear();
    this.rollers = [];

    for (const p of platforms) {
      const m = new Mesh(
        new BoxGeometry(p.sizeX * MM, p.sizeY * MM, p.topZ * MM),
        new MeshStandardMaterial({ color: p.color, roughness: 0.7, metalness: 0.1 })
      );
      m.position.set(p.x * MM, p.y * MM, (p.topZ / 2) * MM);
      m.name = `platform:${p.id}`;
      this.staticGroup.add(m);
    }

    const len = c.lengthMm;
    const w = c.widthMm;
    const beltThickness = 4;
    const frameMat = new MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.35 });
    const legMat = new MeshStandardMaterial({ color: 0x4b5563, metalness: 0.4, roughness: 0.5 });
    this.beltTex = beltTexture();
    const beltMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: this.beltTex ?? undefined });
    if (!this.beltTex) beltMat.color.setHex(0x1f2937);

    const conv = new Group();
    conv.name = "conveyor";
    conv.position.set(c.x * MM, c.y * MM, 0);
    if (c.axis === "y") conv.rotation.z = Math.PI / 2;

    const belt = new Mesh(new BoxGeometry(len * MM, w * MM, beltThickness * MM), beltMat);
    belt.position.z = (c.topZ - beltThickness / 2) * MM;
    conv.add(belt);
    if (this.beltTex) this.beltTex.repeat.set(len / BELT_STRIPE_MM, 1);

    for (const side of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry(len * MM, 4 * MM, 14 * MM), frameMat);
      rail.position.set(0, side * (w / 2 + 2) * MM, (c.topZ - 4) * MM);
      conv.add(rail);
      for (const end of [-1, 1]) {
        const leg = new Mesh(new BoxGeometry(8 * MM, 4 * MM, (c.topZ - 10) * MM), legMat);
        leg.position.set(end * (len / 2 - 15) * MM, side * (w / 2 + 2) * MM, ((c.topZ - 10) / 2) * MM);
        conv.add(leg);
      }
    }
    for (const end of [-1, 1]) {
      const roller = new Mesh(new CylinderGeometry(9 * MM, 9 * MM, (w + 2) * MM, 20), frameMat);
      roller.position.set(end * (len / 2) * MM, 0, (c.topZ - 9) * MM);
      conv.add(roller);
      this.rollers.push(roller);
    }
    // Stepper motor housing at the downstream (-axis) end
    const motor = new Mesh(new BoxGeometry(42 * MM, 42 * MM, 42 * MM), legMat);
    motor.position.set(-(len / 2) * MM, -(w / 2 + 25) * MM, (c.topZ - 15) * MM);
    conv.add(motor);
    // End-stop plate
    const stop = new Mesh(
      new BoxGeometry(3 * MM, w * MM, 16 * MM),
      new MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 })
    );
    const { min } = conveyorExtent(c);
    stop.position.set((min - (c.axis === "x" ? c.x : c.y) - 1.5) * MM, 0, (c.topZ + 8) * MM);
    conv.add(stop);

    // Light sensor: emitter + receiver posts on both sides of the belt with a beam across
    const sensorGrp = new Group();
    sensorGrp.name = "lightSensor";
    sensorGrp.position.x = (min - (c.axis === "x" ? c.x : c.y) + sensor.offsetMm) * MM;
    const beamZ = c.topZ + 10;
    const postMat = new MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    this.sensorLedMat = new MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.8 });
    this.beamMat = new MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.75,
    });
    for (const side of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(8 * MM, 8 * MM, 26 * MM), postMat);
      post.position.set(0, side * (w / 2 + 9) * MM, (c.topZ + 6) * MM);
      sensorGrp.add(post);
      const head = new Mesh(new BoxGeometry(10 * MM, 10 * MM, 10 * MM), postMat);
      head.position.set(0, side * (w / 2 + 9) * MM, beamZ * MM);
      sensorGrp.add(head);
      const led = new Mesh(new BoxGeometry(3 * MM, 3 * MM, 3 * MM), this.sensorLedMat);
      led.position.set(0, side * (w / 2 + 9) * MM, (beamZ + 6.5) * MM);
      sensorGrp.add(led);
    }
    const beam = new Mesh(new CylinderGeometry(0.9 * MM, 0.9 * MM, (w + 8) * MM, 8), this.beamMat);
    beam.position.z = beamZ * MM; // CylinderGeometry runs along Y = across the belt
    sensorGrp.add(beam);
    sensorGrp.visible = sensor.enabled;
    conv.add(sensorGrp);

    this.staticGroup.add(conv);
  }

  private syncBelt(c: ConveyorConfig, positionMm: number): void {
    if (this.beltTex) this.beltTex.offset.x = -(positionMm / BELT_STRIPE_MM) % 1;
    // CylinderGeometry axis is Y (across the belt); spin about it.
    const angle = positionMm / 9;
    this.rollers.forEach((r) => (r.rotation.y = angle));
    void c;
  }

  private syncBoxes(boxes: readonly WorkBox[]): void {
    const ids = new Set(boxes.map((b) => b.id));
    for (const [id, mesh] of this.boxMeshes) {
      if (!ids.has(id)) {
        this.boxGroup.remove(mesh);
        disposeObjectTree(mesh);
        this.boxMeshes.delete(id);
      }
    }
    for (const b of boxes) {
      let mesh = this.boxMeshes.get(b.id);
      const sizeKey = `${b.size}|${b.color}`;
      if (mesh && mesh.userData.sizeKey !== sizeKey) {
        this.boxGroup.remove(mesh);
        disposeObjectTree(mesh);
        mesh = undefined;
      }
      if (!mesh) {
        const geo = new BoxGeometry(b.size * MM, b.size * MM, b.size * MM);
        mesh = new Mesh(geo, new MeshStandardMaterial({ color: b.color, roughness: 0.55, metalness: 0.05 }));
        mesh.add(new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: 0x0f172a })));
        mesh.userData.sizeKey = sizeKey;
        mesh.name = `box:${b.id}`;
        this.boxGroup.add(mesh);
        this.boxMeshes.set(b.id, mesh);
      }
      mesh.position.set(b.x * MM, b.y * MM, b.z * MM);
      mesh.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    }
  }

  dispose(): void {
    disposeObjectTree(this.group);
    this.boxMeshes.clear();
  }
}
