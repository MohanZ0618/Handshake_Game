import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Player } from "../shared/game";
import { WEAPON_IDS } from "../shared/weapons";
import { cloneWorldWeapon, type WeaponModels } from "./weapon-models";

type Limb = { upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh };
type Arm = Limb & {
  hand: THREE.Group;
  band: THREE.Mesh;
  shoulder: THREE.Vector3;
};
type Leg = Limb & { foot: THREE.Mesh; side: number };
export type CharacterRig = {
  root: THREE.Group;
  body: THREE.Group;
  gun: THREE.Group;
  arms: Arm[];
  legs: Leg[];
  phase: number;
  speed: number;
  stride: number;
  previous: THREE.Vector3;
  life: number;
  initialized: boolean;
};
const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
const jointGeometry = new THREE.SphereGeometry(1, 12, 8);
const up = new THREE.Vector3(0, 1, 0);
const WEAPON_SCALE = 0.68;

function segment(
  mesh: THREE.Mesh,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
) {
  const direction = new THREE.Vector3().subVectors(b, a);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(radius, Math.max(0.01, direction.length()), radius);
  mesh.quaternion.setFromUnitVectors(up, direction.normalize());
}
function elbow(
  start: THREE.Vector3,
  target: THREE.Vector3,
  upper: number,
  lower: number,
  bend: THREE.Vector3,
) {
  const direction = new THREE.Vector3().subVectors(target, start);
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    0.01,
    upper + lower - 0.01,
  );
  direction.normalize();
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const perpendicular = bend
    .clone()
    .addScaledVector(direction, -bend.dot(direction))
    .normalize();
  return start
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(perpendicular, height);
}

export function createCharacterRig(
  models: WeaponModels,
  teamColor: string,
  material: (color: string) => THREE.MeshStandardMaterial,
  finish: (model: THREE.Object3D) => void = () => {},
): CharacterRig {
  const root = new THREE.Group(),
    body = new THREE.Group(),
    gun = new THREE.Group();
  body.name = "body";
  root.add(body);
  gun.name = "gun";
  gun.position.set(0, 46, 4);
  body.add(gun);
  const mesh = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: string,
  ) => {
    const object = new THREE.Mesh(geometry, material(color));
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const shape = (
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    color: string,
  ) => {
    const object = mesh(body, geometry, color);
    object.position.set(x, y, z);
    return object;
  };
  shape(new THREE.CapsuleGeometry(8, 14, 5, 12), 0, 36, 0, "#5a604b");
  shape(new RoundedBoxGeometry(18, 22, 16, 2, 1.4), 2, 37, 0, "#343a2c");
  shape(new RoundedBoxGeometry(14, 6, 16, 2, 1), -1, 26, 0, "#505644");
  shape(new THREE.SphereGeometry(6.5, 16, 12), 0, 56, 0, "#b89173");
  shape(
    new THREE.SphereGeometry(8, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65),
    0,
    58,
    0,
    "#4b503c",
  );
  shape(new RoundedBoxGeometry(2, 4, 11, 2, 0.5), 6.3, 57, 0, "#1b2425");
  const limb = (parent: THREE.Object3D, color: string): Limb => {
    const upper = mesh(parent, boneGeometry, color),
      lower = mesh(parent, boneGeometry, color),
      joint = mesh(parent, jointGeometry, color);
    for (const object of [upper, lower, joint])
      object.userData.sharedGeometry = true;
    return { upper, lower, joint };
  };
  const arms: Arm[] = [];
  const legs: Leg[] = [];
  for (const side of [-1, 1]) {
    const arm = limb(body, "#5a604b"),
      hand = new THREE.Group();
    hand.name = side === 1 ? "hand-right" : "hand-left";
    body.add(hand);
    mesh(hand, new RoundedBoxGeometry(4.5, 3.5, 4.8, 2, 0.6), "#252922");
    for (let n = 0; n < 4; n++) {
      const finger = mesh(
        hand,
        new RoundedBoxGeometry(2.7, 0.8, 0.85, 2, 0.2),
        "#30372b",
      );
      finger.position.set(0.9, -1.2, -1.6 + n * 1.05);
    }
    const band = mesh(body, boneGeometry, teamColor);
    band.userData.sharedGeometry = true;
    arms.push({
      ...arm,
      hand,
      band,
      shoulder: new THREE.Vector3(2.5, 45, side * 8.5),
    });
    const leg = limb(root, "#505644");
    const foot = mesh(
      root,
      new RoundedBoxGeometry(10, 5, 7, 2, 0.6),
      "#272b27",
    );
    legs.push({ ...leg, foot, side });
  }
  for (const id of WEAPON_IDS) {
    const model = cloneWorldWeapon(models[id]);
    model.name = id;
    finish(model);
    model.rotation.y = -Math.PI / 2;
    model.scale.setScalar(WEAPON_SCALE);
    model.position.x = 17;
    gun.add(model);
  }
  return {
    root,
    body,
    gun,
    arms,
    legs,
    phase: 0,
    speed: 0,
    stride: 0,
    previous: new THREE.Vector3(),
    life: -1,
    initialized: false,
  };
}

export function updateCharacterRig(
  rig: CharacterRig,
  p: Player,
  now: number,
  elapsed: number,
) {
  const dt = THREE.MathUtils.clamp(elapsed, 0.001, 0.3);
  const position = new THREE.Vector3(p.x, p.y, p.z);
  const delta = position.clone().sub(rig.previous);
  const reset =
    !rig.initialized ||
    rig.life !== p.life ||
    delta.length() > 180 ||
    p.hp <= 0;
  if (reset) {
    rig.speed = rig.stride = rig.phase = 0;
    delta.set(0, 0, 0);
  }
  const horizontal = Math.hypot(delta.x, delta.z);
  const measured = reset ? 0 : Math.min(500, horizontal / dt);
  rig.speed = THREE.MathUtils.damp(rig.speed, measured, 12, dt);
  rig.stride = THREE.MathUtils.damp(
    rig.stride,
    p.grounded && p.hp > 0 ? Math.min(1.25, rig.speed / 210) : 0,
    12,
    dt,
  );
  rig.phase += (Math.min(rig.speed, 320) * dt * Math.PI * 2) / 110;
  rig.previous.copy(position);
  rig.life = p.life;
  rig.initialized = true;
  rig.root.position.copy(position);
  rig.root.rotation.y = -p.aim;
  rig.root.visible = p.hp > 0;
  const moving = delta.setY(0).applyAxisAngle(up, p.aim);
  if (moving.lengthSq() > 0.0001) moving.normalize();
  else moving.set(1, 0, 0);
  const gait = Math.sin(rig.phase),
    bob = Math.abs(Math.cos(rig.phase)) * 0.8 * rig.stride;
  rig.body.position.y =
    bob + Math.sin(now / 1400) * 0.12 * (1 - Math.min(1, rig.stride));
  rig.body.rotation.z = -0.055 * rig.stride * moving.x;
  rig.body.rotation.x = 0.025 * rig.stride * moving.z;
  rig.gun.rotation.z = p.pitch + gait * 0.008 * rig.stride;
  rig.gun.position.y = 46 + Math.cos(rig.phase * 2) * 0.18 * rig.stride;
  for (const id of WEAPON_IDS)
    rig.gun.getObjectByName(id)!.visible = id === p.weapon;
  rig.root.updateMatrixWorld(true);
  const model = rig.gun.getObjectByName(p.weapon)!;
  for (const arm of rig.arms) {
    const right = arm.shoulder.z > 0;
    const target = new THREE.Vector3(
      right ? 3.2 : -2.4,
      right ? -7 : -5.7,
      right ? 4 : -13,
    );
    rig.body.worldToLocal(model.localToWorld(target));
    const joint = elbow(
      arm.shoulder,
      target,
      13.5,
      14.5,
      new THREE.Vector3(0, right ? -1 : -0.4, right ? 0.8 : -1.5),
    );
    segment(arm.upper, arm.shoulder, joint, 3.1);
    segment(arm.lower, joint, target, 2.65);
    arm.joint.position.copy(joint);
    arm.joint.scale.setScalar(3.1);
    arm.hand.position.copy(target);
    arm.hand.rotation.z = p.pitch;
    const center = arm.shoulder.clone().lerp(joint, 0.35);
    const direction = joint.clone().sub(arm.shoulder).normalize();
    segment(
      arm.band,
      center.clone().addScaledVector(direction, -1.2),
      center.addScaledVector(direction, 1.2),
      3.25,
    );
  }
  for (const leg of rig.legs) {
    const phase = rig.phase + (leg.side === 1 ? Math.PI : 0);
    const stride = Math.sin(phase) * 8 * rig.stride;
    const target = new THREE.Vector3(
      stride * moving.x + 1,
      2.5 + Math.max(0, Math.cos(phase)) * 4.5 * rig.stride,
      leg.side * 5.5 + stride * moving.z * 0.55,
    );
    if (!p.grounded) target.set(3, 8, leg.side * 5.5);
    const hip = new THREE.Vector3(-1, 25 + bob, leg.side * 5.5);
    const knee = elbow(hip, target, 12.5, 12.5, new THREE.Vector3(1, 0, 0));
    segment(leg.upper, hip, knee, 3.7);
    segment(leg.lower, knee, target, 3.1);
    leg.joint.position.copy(knee);
    leg.joint.scale.setScalar(3.5);
    leg.foot.position.copy(target).add(new THREE.Vector3(2, 0, 0));
    leg.foot.rotation.y =
      THREE.MathUtils.clamp(-Math.atan2(moving.z, moving.x), -0.4, 0.4) *
      Math.min(1, rig.stride);
  }
}
