# Blockfire Arena 3D / protocol 3

A first-person browser shooter set in Skybridge, a symmetrical two-level arena. Four teams of two compete in three 90-second rounds. Robots fill vacant slots and participate in scoring. The interface is in English.

## Run locally

Requires Node.js 22 or newer and a desktop browser with WebGL2.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Create a room and share its six-character code. Another tab or computer can join the same room. For a computer on the same network, use the development computer's LAN address on port 5173. Vite proxies HTTP and WebSocket traffic to the room server on port 8787.

If those ports are already serving this project, reuse the running development server. Do not start another copy on the same ports.

## Controls

| Input            | Action                                                     |
| ---------------- | ---------------------------------------------------------- |
| WASD             | Move relative to your view                                 |
| Mouse            | Look and aim horizontally and vertically                   |
| Left mouse, held | Fire                                                       |
| Space            | Jump while grounded                                        |
| Shift            | Dash in the movement direction, or forward when stationary |
| E                | Activate the stored supply                                 |
| 1 / 2 / 3        | Rifle / SMG / shotgun                                      |
| R                | Reload the current magazine                                |
| F                | Replace a stored supply with a nearby supply               |
| Esc              | Release the mouse and open settings; the match continues   |

Click **Click to play** to capture the mouse and enable sound. Some embedded browsers do not support mouse capture. When capture fails, **Play with drag-look** provides a fallback: hold the right mouse button to look, and use the left button to fire. Esc returns to the menu. A standard desktop browser gives the intended first-person controls.

The menu provides volume, mute, mouse sensitivity, and screen shake and Low/High graphics settings. Settings are saved in this browser. Audio uses local Web Audio synthesis; it does not download sound assets. Returning from a background tab requires clicking to resume, and old sound events are skipped.

## Rules

- Eight combatants, four teams, two slots per team. Humans replace robots immediately. There is no friendly fire.
- Every elimination earns the killer and their team **1 point**, whether the killer or victim is human or a robot.
- 100 health, weapon-specific damage, three-second respawn, one-second spawn protection. There is no headshot multiplier. Firing does not cancel spawn protection.
- Three 90-second rounds with five-second breaks. Team points carry across rounds. Tied leaders share victory. **Play again** resets scores for a new match.
- Players can join mid-match. Departing players become robots; team points remain. Rejoining starts a new personal score.
- Skybridge has a 2400 × 1600 footprint, a ground combat area, an upper ring at height 140, and four ramps. The upper ring has outer guardrails and a central opening that players can drop through. Floors, cover, ramps, and guardrails block relevant movement and shots.
- Space jumps with no double jump. Shift dashes 150 units over 150 ms with a four-second cooldown. Cover stops a dash, and dashing provides no invulnerability. Gravity continues during an air dash.
- The minimap marks both levels, cover, ramps, players, and available supplies. Players on the other level appear dimmer.

## Weapons and ammunition

| Weapon       | Damage         | Fire interval | Magazine | Reload | Range |
| ------------ | -------------- | ------------- | -------- | ------ | ----- |
| Pulse rifle  | 25             | 150 ms        | 30       | 1.5 s  | 1200  |
| Ion SMG      | 20             | 100 ms        | 40       | 1.8 s  | 800   |
| Nova shotgun | 8 pellets × 10 | 650 ms        | 6        | 2 s    | 450   |

Hold the fire button for all weapons. Shotgun pellets spread within a six-degree cone. Each weapon keeps its own magazine, with unlimited reserve ammunition. Empty magazines reload automatically. R ignores full magazines. Switching takes 250 ms, cancels an unfinished reload, preserves ammunition, and keeps the previous shot cooldown. Reloading allows movement, jump, dash and supply activation. Death and a new round restore all magazines and equip the rifle. Robots obey the same rules and choose a weapon by distance. The 20 Hz server quantizes shot timing to simulation ticks; rapid fire retains the configured average cadence.

Local GLB weapon assets load before gameplay. The requested 2021 Modular Gun Pack is temporarily unavailable because its Google Drive download returned a quota error. This build uses the same author's CC0 **Sci-Fi Gun Pack (May 2018)** as a temporary replacement, rather than claiming the requested pack was obtained. Sources, conversion mapping and license are in [ATTRIBUTION.md](public/assets/weapons/ATTRIBUTION.md). The three GLBs total 149483 bytes after gzip. They require no runtime requests to external asset sites.

## Supplies

Seven supplies spawn at validated clear positions on both levels. All five types are present at round start. Walk over a supply to store it without activating it. You can store one supply and have one active effect. Press E to consume the stored supply when no effect is active. With an occupied storage slot, press F near a supply to replace it. A collected supply returns after ten seconds at a new random location and may change type.

| Supply         | Effect                                                        | Duration  |
| -------------- | ------------------------------------------------------------- | --------- |
| DOUBLE SHOT    | Two parallel projectile groups per shot                       | 4 seconds |
| RICOCHET LASER | Piercing beam, up to three reflections, 1600-unit total range | 3 seconds |
| RAPID FIRE     | Twice the firing rate                                         | 4 seconds |
| SPEED BOOST    | 50% faster movement                                           | 5 seconds |
| SHIELD         | Prevents incoming damage                                      | 2 seconds |

Laser and double shot each consume one magazine round per trigger. Laser uses the equipped weapon's cadence and always deals 25 damage. The first-person laser connects the visible purple muzzle to the authoritative first endpoint. The HUD separates STORED / PRESS E from ACTIVE / time remaining; an active effect must finish before the next one can be used.

Each laser damages an enemy only once per shot, for 25 HP. Beams reflect from three-dimensional surfaces including floors and ramps. Teammates and the owner are immune. Stored and active supplies clear on death and between rounds. Dash cooldown resets on respawn.

## Simulation and checks

The local Node server and Cloudflare Durable Object server share the same authoritative 20 Hz simulation. Clients submit validated inputs, never positions, damage, or scores. Movement expires after 300 ms without fresh input. Action counters and input sequence numbers prevent duplicate or stale actions. Protocol version 3 is required; old clients receive a refresh message before getting a player slot.

The client continuously predicts local physics, records actual input durations and replays only unacknowledged slices. Visual corrections under 24 units decay over about 100 ms; larger errors, respawn and round changes reset immediately. Camera sweeps constrain both motion and smoothing. Other players use time-ordered snapshots with 100 ms interpolation delay and at most 50 ms extrapolation. The map is transmitted once in the welcome message. Server events drive hit markers, damage direction, muzzle flashes, death fragments, dash trails, and positional sound. Event IDs prevent replay on repeated snapshots or initial room entry. Robot navigation uses A* across a map-derived route graph, including ramps and jumpable low obstacles.

Run the checks in order:

```sh
npm run typecheck
npm test
npm run build
npm run worker:check
```

With the local server running, test eight real WebSocket connections:

```sh
node scripts/smoke.mjs http://127.0.0.1:8787
```

Tests cover scoring, respawn, powers, dash and jump, pitched shots, slabs and ramp collisions, laser reflections, robot movement and collection, action deduplication, protocol rejection, event replay, room capacity, and disconnected-player replacement.

For browser acceptance, join two clients to one room and check movement, jumping, dashing, supplies, both levels, menus, sound and mute, round transitions, final scores, and rematch. Repeat leaving and rejoining and inspect browser errors. Record the actual device and viewport when measuring FPS; a displayed frame rate is not a guarantee for other devices.

## Build outputs and publishing

- `dist/`: static frontend, including bundled Three.js and `config.json`.
- `worker-dist/worker.js`: bundled backend from the Worker dry run.
- `artifacts/blockfire-v3-release.zip`: source and both build outputs, with the verification record and these instructions.

The frontend uses Netlify and the room server uses Cloudflare Workers with SQLite-backed Durable Objects. Publishing requires your hosting accounts. The default empty `public/config.json` backend URL is for the local proxy. Configure the actual deployed backend URL before uploading a static frontend.

1. Authenticate and deploy the backend from this project:

   ```sh
   npx wrangler login
   npm run worker:deploy
   ```

2. Build and package with the actual HTTPS Worker URL printed by Wrangler:

   ```sh
   npm run build
   npm run package -- https://YOUR-WORKER.workers.dev
   ```

3. Upload `artifacts/netlify-ready` to https://app.netlify.com/drop or the existing site's Deploys page. The backend URL is public configuration, not a credential.
4. Test the hosted frontend from two separate networks, including a complete match and rejoining after disconnect.

Deploy the protocol-3 backend and frontend together. Backend deployment can interrupt active rooms. Players can refresh and rejoin; in-memory matches can reset on a server restart. Local builds and tests do not establish public deployment or cross-network acceptance.

On a restricted Windows workspace, Wrangler's user-profile log/cache writes may be unavailable. Its dry run can use workspace logs with metrics disabled:

```powershell
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) 'artifacts/wrangler.log'
npm run worker:check
```

## Project layout and limits

- `shared/`: map geometry, kinematic collision and raycasting, navigation, rules, and typed protocol messages.
- `server/`: local HTTP/WebSocket server, shared room sessions, and Cloudflare Worker.
- `src/`: lobby and HUD, input, continuous prediction/interpolation, Three.js world/weapon rendering, model loading, local performance metrics, audio, and event handling.
- `tests/`: simulation and real HTTP/WebSocket integration tests.

This version has one fixed arena, three weapons, five supplies, and desktop keyboard/mouse controls. Mobile can browse the lobby. There are no accounts or persistent rankings. Lobby counts include humans in rooms, not robots. Empty rooms expire after about a minute. The room limit is 50; large-scale hosting and competitive anti-cheat are outside this version.

## Performance and reproducible browser fixtures

Low is the default: pixel ratio capped at 1, shadows disabled. High permits 1.5 and cached static world shadows. The minimap updates at 10 Hz; projectile and particle objects are reused, HUD elements are cached and HTML only changes when its content changes. Hover the FPS label for mean FPS, P95/P99 frame times, >50 ms frame count, snapshot P95 interval and correction magnitudes. Metrics stay in memory and are never uploaded.

The verification record in `artifacts/verification-v3.md` contains measured limitations as well as passed checks. To reproduce controlled power and close-wall visuals without modifying the normal game server:

```sh
npm run build
npx tsx scripts/browser-fixture.ts
```

Open http://127.0.0.1:5180, join TEST3D, and use drag-look if capture is unavailable. In that terminal use `power laser` (then E and fire in the browser), `power shield`, `wall`, `status`, `finish`, or `quit`. This fixture serves the production build locally and injects server state only for acceptance testing. It is not included in the production bundle.
