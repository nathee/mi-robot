import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { LINK_NAMES, STL_MESH_COLORS } from "@/lib/kinematics/constants";
import type { RobotProfile } from "@/lib/robots/types";
import { buildPrimitiveRobot } from "./primitiveRobot";

export interface LoadedRobotMeshes {
  base: Object3D;
  links: Map<string, Object3D>;
}

/**
 * Loads base.stl and link1.stl..link6.stl from /models/ and builds the exact
 * v0.0.1 scene hierarchy (link1..link6 mounted under base).
 */
export function loadMirobotSTLs(
  targetGroup: Group,
  basePath = "/models",
  stlLinks?: readonly string[]
): Promise<LoadedRobotMeshes> {
  const loader = new STLLoader();
  const names = ["base", ...LINK_NAMES];

  const loadOne = (name: string): Promise<Object3D> =>
    new Promise((resolve) => {
      if (stlLinks && !stlLinks.includes(name)) {
        const empty = new Group();
        empty.name = name;
        resolve(empty);
        return;
      }
      const url = `${basePath}/${name}.stl`;
      loader.load(
        url,
        (geo) => {
          geo.computeVertexNormals();
          const hasColors = (geo as typeof geo & { hasColors?: boolean }).hasColors === true;
          const mat = new MeshStandardMaterial({
            color: hasColors ? 0xffffff : (STL_MESH_COLORS[name] ?? 0xbdbdbd),
            vertexColors: hasColors,
            metalness: hasColors ? 0.35 : 0.2,
            roughness: hasColors ? 0.5 : 0.7,
          });
          const mesh = new Mesh(geo, mat);
          mesh.name = name;
          resolve(mesh);
        },
        undefined,
        () => {
          const fallbackGeo = new CylinderGeometry(0.015, 0.015, 0.02, 12);
          const fallbackMat = new MeshStandardMaterial({ color: 0x777777 });
          const mesh = new Mesh(fallbackGeo, fallbackMat);
          mesh.name = name;
          resolve(mesh);
        }
      );
    });

  return Promise.all(names.map(loadOne)).then((meshes) => {
    const byName = new Map<string, Object3D>();
    meshes.forEach((m) => byName.set(m.name, m));

    const base = byName.get("base")!;
    targetGroup.add(base);

    const links = new Map<string, Object3D>();
    LINK_NAMES.forEach((linkName) => {
      const linkMesh = byName.get(linkName);
      if (linkMesh) {
        base.add(linkMesh);
        links.set(linkName, linkMesh);
      }
    });

    return { base, links };
  });
}

export function disposeObjectTree(root: Object3D | null | undefined): void {
  if (!root) return;
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.filter(Boolean).forEach((mat) => {
      const anyMat = mat as unknown as { map?: { dispose?: () => void }; dispose?: () => void };
      anyMat.map?.dispose?.();
      anyMat.dispose?.();
    });
  });
}

/** Loads the active robot's 3D model: STL meshes when the profile has them, primitives otherwise. */
export function loadRobotMeshes(targetGroup: Group, profile: RobotProfile): Promise<LoadedRobotMeshes> {
  if (profile.meshSource === "stl") {
    return loadMirobotSTLs(targetGroup, profile.stlDir ?? "/models", profile.stlLinks);
  }
  return Promise.resolve(buildPrimitiveRobot(targetGroup, profile));
}
