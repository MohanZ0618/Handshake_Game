import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WEAPON_IDS, type WeaponId } from "../shared/weapons";
export type WeaponModels = Record<WeaponId, THREE.Group>;
export async function loadWeaponModels(): Promise<WeaponModels> {
  const loader = new GLTFLoader();
  const loaded = await Promise.all(
    WEAPON_IDS.map(async (id) => {
      const gltf = await loader.loadAsync(`/assets/weapons/${id}.glb`);
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const length = bounds.max.z - bounds.min.z;
      const scale = (id === "smg" ? 34 : id === "shotgun" ? 38 : 44) / length;
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      model.traverse((mesh) => {
        if (mesh instanceof THREE.Mesh) {
          mesh.userData.weaponAsset = true;
          mesh.castShadow = false;
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]) {
            material.depthTest = true;
            material.depthWrite = true;
          }
        }
      });
      const root = new THREE.Group();
      root.add(model);
      return [id, root] as const;
    }),
  );
  return Object.fromEntries(loaded) as WeaponModels;
}
