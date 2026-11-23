import {
  CanvasTexture,
  Color,
  ConeGeometry,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { finiteOr } from "@/lib/kinematics/fk";
import { usePathStore } from "@/stores/usePathStore";
import { useRobotStore } from "@/stores/useRobotStore";
import { useViewerStore } from "@/stores/useViewerStore";

export interface GizmoController {
  tcpHandle: Object3D;
  tcpControls: TransformControls;
  jointJogGroup: Group;
  isDraggingTcp: () => boolean;
  isDraggingJoint: () => boolean;
  registerJointHitTargets: (linkFrames: Map<string, Object3D>) => void;
  syncTcpHandleToPose: (pos: Vector3, quat: Quaternion) => void;
  applyVisibilityAndSettings: () => void;
  updateFrame: () => void;
  dispose: () => void;
}

function createPlusMinusSprite(symbol: "+" | "-", colorHex: number): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fill();
  ctx.strokeStyle = `#${new Color(colorHex).getHexString()}`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, 32, 33);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const sp = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.renderOrder = 25;
  return sp;
}

function buildJointJogRingCue(radius: number, tube: number, colorHex: number): Group {
  const grp = new Group();
  grp.name = "jointJogRingCue";

  const mat = new MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
  });

  const arcAngle = Math.PI * 1.45;
  const ring = new Mesh(new TorusGeometry(radius, tube, 12, 48, arcAngle), mat);
  ring.rotation.z = -arcAngle / 2;
  grp.add(ring);

  const headGeo = new ConeGeometry(tube * 2.6, tube * 6.5, 10);
  const headPos = new Mesh(headGeo, mat);
  const endA = arcAngle / 2;
  headPos.position.set(radius * Math.cos(endA), radius * Math.sin(endA), 0);
  headPos.rotation.z = endA;
  grp.add(headPos);

  const headNeg = new Mesh(headGeo, mat);
  const startA = -arcAngle / 2;
  headNeg.position.set(radius * Math.cos(startA), radius * Math.sin(startA), 0);
  headNeg.rotation.z = startA + Math.PI;
  grp.add(headNeg);

  const plus = createPlusMinusSprite("+", colorHex);
  plus.position.set((radius + 0.022) * Math.cos(endA), (radius + 0.022) * Math.sin(endA), 0);
  plus.scale.set(0.026, 0.026, 1);
  grp.add(plus);

  const minus = createPlusMinusSprite("-", colorHex);
  minus.position.set((radius + 0.022) * Math.cos(startA), (radius + 0.022) * Math.sin(startA), 0);
  minus.scale.set(0.026, 0.026, 1);
  grp.add(minus);

  return grp;
}

export function createGizmoController(params: {
  scene: Object3D;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  orbitControls: OrbitControls;
}): GizmoController {
  const { scene, camera, renderer, orbitControls } = params;

  const tcpHandle = new Object3D();
  tcpHandle.name = "tcpDragTarget";
  scene.add(tcpHandle);

  const tcpControls = new TransformControls(camera, renderer.domElement);
  tcpControls.attach(tcpHandle);
  const helper = tcpControls.getHelper();
  scene.add(helper);

  let tcDragging = false;
  let dragStartHandlePos = new Vector3();
  let dragStartHandleQuat = new Quaternion();
  let dragStartIk = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  let lastIkApplyAt = 0;

  tcpControls.addEventListener("dragging-changed", (event) => {
    const dragging = Boolean(event.value);
    tcDragging = dragging;
    orbitControls.enabled = !dragging;

    if (dragging) {
      usePathStore.getState().cancelForManualControl();
      dragStartHandlePos = tcpHandle.position.clone();
      dragStartHandleQuat = tcpHandle.quaternion.clone();
      const robot = useRobotStore.getState();
      dragStartIk = { ...robot.ikTarget };
    } else {
      // Final commit on pointer release
      const robot = useRobotStore.getState();
      robot.applyIk({ withLog: true, rollbackOnFail: true });
    }
  });

  tcpControls.addEventListener("objectChange", () => {
    if (!tcDragging) return;
    const viewer = useViewerStore.getState();
    const robot = useRobotStore.getState();
    const scale = MathUtils.clamp(finiteOr(viewer.tcpDragScale, 0.25), 0.05, 1);

    if (viewer.tcpTransformMode === "translate") {
      const delta = tcpHandle.position.clone().sub(dragStartHandlePos).multiplyScalar(scale * 1000);
      const ok = robot.setIkTarget({
        x: dragStartIk.x + delta.x,
        y: dragStartIk.y + delta.y,
        z: dragStartIk.z + delta.z,
      });
      if (!ok) return;
    } else {
      const qDelta = dragStartHandleQuat.clone().invert().multiply(tcpHandle.quaternion);
      const qScaled = new Quaternion().identity().slerp(qDelta, scale);
      const qTarget = dragStartHandleQuat.clone().multiply(qScaled).normalize();
      const euler = new Euler().setFromQuaternion(qTarget, "XYZ");
      const ok = robot.setIkTarget({
        rx: (euler.x * 180) / Math.PI,
        ry: (euler.y * 180) / Math.PI,
        rz: (euler.z * 180) / Math.PI,
      });
      if (!ok) return;
    }

    const now = performance.now();
    if (viewer.ikAutoApply && now - lastIkApplyAt >= 28) {
      lastIkApplyAt = now;
      robot.applyIk({ withLog: false, rollbackOnFail: false });
    }
  });

  // --- Interactive 3D Joint Jog Ring Control ---
  const jointJogGroup = new Group();
  jointJogGroup.name = "jointJogControlGroup";
  jointJogGroup.visible = false;
  const ringCue = buildJointJogRingCue(0.068, 0.0038, 0x38bdf8);
  jointJogGroup.add(ringCue);
  scene.add(jointJogGroup);

  const hitTargets: Mesh[] = [];
  const frameRefs: Object3D[] = [];
  const raycaster = new Raycaster();
  const pointerNdc = new Vector2();

  let selectedJointIndex = -1;
  let jointDragging = false;
  const dragPlane = new Plane();
  const dragCenter = new Vector3();
  const dragAxisWorld = new Vector3(0, 0, 1);
  let dragStartVec = new Vector3();
  let dragStartJointDeg = 0;

  const setPointerFromEvent = (ev: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const viewer = useViewerStore.getState();
    if (viewer.poseMode !== "JOINT" || !hitTargets.length) return;

    setPointerFromEvent(ev);
    raycaster.setFromCamera(pointerNdc, camera);

    // Check if clicking the active joint ring or any joint hit sphere
    const hits = raycaster.intersectObjects([...hitTargets, jointJogGroup], true);
    if (!hits.length) {
      selectedJointIndex = -1;
      jointJogGroup.visible = false;
      return;
    }

    const firstHit = hits[0].object;
    const idxFromHit =
      typeof firstHit.userData?.jointIndex === "number"
        ? firstHit.userData.jointIndex
        : selectedJointIndex;

    if (idxFromHit < 0 || idxFromHit >= frameRefs.length) return;

    selectedJointIndex = idxFromHit;
    const frameObj = frameRefs[selectedJointIndex];
    frameObj.getWorldPosition(dragCenter);
    const frameQuat = new Quaternion();
    frameObj.getWorldQuaternion(frameQuat);
    dragAxisWorld.set(0, 0, 1).applyQuaternion(frameQuat).normalize();
    dragPlane.setFromNormalAndCoplanarPoint(dragAxisWorld, dragCenter);

    const intersectPt = new Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, intersectPt)) {
      dragStartVec = intersectPt.sub(dragCenter);
      if (dragStartVec.lengthSq() > 1e-8) {
        dragStartVec.normalize();
        dragStartJointDeg = useRobotStore.getState().joints[selectedJointIndex] ?? 0;
        jointDragging = true;
        orbitControls.enabled = false;
        usePathStore.getState().cancelForManualControl();
        jointJogGroup.visible = true;
      }
    }
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!jointDragging || selectedJointIndex < 0) return;
    setPointerFromEvent(ev);
    raycaster.setFromCamera(pointerNdc, camera);
    const pt = new Vector3();
    if (!raycaster.ray.intersectPlane(dragPlane, pt)) return;

    const currentVec = pt.sub(dragCenter);
    if (currentVec.lengthSq() < 1e-8) return;
    currentVec.normalize();

    const cross = new Vector3().crossVectors(dragStartVec, currentVec);
    const sinA = cross.dot(dragAxisWorld);
    const cosA = MathUtils.clamp(dragStartVec.dot(currentVec), -1, 1);
    const deltaDeg = (Math.atan2(sinA, cosA) * 180) / Math.PI;

    useRobotStore.getState().setJoint(selectedJointIndex, dragStartJointDeg + deltaDeg, {
      log: false,
    });
  };

  const onPointerUp = () => {
    if (!jointDragging) return;
    jointDragging = false;
    orbitControls.enabled = true;
    const qNow = useRobotStore.getState().joints[selectedJointIndex] ?? 0;
    if (Math.abs(qNow - dragStartJointDeg) > 0.05) {
      useRobotStore.getState().setJoint(selectedJointIndex, qNow, { log: true });
    }
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  const registerJointHitTargets = (linkFrames: Map<string, Object3D>) => {
    hitTargets.length = 0;
    frameRefs.length = 0;
    let idx = 0;
    linkFrames.forEach((frameObj) => {
      const hitMesh = new Mesh(
        new SphereGeometry(0.026, 10, 10),
        new MeshBasicMaterial({ visible: false })
      );
      hitMesh.userData.jointIndex = idx;
      frameObj.add(hitMesh);
      hitTargets.push(hitMesh);
      frameRefs.push(frameObj);
      idx++;
    });
  };

  const applyVisibilityAndSettings = () => {
    const viewer = useViewerStore.getState();
    const showTcpDrag = viewer.poseMode === "IK" && viewer.enableTcpMouseDrag;
    tcpControls.enabled = showTcpDrag;
    helper.visible = showTcpDrag;
    tcpControls.setMode(viewer.tcpTransformMode);
    tcpControls.setSize(MathUtils.clamp(finiteOr(viewer.tcpGizmoSize, 1.75) * 0.5, 0.35, 1.5));

    if (viewer.poseMode !== "JOINT") {
      selectedJointIndex = -1;
      jointJogGroup.visible = false;
    }
  };

  const syncTcpHandleToPose = (pos: Vector3, quat: Quaternion) => {
    if (tcDragging) return;
    tcpHandle.position.copy(pos);
    tcpHandle.quaternion.copy(quat);
  };

  const updateFrame = () => {
    if (selectedJointIndex >= 0 && selectedJointIndex < frameRefs.length) {
      const frameObj = frameRefs[selectedJointIndex];
      const worldPos = new Vector3();
      const worldQuat = new Quaternion();
      frameObj.getWorldPosition(worldPos);
      frameObj.getWorldQuaternion(worldQuat);
      jointJogGroup.position.copy(worldPos);
      jointJogGroup.quaternion.copy(worldQuat);
      jointJogGroup.visible = useViewerStore.getState().poseMode === "JOINT";
    }
  };

  const dispose = () => {
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    tcpControls.detach();
    tcpControls.dispose();
    scene.remove(helper);
    scene.remove(tcpHandle);
    scene.remove(jointJogGroup);
  };

  applyVisibilityAndSettings();

  return {
    tcpHandle,
    tcpControls,
    jointJogGroup,
    isDraggingTcp: () => tcDragging,
    isDraggingJoint: () => jointDragging,
    registerJointHitTargets,
    syncTcpHandleToPose,
    applyVisibilityAndSettings,
    updateFrame,
    dispose,
  };
}
