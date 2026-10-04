export const WEAPON_IDS = ["rifle", "smg", "shotgun", "sniper"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];
export const WEAPONS = {
  rifle: {
    label: "ASSAULT RIFLE",
    damage: 25,
    interval: 150,
    magazine: 30,
    reload: 1500,
    range: 1200,
    pellets: 1,
  },
  smg: {
    label: "COMPACT SMG",
    damage: 20,
    interval: 100,
    magazine: 40,
    reload: 1800,
    range: 800,
    pellets: 1,
  },
  shotgun: {
    label: "PUMP SHOTGUN",
    damage: 10,
    interval: 650,
    magazine: 6,
    reload: 2000,
    range: 450,
    pellets: 8,
  },
  sniper: {
    label: "MARKSMAN RIFLE",
    damage: 200,
    interval: 1500,
    magazine: 5,
    reload: 0,
    range: 2400,
    pellets: 1,
  },
} as const;
export const fullAmmo = (): Record<WeaponId, number> => ({
  rifle: 30,
  smg: 40,
  shotgun: 6,
  sniper: 0,
});
export function validWeapon(v: unknown): v is WeaponId {
  return WEAPON_IDS.includes(v as WeaponId);
}
