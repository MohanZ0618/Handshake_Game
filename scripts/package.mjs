import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
const backend = process.argv[2];
if (!backend || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(backend))
  throw new Error("Usage: npm run package -- https://your-worker.workers.dev");
await readFile("dist/index.html");
await writeFile(
  "dist/config.json",
  JSON.stringify({ serverUrl: backend.replace(/\/$/, "") }, null, 2),
);
await mkdir("artifacts/netlify-ready", { recursive: true });
await cp("dist", "artifacts/netlify-ready", { recursive: true });
console.log("Ready: upload artifacts/netlify-ready to Netlify Drop.");
