import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  TorusGeometry,
} from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { TOOL_DEFS, type ToolType } from "@/lib/tools/toolDefs";

/**
 * Procedural end-effector models, mounted as a child of the link6 mesh.
 * The flange faces link6 -Z, so every tool is built downward along -Z (meters)
 * and its tip ends at -tcpOffsetMm.
 */
export interface ToolVisual {
  group: Group;
  /** Animate toward the closed / open state; heldSizeMm narrows fingers onto a held box. */
  update: (dtMs: number, closed: boolean, heldSizeMm: number | null) => void;
}

const MM = 0.001;

function mat(color: number, opts: { metalness?: number; roughness?: number; emissive?: number } = {}) {
  return new MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.35,
    roughness: opts.roughness ?? 0.5,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissive ? 0.55 : 0,
  });
}

/** Cylinder along Z spanning z0..z1 (mm, negative = away from flange). */
function zCylinder(rTop: number, rBottom: number, z0: number, z1: number, material: MeshStandardMaterial, seg = 20) {
  const h = Math.abs(z1 - z0);
  // CylinderGeometry is along Y with radiusTop at +Y; rotate so +Y -> +Z.
  const m = new Mesh(new CylinderGeometry(rTop * MM, rBottom * MM, h * MM, seg), material);
  m.rotation.x = Math.PI / 2;
  m.position.z = ((z0 + z1) / 2) * MM;
  return m;
}

function box(sx: number, sy: number, sz: number, x: number, y: number, z: number, material: MeshStandardMaterial) {
  const m = new Mesh(new BoxGeometry(sx * MM, sy * MM, sz * MM), material);
  m.position.set(x * MM, y * MM, z * MM);
  return m;
}

function statusRing(z: number) {
  const m = mat(0x10b981, { emissive: 0x10b981, roughness: 0.3 });
  const ring = zCylinder(15.5, 15.5, z, z - 3, m);
  const setClosed = (closed: boolean) => {
    const hex = closed ? 0xf59e0b : 0x10b981;
    m.color.setHex(hex);
    m.emissive.setHex(hex);
  };
  return { ring, setClosed };
}

function approach(current: number, target: number, dtMs: number, rate = 0.012) {
  return current + (target - current) * Math.min(1, dtMs * rate);
}

function buildSuction(): ToolVisual {
  const g = new Group();
  const body = mat(0x334155, { metalness: 0.5, roughness: 0.4 });
  const metal = mat(0xcbd5e1, { metalness: 0.7, roughness: 0.25 });
  const cupMat = mat(0x111827, { roughness: 0.8 });
  const tube = mat(0x38bdf8, { roughness: 0.6 });
  const { ring, setClosed } = statusRing(-7);

  g.add(zCylinder(14, 14, 0, -7, body));
  g.add(ring);
  g.add(zCylinder(9, 9, -10, -20, body));
  g.add(zCylinder(3.5, 3.5, -20, -40, metal));
  g.add(zCylinder(5, 5, -26, -30, metal)); // spring collar
  g.add(zCylinder(4, 4, -40, -44, cupMat));
  g.add(zCylinder(5, 11, -44, -52, cupMat, 24)); // bellows cup
  const hose = new Mesh(new TorusGeometry(10 * MM, 1.8 * MM, 8, 20, Math.PI), tube);
  hose.rotation.y = Math.PI / 2;
  hose.position.set(0, 9 * MM, -15 * MM);
  g.add(hose);

  let glow = 0;
  return {
    group: g,
    update(dtMs, closed) {
      setClosed(closed);
      glow = approach(glow, closed ? 1 : 0, dtMs);
      cupMat.color.setRGB(0.07 + 0.1 * glow, 0.09 + 0.3 * glow, 0.15 + 0.6 * glow);
    },
  };
}

function buildTwoFinger(): ToolVisual {
  const g = new Group();
  const body = mat(0x334155, { metalness: 0.45, roughness: 0.45 });
  const finger = mat(0x94a3b8, { metalness: 0.55, roughness: 0.35 });
  const { ring, setClosed } = statusRing(-8);

  g.add(zCylinder(14, 14, 0, -8, body));
  g.add(ring);
  g.add(box(46, 18, 18, 0, 0, -20, body)); // pneumatic cylinder body
  g.add(box(52, 8, 4, 0, 0, -30, body)); // guide rail
  const fl = box(5, 10, 30, -22, 0, -45, finger);
  const fr = box(5, 10, 30, 22, 0, -45, finger);
  g.add(fl, fr);

  let half = 22;
  return {
    group: g,
    update(dtMs, closed, held) {
      setClosed(closed);
      const target = closed ? (held ? held / 2 + 2.5 : 4) : 22;
      half = approach(half, target, dtMs, 0.018);
      fl.position.x = -half * MM;
      fr.position.x = half * MM;
    },
  };
}

function buildThreeFingerSoft(): ToolVisual {
  const g = new Group();
  const hub = mat(0xf8fafc, { roughness: 0.6 });
  const body = mat(0x334155, { metalness: 0.45, roughness: 0.45 });
  const soft = mat(0xf97316, { roughness: 0.75 });
  const { ring, setClosed } = statusRing(-6);

  g.add(zCylinder(14, 14, 0, -6, body));
  g.add(ring);
  g.add(zCylinder(16, 19, -9, -30, hub, 24));

  const pivots: Group[] = [];
  const fingerLen = 40;
  for (let i = 0; i < 3; i++) {
    const azimuth = (i * 2 * Math.PI) / 3;
    const mount = new Group();
    mount.rotation.z = azimuth;
    mount.position.z = -30 * MM;
    const pivot = new Group();
    pivot.position.x = 14 * MM;
    const f = new Mesh(new CapsuleGeometry(5 * MM, (fingerLen - 10) * MM, 6, 12), soft);
    f.rotation.x = Math.PI / 2;
    f.position.z = (-fingerLen / 2) * MM;
    pivot.add(f);
    mount.add(pivot);
    g.add(mount);
    pivots.push(pivot);
  }

  let angle = 0.35;
  return {
    group: g,
    update(dtMs, closed, held) {
      setClosed(closed);
      // Rotation about local Y: positive tilts the fingertip outward (+X), negative inward.
      let target = 0.35;
      if (closed) target = held ? Math.atan2(held / 2 + 4 - 14, fingerLen) : -0.32;
      angle = approach(angle, target, dtMs, 0.01);
      pivots.forEach((p) => (p.rotation.y = -angle));
    },
  };
}

function buildMicroServo(): ToolVisual {
  const g = new Group();
  const bracket = mat(0x1f2937, { roughness: 0.55 });
  const servo = mat(0x2563eb, { roughness: 0.45 });
  const jawMat = mat(0x111827, { roughness: 0.7 });
  const { ring, setClosed } = statusRing(-5);

  g.add(zCylinder(14, 14, 0, -5, bracket));
  g.add(ring);
  g.add(box(30, 4, 14, 0, 0, -14, bracket));
  g.add(box(23, 12, 22, 0, 8, -20, servo));
  g.add(zCylinder(3, 3, -30, -33, mat(0xf8fafc)));

  const mkJaw = (side: number) => {
    const pivot = new Group();
    pivot.position.set(side * 6 * MM, 0, -30 * MM);
    const jaw = box(4, 12, 25, 0, 0, -12.5, jawMat);
    const pad = box(2, 12, 6, -side * 2.5, 0, -22, mat(0xef4444, { roughness: 0.9 }));
    pivot.add(jaw, pad);
    g.add(pivot);
    return pivot;
  };
  const left = mkJaw(-1);
  const right = mkJaw(1);

  let open = 0.45;
  return {
    group: g,
    update(dtMs, closed, held) {
      setClosed(closed);
      // Jaw angle: tips at x = 6 + 25*sin(a) mm
      let target = 0.45;
      if (closed) target = held ? Math.asin(Math.max(-1, Math.min(1, (held / 2 + 2 - 6) / 25))) : -0.12;
      open = approach(open, target, dtMs, 0.016);
      left.rotation.y = open;
      right.rotation.y = -open;
    },
  };
}

/**
 * Hiwonder xArm claw: HTS-16L servo + gearbox, two curved fingers on pivots 12 mm off centre.
 * Finger tips sit 90 mm past the flange; jaws open to 55 mm between the tips.
 */
function buildXarmClaw(): ToolVisual {
  const g = new Group();
  const blue = mat(0x1e88e5, { metalness: 0.55, roughness: 0.32 });
  const black = mat(0x1b1d21, { metalness: 0.2, roughness: 0.55 });
  const silver = mat(0xb8bec6, { metalness: 0.7, roughness: 0.3 });
  const rubber = mat(0x0f1115, { metalness: 0, roughness: 0.9 });
  const { ring, setClosed } = statusRing(-4);
  ring.userData.keep = true; // survives the swap to the CAD meshes

  g.add(zCylinder(14, 14, 0, -4, silver));
  g.add(ring);
  g.add(box(24, 40, 22, 0, 6, -19, black)); // HTS-16L servo
  g.add(box(56, 10, 12, 0, 0, -36, blue)); // gearbox plate
  const PIVOT_X = 12;
  const PIVOT_Z = -40;
  const FINGER_LEN = 50;

  const fingers: Group[] = [];
  for (const side of [-1, 1]) {
    const gear = zCylinder(7, 7, -30, -42, silver, 16);
    gear.rotation.set(0, 0, 0); // axis on Y = the finger pivot axis
    gear.position.set(side * PIVOT_X * MM, -7 * MM, -36 * MM);
    g.add(gear);

    const pivot = new Group();
    pivot.position.set(side * PIVOT_X * MM, 0, PIVOT_Z * MM);
    // Built for the -X finger; the +X finger is its mirror image
    const finger = new Group();
    finger.scale.x = side < 0 ? 1 : -1;
    const upper = box(5, 16, 32, -4, 0, -15, blue);
    upper.rotation.y = 0.25;
    const lower = box(5, 16, 24, -4, 0, -38, blue);
    lower.rotation.y = -0.42;
    finger.add(upper, lower, box(3, 14, 14, 0.5, 0, -42, rubber));
    pivot.add(finger);
    g.add(pivot);
    fingers.push(pivot);
  }

  /** Pivot angle that puts each tip `half` mm from the centre line. */
  const angleFor = (half: number) => Math.asin(Math.max(-1, Math.min(1, (half - PIVOT_X) / FINGER_LEN)));
  let angle = angleFor(27.5);
  const cad = loadXarmClawCad(g);
  return {
    group: g,
    update(dtMs, closed, held) {
      setClosed(closed);
      const target = angleFor(closed ? (held ? held / 2 + 2 : 3) : 27.5);
      angle = approach(angle, target, dtMs, 0.016);
      fingers[0].rotation.y = angle;
      fingers[1].rotation.y = -angle;
      cad.update(dtMs, closed ? (held ? held / 2 + 2 : 3) : XARM_CLAW_OPEN_HALF_MM);
    },
  };
}

/**
 * Finger train of the CAD gripper, in the tool (link6) frame, mm. Taken from xArm2.0.stp by the
 * same script that wrote the STLs; the +Y finger is modelled and the -Y one is its mirror image.
 * Driver gear and idler link form a parallelogram, so the finger translates without turning.
 */
const XARM_CLAW = {
  driverPivot: [14.0, -8.45],
  idlerPivot: [5.0, -27.45],
  fingerPin: [28.4, -33.65],
  /** Inner face of the finger pad (half-gap) in the CAD pose. */
  tipHalf: 10.1,
} as const;
const XARM_CLAW_OPEN_HALF_MM = 24;

/** Swaps the procedural claw for the CAD meshes once they load; keeps it if they don't. */
function loadXarmClawCad(g: Group): { update: (dtMs: number, halfMm: number) => void } {
  const dir = "/models/xarm2";
  const loader = new STLLoader();
  const load = (name: string) =>
    loader.loadAsync(`${dir}/${name}.stl`).then((geo) => {
      geo.computeVertexNormals();
      return geo;
    });
  const material = new MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5 });
  const [dy, dz] = [XARM_CLAW.fingerPin[0] - XARM_CLAW.driverPivot[0], XARM_CLAW.fingerPin[1] - XARM_CLAW.driverPivot[1]];
  const linkLen = Math.hypot(dy, dz);
  const phase = Math.atan2(dy, -dz);
  /** Rotation about +X that puts the pad's inner face `half` mm from the centre line. */
  const angleFor = (half: number) =>
    Math.asin(Math.max(-1, Math.min(1, (half - XARM_CLAW.tipHalf + dy) / linkLen))) - phase;

  const sides: { driver: Group; idler: Group; finger: Group }[] = [];
  let angle = angleFor(XARM_CLAW_OPEN_HALF_MM);
  const pose = () => {
    // Rotating by `angle` about +X moves the pin by R(angle)·v − v (v = pin − driver pivot)
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const offY = dy * c - dz * s - dy;
    const offZ = dy * s + dz * c - dz;
    for (const side of sides) {
      side.driver.rotation.x = angle;
      side.idler.rotation.x = angle;
      side.finger.position.set(0, offY * MM, offZ * MM);
    }
  };

  Promise.all(["gripper", "driver", "idler", "finger"].map(load))
    .then(([body, driver, idler, finger]) => {
      /** Group whose origin is the pivot, holding the mesh shifted back so it stays in place. */
      const pivoted = (geo: typeof body, p: readonly number[]) => {
        const pivot = new Group();
        pivot.position.set(0, p[0] * MM, p[1] * MM);
        const mesh = new Mesh(geo, material);
        mesh.position.set(0, -p[0] * MM, -p[1] * MM);
        pivot.add(mesh);
        return pivot;
      };
      const cadGroup = new Group();
      cadGroup.name = "xarmClawCad";
      cadGroup.add(new Mesh(body, material));
      for (const mirror of [1, -1]) {
        const half = new Group();
        half.scale.y = mirror; // three.js flips the winding for negative scale
        const side = {
          driver: pivoted(driver, XARM_CLAW.driverPivot),
          idler: pivoted(idler, XARM_CLAW.idlerPivot),
          finger: new Group(),
        };
        side.finger.add(new Mesh(finger, material));
        half.add(side.driver, side.idler, side.finger);
        cadGroup.add(half);
        sides.push(side);
      }
      // Keep the status ring; drop the procedural parts
      g.children.filter((c) => !c.userData.keep).forEach((c) => {
        g.remove(c);
        disposeTree(c);
      });
      g.add(cadGroup);
      pose();
    })
    .catch(() => undefined);

  return {
    update(dtMs, halfMm) {
      if (!sides.length) return;
      angle = approach(angle, angleFor(halfMm), dtMs, 0.016);
      pose();
    },
  };
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    mats.forEach((m) => m.dispose());
  });
}

export function createToolVisual(type: ToolType): ToolVisual {
  let visual: ToolVisual;
  switch (type) {
    case "SUCTION":
      visual = buildSuction();
      break;
    case "TWO_FINGER":
      visual = buildTwoFinger();
      break;
    case "XARM_GRIPPER":
      visual = buildXarmClaw();
      break;
    case "THREE_FINGER_SOFT":
      visual = buildThreeFingerSoft();
      break;
    case "MICRO_SERVO":
      visual = buildMicroServo();
      break;
    case "NONE":
    default:
      visual = { group: new Group(), update: () => undefined };
  }
  visual.group.name = `tool:${type}`;
  visual.group.userData.tcpOffsetMm = TOOL_DEFS[type].tcpOffsetMm;
  return visual;
}
