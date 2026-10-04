import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Game } from "../shared/game";
import type { WeaponId } from "../shared/weapons";
import { createCharacterRig, updateCharacterRig } from "../src/character-rig";
import { loadWeaponModels } from "../src/weapon-models";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a7b3ae");
const generator = new THREE.PMREMGenerator(renderer),
  room = new RoomEnvironment();
const environment = generator.fromScene(room);
scene.environment = environment.texture;
generator.dispose();
room.dispose();
scene.add(new THREE.HemisphereLight("#e2edf6", "#665c43", 2));
const sun = new THREE.DirectionalLight("#fff1d6", 3);
sun.position.set(100, 160, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -110,
  right: 110,
  top: 110,
  bottom: -110,
  near: 0.5,
  far: 500,
});
sun.shadow.bias = -0.001;
scene.add(sun, sun.target);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshStandardMaterial({ color: "#8e8976", roughness: 0.92 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(10000, 200, "#756f5e", "#756f5e");
grid.position.y = 0.02;
scene.add(grid);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 12000);
const player = {
  ...new Game(() => 0.5).players[0],
  x: 0,
  y: 0,
  z: 0,
  aim: 0,
  pitch: 0,
  hp: 100,
  grounded: true,
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
const rig = createCharacterRig(await loadWeaponModels(), "#ff7446", (color) => {
  let material = materials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    materials.set(color, material);
  }
  return material;
});
scene.add(rig.root);
const weapon = document.querySelector<HTMLSelectElement>("#weapon")!;
const motion = document.querySelector<HTMLSelectElement>("#motion")!;
const view = document.querySelector<HTMLSelectElement>("#view")!;
let previous = performance.now(),
  stopped = false;
function frame(now: number) {
  if (stopped) return;
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  player.weapon = weapon.value as WeaponId;
  player.grounded = motion.value !== "jump";
  player.y = player.grounded ? 0 : 14;
  if (motion.value === "run") player.x += 210 * dt;
  if (motion.value === "strafe") player.z += 210 * dt;
  updateCharacterRig(rig, player, now, dt);
  const offset =
    view.value === "front"
      ? new THREE.Vector3(110, 64, 105)
      : view.value === "rear"
        ? new THREE.Vector3(-110, 64, -105)
        : new THREE.Vector3(5, 47, 150);
  camera.position.set(player.x, 0, player.z).add(offset);
  camera.lookAt(player.x + 8, 33, player.z);
  sun.position.set(player.x + 100, 160, player.z + 100);
  sun.target.position.set(player.x, 0, player.z);
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => {
  stopped = true;
  environment.dispose();
  renderer.dispose();
});
