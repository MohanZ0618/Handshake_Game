import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WEAPON_IDS, type WeaponId } from "../shared/weapons";

export type WeaponModels = Record<WeaponId, THREE.Group>;
export const WEAPON_PRESENTATION: Record<WeaponId, {
  opticY: number; opticRear: number; eyeRelief: number; muzzleZ: number;
  hip: { x: number; y: number; z: number };
}> = {
  rifle: { opticY: 9.4, opticRear: 5, eyeRelief: 13, muzzleZ: -35, hip: { x: 12, y: -12, z: -34 } },
  smg: { opticY: 8.8, opticRear: 4, eyeRelief: 12, muzzleZ: -24, hip: { x: 11, y: -11, z: -30 } },
  shotgun: { opticY: 8.9, opticRear: 4, eyeRelief: 14, muzzleZ: -38, hip: { x: 12, y: -12, z: -36 } },
  sniper: { opticY: 11.2, opticRear: 9, eyeRelief: 12, muzzleZ: -47, hip: { x: 12, y: -14, z: -39 } },
};
export function weaponViewPose(id: WeaponId, raised: number) {
  const p = WEAPON_PRESENTATION[id], t = THREE.MathUtils.clamp(raised, 0, 1);
  return {
    x: THREE.MathUtils.lerp(p.hip.x, 0, t),
    y: THREE.MathUtils.lerp(p.hip.y, -p.opticY, t),
    z: THREE.MathUtils.lerp(p.hip.z, -p.opticRear - p.eyeRelief, t),
  };
}
function brushedTexture() {
  const data = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const tone = 180 + ((x * 73 + y * 19 + (x ^ y) * 7) % 48);
    data.set([tone, tone, tone, 255], (y * 128 + x) * 4);
  }
  const texture = new THREE.DataTexture(data, 128, 128);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 6);
  texture.needsUpdate = true;
  return texture;
}
function createWeapon(id: WeaponId, texture: THREE.Texture) {
  const root = new THREE.Group();
  const finish = new THREE.MeshPhysicalMaterial({
    color: id === "shotgun" ? "#72503a" : id === "sniper" ? "#62634a" : id === "smg" ? "#45494c" : "#6b6e5c",
    metalness: .48, roughness: .38, clearcoat: .35, clearcoatRoughness: .25,
    roughnessMap: texture, bumpMap: texture, bumpScale: .025,
  });
  const steel = new THREE.MeshStandardMaterial({ color: "#31373b", metalness: .88, roughness: .3, roughnessMap: texture, bumpMap: texture, bumpScale: .018 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#14191b", metalness: .03, roughness: .88, bumpMap: texture, bumpScale: .04 });
  const bright = new THREE.MeshStandardMaterial({ color: "#8a9193", metalness: .95, roughness: .22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#7faaa5", metalness: .15, roughness: .08, transparent: true, opacity: .09, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide });
  const part = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material = finish) =>
    part(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * .05), x, y, z, material);
  const tube = (x: number, y: number, z: number, radius: number, length: number, material: THREE.Material = steel, open = false) => {
    const mesh = part(new THREE.CylinderGeometry(radius, radius, length, 24, 1, open), x, y, z, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const ring = (y: number, z: number, radius: number, thickness: number) =>
    part(new THREE.TorusGeometry(radius, thickness, 8, 32), 0, y, z, steel);
  const rail = (y: number, z: number, length: number) => {
    box(0, y, z, 3.8, .8, length, steel);
    for (let t = -length / 2; t <= length / 2; t += 1.5) box(0, y + .55, z + t, 4.4, .65, .7, steel);
  };
  box(0, -7, 4, 4.5, 10, 5, rubber).rotation.x = -.22;
  box(-2.4, -6, -.5, .65, 5, 7, steel);
  box(2.4, -6, -.5, .65, 5, 7, steel);
  box(0, -8.3, -.5, 5, .65, 7, steel);
  box(0, -5, 1, .6, 3, .6, bright).rotation.x = -.2;
  for (const side of [-1, 1]) {
    box(side * 3.55, 1.3, 1, .3, 2, 5.8, rubber);
    box(side * 3.75, 1.6, 1, .2, .65, 4.6, bright);
    box(side * 3.55, -1.8, 3, .25, .3, 9, steel);
  }
  if (id === "rifle") {
    box(0, .5, 1, 7, 7, 17);
    box(0, -.5, -13, 6.4, 5.8, 18);
    tube(0, 0, -28, 1.15, 15);
    tube(0, 0, -34, 1.55, 3, steel, true);
    tube(0, 0, 14, 1.8, 11);
    box(0, -1.5, 18, 5.6, 8, 10);
    box(0, -1.5, 23, 6.2, 9, 1.8, rubber);
    box(0, -8, -5, 4.5, 12, 7).rotation.x = -.16;
    for (const y of [-5, -8, -11]) for (const side of [-1, 1]) box(side * 2.3, y, -5, .25, .45, 5.5, rubber);
    for (let z = -20; z < -5; z += 2.8) for (const side of [-1, 1]) box(side * 3.25, .1, z, .25, 2, 1.7, rubber);
    rail(4.6, -5, 28);
  } else if (id === "smg") {
    box(0, .7, 0, 6.5, 6.5, 17);
    box(0, 0, -11, 5.4, 5.5, 10);
    tube(0, 0, -19, 1.1, 9);
    tube(0, 0, -23, 1.6, 3, steel, true);
    box(0, -9, -5, 3.6, 15, 4.6, steel).rotation.x = -.12;
    for (const y of [-5, -8, -11, -14]) for (const side of [-1, 1]) box(side * 1.9, y, -5, .2, .35, 3.6, rubber);
    for (const x of [-2, 2]) tube(x, 1, 13, .6, 13);
    box(0, -1.4, 20, 5.8, 8.2, 2, rubber);
    rail(4.2, -2, 18);
    for (const z of [-13, -10, -7]) box(2.8, 0, z, .3, 2, 1.6, rubber);
  } else if (id === "shotgun") {
    box(0, .5, 2, 6, 6.7, 15, steel);
    tube(0, 1.2, -22, 1.35, 33, steel, true);
    tube(0, -2.2, -18, 1.4, 25);
    box(0, -1.2, -17, 6, 5.2, 10);
    for (let z = -21; z < -12; z += 1.4) box(0, -3.7, z, 6.2, .35, .5, rubber);
    box(0, -2, 15, 5.4, 7.5, 13).rotation.x = .11;
    box(0, -3, 22, 6.1, 9, 2, rubber);
    box(0, 4.3, -11, 1.2, .8, 39, steel);
    rail(4.3, 1, 10);
  } else {
    box(0, 1.5, 2, 7, 7, 20);
    tube(0, 1, -27, 1.4, 35);
    tube(0, 1, -46, 2, 4, steel, true);
    box(0, -.8, -14, 6.4, 5.8, 15);
    box(0, -1.5, 17, 6.4, 8.5, 13);
    box(0, -1.8, 24, 7, 10, 1.8, rubber);
    box(0, 3, 17, 5.5, 2.3, 9, rubber);
    box(0, -6, -3, 5, 7.5, 7, steel);
    tube(4.8, 2, 3, .6, 3, bright);
    part(new THREE.SphereGeometry(1.2, 12, 8), 5, -.1, 4, rubber);
    for (const side of [-1, 1]) tube(side * 3.5, -6, -21, .65, 12).rotation.set(.7, 0, side * .3);
    rail(5.6, -1, 19);
  }
  const optic = WEAPON_PRESENTATION[id], scoped = id === "rifle" || id === "sniper";
  const radius = id === "sniper" ? 4.2 : scoped ? 3.2 : 3;
  const length = id === "sniper" ? 22 : scoped ? 9 : 4;
  const front = optic.opticRear - length;
  box(0, optic.opticY - radius - 1.2, (front + optic.opticRear) / 2, 3.2, 2.6, scoped ? 7 : 3, steel);
  // Open cylinders and rings keep the sight line genuinely transparent.
  if (id === "shotgun") {
    for (const z of [front, optic.opticRear]) {
      box(-3.4, optic.opticY, z, .7, 6.5, .8, rubber);
      box(3.4, optic.opticY, z, .7, 6.5, .8, rubber);
      box(0, optic.opticY + 3.2, z, 7.2, .7, .8, steel);
      box(0, optic.opticY - 3.2, z, 7.2, .7, .8, steel);
    }
    part(new THREE.PlaneGeometry(6.1, 5.8), 0, optic.opticY, front + .05, glass);
  } else {
    tube(0, optic.opticY, (front + optic.opticRear) / 2, radius, length, rubber, true);
    ring(optic.opticY, optic.opticRear, radius, .45);
    ring(optic.opticY, front, radius, .4);
    part(new THREE.CircleGeometry(radius - .45, 32), 0, optic.opticY, front + .05, glass);
  }
  if (scoped) {
    part(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 16), 0, optic.opticY + radius + .6, -1, steel);
    tube(radius + .7, optic.opticY, -1, 1.3, 2.4).rotation.set(0, 0, Math.PI / 2);
  }
  for (const side of [-1, 1]) for (const z of [1, -7]) tube(side * 3.55, 1.3, z, .35, .4, bright).rotation.set(0, 0, Math.PI / 2);
  const handStart = root.children.length;
  const sleeve = new THREE.MeshStandardMaterial({ color: "#484e3b", roughness: .92, bumpMap: texture, bumpScale: .07 });
  box(3.7, -7, 4, 5.5, 5, 6.5, rubber);
  for (let z = 1.8; z < 7; z += 1.4) box(2.8, -8.6, z, 4.4, 1.2, 1.1, rubber);
  const arm = part(new THREE.CapsuleGeometry(3.2, 15, 4, 12), 7, -13, 15, sleeve);
  arm.rotation.set(.65, 0, -.5);
  box(-2, -5.7, -13, 5.5, 4, 7, rubber);
  const support = part(new THREE.CapsuleGeometry(3, 16, 4, 12), -5, -11, -5, sleeve);
  support.rotation.set(-.7, 0, .35);
  const viewArms = new THREE.Group();
  viewArms.name = "view-arms";
  for (const child of root.children.slice(handStart)) {
    child.userData.weaponAsset = true;
    child.userData.skinProtected = true;
    viewArms.add(child);
  }
  root.add(viewArms);
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...root.children]) if (child instanceof THREE.Mesh) {
    const material = child.material as THREE.Material, batch = batches.get(material) ?? [];
    batch.push(child); batches.set(material, batch);
  }
  for (const [material, meshes] of batches) {
    const pieces = meshes.map(mesh => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(pieces);
    if (!merged) throw new Error(`Unable to assemble ${id}.`);
    for (const mesh of meshes) { root.remove(mesh); mesh.geometry.dispose(); }
    pieces.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.weaponAsset = true;
    mesh.userData.skinAccent = material === finish;
    mesh.userData.skinProtected = material !== finish;
    root.add(mesh);
  }
  return root;
}
export function cloneWorldWeapon(source: THREE.Group) {
  const model = source.clone(true);
  const viewArms = model.getObjectByName("view-arms");
  if (viewArms) viewArms.visible = false;
  return model;
}
export async function loadWeaponModels(): Promise<WeaponModels> {
  const texture = brushedTexture();
  return Object.fromEntries(WEAPON_IDS.map(id => [id, createWeapon(id, texture)])) as WeaponModels;
}
