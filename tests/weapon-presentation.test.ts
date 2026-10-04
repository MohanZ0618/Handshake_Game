import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { loadWeaponModels, weaponViewPose, WEAPON_PRESENTATION } from "../src/weapon-models";
import { WEAPON_IDS } from "../shared/weapons";

describe("mounted weapon optics", () => {
  it.each(WEAPON_IDS)("brings %s closer and aligns its optic with the eye", (id) => {
    const hip = weaponViewPose(id, 0), ads = weaponViewPose(id, 1), optic = WEAPON_PRESENTATION[id];
    expect(ads.z).toBeGreaterThan(hip.z);
    expect(ads.x).toBe(0);
    expect(ads.y + optic.opticY).toBeCloseTo(0);
    expect(ads.z + optic.opticRear).toBeCloseTo(-optic.eyeRelief);
  });

  it("keeps every physical optic sight line free of opaque geometry", async () => {
    const models = await loadWeaponModels();
    for (const id of WEAPON_IDS) {
      const model = models[id], pose = weaponViewPose(id, 1);
      model.position.set(pose.x, pose.y, pose.z);
      model.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), .1, 100);
      const blockers = ray.intersectObject(model, true).filter(hit => {
        const material = (hit.object as THREE.Mesh).material as THREE.Material;
        return !material.transparent;
      });
      expect(blockers, `${id} blocks its optic`).toHaveLength(0);
    }
  });
});
