import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from "three";
import { LINK_NAMES } from "@/lib/kinematics/constants";
import type { RobotProfile } from "@/lib/robots/types";
import type { LoadedRobotMeshes } from "./stlLoader";

const SERVO_COLOR = 0x1d1f23;
const HORN_COLOR = 0xd4a017;

/**
 * Builds a placeholder 3D model from boxes and cylinders sized from the profile's MDH table,
 * for robots without CAD meshes. Each link group lives in its MDH link frame (meters), so the
 * scene engine poses it exactly like an STL link.
 *
 * Layout matches the xArm-style geometry (see lib/robots/xarm2.ts): a base column up to the
 * shoulder, parallel pitch links along +X of frames 2 and 3, the wrist-pitch servo along -Y of
 * frame 4, the roll servo along -Z of frame 5 and the flange at frame 6.
 */
export function buildPrimitiveRobot(targetGroup: Group, profile: RobotProfile): LoadedRobotMeshes {
  const mm = (v: number) => v / 1000;
  const mdh = profile.mdhParams;
  const d1 = mm(mdh[0].d);
  const l2 = mm(mdh[2].a);
  const l3 = mm(mdh[3].a);
  const df = Math.abs(mm(mdh[5].d));

  const mat = (color: number, metalness = 0.25, roughness = 0.6) =>
    new MeshStandardMaterial({ color, metalness, roughness });
  const colorOf = (name: string) => profile.meshColors[name] ?? 0xbdbdbd;

  const add = (
    parent: Group,
    geo: BufferGeometry,
    color: number,
    pos: [number, number, number],
    rotX = 0
  ) => {
    const mesh = new Mesh(geo, mat(color));
    mesh.position.set(...pos);
    mesh.rotation.x = rotX;
    parent.add(mesh);
    return mesh;
  };
  /** Cylinder whose axis lies along the local Z axis. */
  const cylZ = (r: number, h: number) => new CylinderGeometry(r, r, h, 28);

  const base = new Group();
  base.name = "base";
  targetGroup.add(base);
  // Base plate + column holding the base servo, up to just below the turntable
  add(base, new BoxGeometry(0.14, 0.14, 0.012), colorOf("base"), [0, 0, 0.006]);
  const columnTop = Math.max(0.03, d1 - 0.035);
  add(base, cylZ(0.042, columnTop - 0.012), colorOf("base"), [0, 0, 0.012 + (columnTop - 0.012) / 2], Math.PI / 2);

  const links = new Map<string, Group>();
  LINK_NAMES.forEach((name) => {
    const g = new Group();
    g.name = name;
    base.add(g);
    links.set(name, g);
  });

  // link1: turntable + shoulder bracket (frame 1 sits on the shoulder axis, Z up)
  const link1 = links.get("link1")!;
  add(link1, cylZ(0.045, 0.008), colorOf("link1"), [0, 0, -0.031], Math.PI / 2);
  add(link1, new BoxGeometry(0.04, 0.052, 0.03), colorOf("link1"), [0, 0, -0.012]);

  // link2 / link3: servo at the joint + twin side plates along +X (joint axis = Z)
  const armLink = (g: Group, length: number, color: number) => {
    add(g, new BoxGeometry(0.04, 0.02, 0.04), SERVO_COLOR, [0, 0, 0]);
    add(g, cylZ(0.011, 0.046), HORN_COLOR, [0, 0, 0], Math.PI / 2);
    for (const side of [-1, 1]) {
      add(g, new BoxGeometry(length, 0.026, 0.003), color, [length / 2, 0, side * 0.0235]);
    }
  };
  armLink(links.get("link2")!, l2, colorOf("link2"));
  armLink(links.get("link3")!, l3, colorOf("link3"));

  // link4: wrist-pitch servo, extending along -Y (the arm direction in frame 4)
  const link4 = links.get("link4")!;
  add(link4, new BoxGeometry(0.02, 0.04, 0.04), SERVO_COLOR, [0, -0.012, 0]);
  add(link4, cylZ(0.011, 0.046), HORN_COLOR, [0, 0, 0], Math.PI / 2);

  // link5: roll servo body from the pitch axis to the flange, along -Z of frame 5
  const link5 = links.get("link5")!;
  const rollLen = Math.max(0.01, df - 0.006);
  add(link5, new BoxGeometry(0.034, 0.024, rollLen), colorOf("link5"), [0, 0, -rollLen / 2 - 0.004]);

  // link6: mounting flange (the tool hangs off its -Z)
  const link6 = links.get("link6")!;
  add(link6, cylZ(0.019, 0.005), colorOf("link6"), [0, 0, 0.0025], Math.PI / 2);

  return { base, links };
}
