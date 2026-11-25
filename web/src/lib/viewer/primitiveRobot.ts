import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from "three";
import { LINK_NAMES } from "@/lib/kinematics/constants";
import { XARM2_BASE_PLATE_MM } from "@/lib/robots/xarm2";
import type { RobotProfile } from "@/lib/robots/types";
import type { LoadedRobotMeshes } from "./stlLoader";

const SERVO_BLACK = 0x1b1d21;
const HORN_SILVER = 0xb8bec6;
const PLATE_BLACK = 0x17191c;
const SENSOR_SILVER = 0xd0d4da;

/**
 * Procedural model of an xArm-style bus-servo arm, sized from the profile's MDH table, for robots
 * without CAD meshes. Each link group lives in its MDH link frame (meters), so the scene engine
 * poses it exactly like an STL link.
 *
 * Frame conventions (see lib/robots/xarm2.ts): frame 1 sits on the shoulder axis with Z up;
 * frames 2 and 3 run along +X with the pitch axis on Z; in frame 4 the arm continues along -Y;
 * frame 5's -Z is the roll axis towards the flange (frame 6). Tools hang off link6 -Z.
 */
export function buildPrimitiveRobot(targetGroup: Group, profile: RobotProfile): LoadedRobotMeshes {
  const MM = 0.001;
  const mdh = profile.mdhParams;
  const d1 = mdh[0].d;
  const l2 = mdh[2].a;
  const l3 = mdh[3].a;
  const df = Math.abs(mdh[5].d);
  const blue = profile.meshColors.link2 ?? 0x1e88e5;

  const materials = new Map<string, MeshStandardMaterial>();
  const mat = (color: number, metalness = 0.35, roughness = 0.45) => {
    const key = `${color}:${metalness}:${roughness}`;
    if (!materials.has(key)) materials.set(key, new MeshStandardMaterial({ color, metalness, roughness }));
    return materials.get(key)!;
  };
  const anodised = mat(blue, 0.55, 0.32);
  const servo = mat(SERVO_BLACK, 0.2, 0.55);
  const horn = mat(HORN_SILVER, 0.7, 0.3);

  /** Adds a mesh; sizes and positions in mm. */
  const add = (parent: Group, geo: BufferGeometry, material: MeshStandardMaterial, pos: [number, number, number], rotX = 0) => {
    const mesh = new Mesh(geo, material);
    mesh.position.set(pos[0] * MM, pos[1] * MM, pos[2] * MM);
    mesh.rotation.x = rotX;
    parent.add(mesh);
    return mesh;
  };
  const boxGeo = (x: number, y: number, z: number) => new BoxGeometry(x * MM, y * MM, z * MM);
  /** Cylinder with its axis on local Z (pass rotX = PI/2 to add()). */
  const cylGeo = (r: number, h: number, seg = 28) => new CylinderGeometry(r * MM, r * MM, h * MM, seg);
  /** Octagonal prism with its axis on local Z, flat sides facing ±X/±Y. */
  const octGeo = (r: number, h: number) => {
    const g = new CylinderGeometry(r * MM, r * MM, h * MM, 8);
    g.rotateY(Math.PI / 8);
    return g;
  };

  // ── Base (static): plate, suction cups, octagonal pedestal, controller, ultrasonic sensor ──
  const base = new Group();
  base.name = "base";
  targetGroup.add(base);

  const plate = XARM2_BASE_PLATE_MM;
  const plateCenterX = plate.axisToFrontEdge - plate.length / 2;
  const plateTop = 8;
  add(base, boxGeo(plate.length, plate.width, 4), mat(PLATE_BLACK, 0.3, 0.6), [plateCenterX, 0, plateTop - 2]);
  for (const [sx, sy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    add(
      base,
      cylGeo(11, 4, 20),
      mat(0xe2e8f0, 0, 0.4),
      [plateCenterX + sx * (plate.length / 2 - 18), sy * (plate.width / 2 - 14), 2],
      Math.PI / 2
    );
  }
  // Octagonal pedestal holding the base servo
  const pedestalTop = Math.max(plateTop + 10, d1 - 42);
  add(base, octGeo(60, pedestalTop - plateTop), anodised, [0, 0, (plateTop + pedestalTop) / 2], Math.PI / 2);
  // CoreX controller box behind the arm
  const coreX = plateCenterX - plate.length / 2 + 58;
  add(base, boxGeo(96, 118, 34), mat(0x2a2d33, 0.25, 0.55), [coreX, 0, plateTop + 17]);
  add(base, boxGeo(60, 70, 2), mat(0x0f1115, 0.1, 0.8), [coreX + 6, 0, plateTop + 35]);
  // Ultrasonic sensor at the front
  for (const sy of [-13, 13]) {
    add(base, cylGeo(8, 12, 20), mat(SENSOR_SILVER, 0.6, 0.3), [plate.axisToFrontEdge - 4, sy, plateTop + 12]).rotation.set(0, 0, Math.PI / 2);
  }
  add(base, boxGeo(6, 46, 20), servo, [plate.axisToFrontEdge - 12, 0, plateTop + 12]);

  const links = new Map<string, Group>();
  LINK_NAMES.forEach((name) => {
    const g = new Group();
    g.name = name;
    base.add(g);
    links.set(name, g);
  });

  /** Twin anodised side plates spanning [x0, x1] along X, either side of the joint plane. */
  const sidePlates = (g: Group, x0: number, x1: number, gap: number, height = 26) => {
    for (const side of [-1, 1]) {
      add(g, boxGeo(x1 - x0, height, 2.5), anodised, [(x0 + x1) / 2, 0, side * gap]);
    }
  };
  /** Servo body (black) with its output horn on the Z axis at the origin. */
  const servoAt = (g: Group, pos: [number, number, number], size: [number, number, number]) => {
    add(g, boxGeo(...size), servo, pos);
    add(g, cylGeo(9, size[2] + 3), horn, [0, 0, 0], Math.PI / 2);
  };

  // link1 (frame 1 on the shoulder axis, Z up): turntable + U bracket carrying the shoulder servo
  const link1 = links.get("link1")!;
  const turntableZ = pedestalTop - d1 + 3;
  add(link1, octGeo(52, 6), anodised, [0, 0, turntableZ], Math.PI / 2);
  add(link1, boxGeo(44, 56, 4), anodised, [0, 0, turntableZ + 4]);
  for (const side of [-1, 1]) {
    add(link1, boxGeo(30, 2.5, -turntableZ + 12), anodised, [0, side * 25, (turntableZ + 12) / 2]);
  }

  // link2 (upper arm along +X): shoulder horn, U brackets, elbow servo body near the far end
  const link2 = links.get("link2")!;
  servoAt(link2, [8, 0, 0], [40, 20, 40]);
  sidePlates(link2, -12, l2 + 12, 23);
  add(link2, boxGeo(40, 20, 40), servo, [l2 - 14, 0, 0]);

  // link3 (forearm along +X): bracket at the elbow, black tube, bracket at the wrist
  const link3 = links.get("link3")!;
  add(link3, cylGeo(9, 46), horn, [0, 0, 0], Math.PI / 2);
  sidePlates(link3, -12, 24, 23);
  add(link3, cylGeo(9, l3 - 44, 20), mat(0x22252a, 0.4, 0.4), [l3 / 2, 0, 0]).rotation.set(0, 0, Math.PI / 2);
  sidePlates(link3, l3 - 24, l3 + 12, 18);
  add(link3, boxGeo(36, 18, 32), servo, [l3 - 4, 0, 0]);

  // link4 (wrist pitch; the arm continues along -Y): bracket around the roll servo
  const link4 = links.get("link4")!;
  add(link4, cylGeo(8, 40), horn, [0, 0, 0], Math.PI / 2);
  for (const side of [-1, 1]) add(link4, boxGeo(24, 34, 2.5), anodised, [0, -14, side * 18]);
  add(link4, boxGeo(26, 4, 36), anodised, [0, -31, 0]);

  // link5 (roll servo, axis on -Z towards the flange)
  const link5 = links.get("link5")!;
  const rollLen = Math.max(10, df - 34);
  add(link5, boxGeo(24, 36, rollLen), servo, [0, 0, -34 - rollLen / 2]);

  // link6 (flange): round horn plate the gripper bolts onto
  const link6 = links.get("link6")!;
  add(link6, cylGeo(14, 4), horn, [0, 0, 2], Math.PI / 2);

  return { base, links };
}
