# Blockfire Arena

An English-only, real-time browser shooter. Four teams of two share an arena. Human players replace robots immediately; each room has eight combatants.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Use separate browser tabs or computers to join the same six-character room code. To test another computer on the same network, open the development computer's LAN address on port 5173. The development server proxies HTTP and WebSocket traffic to port 8787.

## Rules

- WASD moves. Mouse aims. Hold the left mouse button to fire.
- Four teams, two slots each. Robots fill all vacant slots and display ROBOT.
- Humans earn 1 point for eliminating a robot and 4 for eliminating an enemy human. Robots score zero. Friendly fire is disabled.
- 100 health, 25 damage per hit, three-second respawn, one-second spawn protection.
- Three 90-second rounds, with five-second breaks. Team scores carry between rounds. Tied leaders share victory.
- Players may join mid-match. A departing player becomes a robot; earned team points remain. Personal scores start at zero when rejoining.
- After the final scoreboard, any remaining player can start the next match with Play again.
- Each match uses a new, server-generated 2400 x 1600 arena with mirrored cover and open connecting lanes. The camera follows your character; the minimap shows players, cover and ready supplies.
- Walk over a supply to collect it. All five effects last three seconds: DOUBLE SHOT fires two parallel bullets; RICOCHET LASER fires a piercing beam with up to three reflections and a total range of 1600 units; RAPID FIRE doubles the firing rate; SPEED BOOST increases movement speed by 50%; SHIELD prevents incoming damage. Each laser damages an enemy only once (25 HP), and cannot hurt teammates or its owner.
- Seven supplies spawn in random clear locations, away from walls and team starts. Every type is present at the start of a round. Collected supplies disappear and return ten seconds later at a new random location with a randomly selected type. Locations and collections are authoritative server state shared by all players. Both humans and robots can collect them. A new pickup replaces the current power and resets its three-second timer. Powers clear on respawn; supplies reset between rounds.
- Empty rooms expire after about one minute. There are no accounts or persistent rankings.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run worker:check
```

The engine is shared by the local Node WebSocket server and the Cloudflare Durable Object server. Clients submit inputs, never positions, damage, or scores. The server simulates at 20 Hz. Inputs expire after 300 ms to prevent stuck movement after a dropped connection.

## Publish

The frontend is hosted on Netlify. The room server is hosted on Cloudflare Workers with SQLite-backed Durable Objects. These require your hosting accounts. No game API key, external database, or paid subscription is required to start; provider free usage limits apply.

1. Sign into Cloudflare and deploy the backend:

   ```sh
   npx wrangler login
   npm run worker:deploy
   ```

   Wrangler prints the deployed HTTPS Worker URL and creates the Durable Object bindings from `wrangler.jsonc`.

2. Build and package the frontend using that real URL:

   ```sh
   npm run build
   npm run package -- https://YOUR-WORKER.workers.dev
   ```

3. Sign into https://app.netlify.com/drop and upload `artifacts/netlify-ready`. The frontend's public `config.json` contains the backend URL; it contains no credentials. Do not publish an unconfigured build: its default empty URL is intended for the local proxy.

4. Open the Netlify URL on two computers using different networks. Create a room on the first and join its code on the second. Verify movement, scoring, bot replacement and a complete match. A successful local build is not proof of a public deployment or cross-network testing.

For a later frontend update, repeat build, package, and upload to the same Netlify site's Deploys page. For backend updates, run `npm run worker:deploy`. Deploying a new backend version can interrupt active matches; players can rejoin.

## Project layout

- `shared/`: authoritative simulation, rules, map and typed messages.
- `server/`: local WebSocket server, shared session handling and Cloudflare Worker.
- `src/`: lobby, English UI, player controls and Canvas rendering.
- `tests/`: rule tests and real HTTP/WebSocket integration tests.

## Scope and limits

Desktop keyboard/mouse play is supported. Mobile can browse the lobby. There is one arena theme with randomized layouts, one standard rifle and five temporary powers. All players share the same world, but each camera follows its own player. Lobby numbers count human players currently in rooms, not robots or visitors browsing the site. A room's current match is held in server memory; a server restart can reset it. The public demo limits creation to 50 live rooms. Large-scale operation, persistent accounts, and competitive anti-cheat are outside this version.
