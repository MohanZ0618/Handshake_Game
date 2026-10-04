import { Game, idleInput } from "../shared/game";
import type { WeaponId } from "../shared/weapons";
import { ArenaRenderer } from "../src/renderer";
import { loadWeaponModels } from "../src/weapon-models";

const game = new Game(() => .5);
const player = game.addHuman("preview", "Preview", 0);
Object.assign(player, { x: 340, z: 400, y: 0, aim: .4, pitch: 0, shieldUntil: 0 });
for (const p of game.players) p.shieldUntil = 0;
const renderer = new ArenaRenderer(document.querySelector<HTMLCanvasElement>("#game")!, document.querySelector<HTMLCanvasElement>("#minimap")!, player.id, game.arena, await loadWeaponModels(), "high");
const weapon = document.querySelector<HTMLSelectElement>("#weapon")!;
const finish = document.querySelector<HTMLSelectElement>("#finish")!;
const ads = document.querySelector<HTMLInputElement>("#ads")!;
const scope = document.querySelector<HTMLElement>("#scope")!;
const input = idleInput();
input.aim = player.aim;
let previous = performance.now();
const update = () => {
  player.weapon = weapon.value as WeaponId;
  player.skin = finish.value || null;
  player.ads = input.ads = ads.checked;
  game.now = performance.now() + 2000;
  renderer.accept(game.snapshot());
};
update();
const interval = setInterval(update, 50);
function frame(now: number) {
  renderer.frame(Math.min(.05, (now - previous) / 1000), input, false);
  previous = now;
  scope.style.display = player.weapon === "sniper" && renderer.scopeProgress() > .99 ? "grid" : "none";
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("pagehide", () => { clearInterval(interval); renderer.dispose(); });
