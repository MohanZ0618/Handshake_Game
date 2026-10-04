import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { Game, type Player } from "../shared/game";
import { WEAPON_IDS } from "../shared/weapons";
import { createCharacterRig, updateCharacterRig } from "../src/character-rig";
import {
  cloneWorldWeapon,
  loadWeaponModels,
  type WeaponModels,
} from "../src/weapon-models";

let models: WeaponModels;
beforeAll(async () => {
  models = await loadWeaponModels();
});
function fixture() {
  const p: Player = {
    ...new Game(() => 0.5).players[0],
    x: 0,
    y: 0,
    z: 0,
    hp: 100,
    grounded: true,
    pitch: 0,
    aim: 0,
  };
  const rig = createCharacterRig(
    models,
    "#ff7446",
    (color) => new THREE.MeshStandardMaterial({ color }),
  );
  updateCharacterRig(rig, p, 0, 0.05);
  return { rig, p };
}

describe("third-person character pose", () => {
  it.each(WEAPON_IDS)(
    "hides the %s first-person arms without changing the original model",
    (id) => {
      const copy = cloneWorldWeapon(models[id]);
      expect(copy.getObjectByName("view-arms")?.visible).toBe(false);
      expect(models[id].getObjectByName("view-arms")?.visible).toBe(true);
    },
  );

  it.each(WEAPON_IDS)("keeps both hands attached to %s while aiming", (id) => {
    const { rig, p } = fixture();
    p.weapon = id;
    for (const pitch of [-0.6, 0, 0.6]) {
      p.pitch = pitch;
      p.aim = 0.9;
      updateCharacterRig(rig, p, 100, 0.05);
      rig.root.updateMatrixWorld(true);
      const model = rig.gun.getObjectByName(id)!;
      expect(rig.arms).toHaveLength(2);
      for (const arm of rig.arms) {
        const right = arm.shoulder.z > 0;
        const grip = model.localToWorld(
          new THREE.Vector3(
            right ? 3.2 : -2.4,
            right ? -7 : -5.7,
            right ? 4 : -13,
          ),
        );
        expect(
          arm.hand.getWorldPosition(new THREE.Vector3()).distanceTo(grip),
        ).toBeLessThan(0.001);
        expect(arm.upper.scale.y).toBeCloseTo(13.5);
        expect(arm.lower.scale.y).toBeLessThan(15);
      }
      expect(rig.gun.children.filter((model) => model.visible)).toHaveLength(1);
    }
  });

  it("alternates footsteps during running and settles when movement stops", () => {
    const { rig, p } = fixture();
    const differences: number[] = [];
    for (let frame = 1; frame <= 22; frame++) {
      p.x += 10.5;
      updateCharacterRig(rig, p, frame * 50, 0.05);
      differences.push(
        rig.legs[0].foot.position.x - rig.legs[1].foot.position.x,
      );
    }
    expect(Math.min(...differences)).toBeLessThan(-8);
    expect(Math.max(...differences)).toBeGreaterThan(8);
    expect(rig.body.position.y).toBeGreaterThan(0);
    for (let frame = 23; frame <= 55; frame++)
      updateCharacterRig(rig, p, frame * 50, 0.05);
    expect(rig.stride).toBeLessThan(0.001);
    expect(rig.legs[0].foot.position.x).toBeCloseTo(
      rig.legs[1].foot.position.x,
      2,
    );
  });

  it("moves feet sideways during strafing and tucks them while airborne", () => {
    const { rig, p } = fixture();
    p.z += 10.5;
    updateCharacterRig(rig, p, 50, 0.05);
    expect(
      rig.legs.some(
        (leg) => Math.abs(leg.foot.position.z - leg.side * 5.5) > 0.1,
      ),
    ).toBe(true);
    p.grounded = false;
    updateCharacterRig(rig, p, 100, 0.05);
    for (const leg of rig.legs) expect(leg.foot.position.y).toBe(8);
  });

  it("resets the gait after death, respawn and teleport", () => {
    const { rig, p } = fixture();
    p.x += 10.5;
    updateCharacterRig(rig, p, 50, 0.05);
    p.hp = 0;
    updateCharacterRig(rig, p, 100, 0.05);
    expect(rig.root.visible).toBe(false);
    expect(rig.stride).toBe(0);
    p.hp = 100;
    p.life++;
    p.x = 800;
    updateCharacterRig(rig, p, 150, 0.05);
    expect(rig.root.visible).toBe(true);
    expect(rig.phase).toBe(0);
    p.x += 10.5;
    updateCharacterRig(rig, p, 200, 0.05);
    p.z = 800;
    updateCharacterRig(rig, p, 250, 0.05);
    expect(rig.speed).toBe(0);
    expect(rig.phase).toBe(0);
  });
});
