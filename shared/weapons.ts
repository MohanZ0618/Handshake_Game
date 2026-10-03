export const WEAPON_IDS = ["rifle", "smg", "shotgun"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];
export const WEAPONS = {
  rifle: {
    label: "PULSE RIFLE",
    damage: 25,
    interval: 150,
    magazine: 30,
    reload: 1500,
    range: 1200,
    pellets: 1,
  },
  smg: {
    label: "ION SMG",
    damage: 20,
    interval: 100,
    magazine: 40,
    reload: 1800,
    range: 800,
    pellets: 1,
  },
  shotgun: {
    label: "NOVA SHOTGUN",
    damage: 10,
    interval: 650,
    magazine: 6,
    reload: 2000,
    range: 450,
    pellets: 8,
  },
} as const;
export const fullAmmo = (): Record<WeaponId, number> => ({
  rifle: 30,
  smg: 40,
  shotgun: 6,
});
export function validWeapon(v: unknown): v is WeaponId {
  return WEAPON_IDS.includes(v as WeaponId);
}
