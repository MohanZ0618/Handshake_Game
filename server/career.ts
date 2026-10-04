import {
  buyItem,
  applyProgress,
  claimGoal,
  createCareer,
  emptyCareer,
  migrateCareer,
  equipItem,
  rankings,
  settleCareer,
  type CareerData,
  type CareerProfile,
  type GoalId,
  type ShopItemId,
} from "../shared/career";
import { validName, type MatchResult, type MatchProgress } from "../shared/game";

const digest = async (token: string) => {
  const bytes = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
type Save = (data: CareerData) => Promise<void>;
export class CareerStore {
  private cache?: CareerData;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private load: () => Promise<CareerData | undefined>,
    private save: Save,
  ) {}
  private async data() {
    this.cache ??= migrateCareer((await this.load()) ?? emptyCareer());
    return this.cache;
  }
  private async read() {
    await this.queue;
    return this.data();
  }
  private change<T>(fn: (data: CareerData) => T): Promise<T> {
    const task = this.queue.then(async () => {
      const data = structuredClone(await this.data());
      const value = fn(data);
      await this.save(data);
      this.cache = data;
      return value;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async resolve(token: string | undefined): Promise<CareerProfile | undefined> {
    if (!token || !/^[a-f0-9-]{72}$/.test(token)) return;
    const data = await this.read();
    return data.profiles[data.tokens[await digest(token)]];
  }
  async progress(update: MatchProgress) {
    return this.change((data) => applyProgress(data, update));
  }
  async flush() { await this.queue; }
  async settle(result: MatchResult) {
    return this.change((data) => settleCareer(data, result));
  }
  async handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return json(null);
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/career/rankings" && request.method === "GET")
        return json(rankings(await this.read()));
      if (path === "/api/career/new" && request.method === "POST") {
        const input = (await request.json()) as { name?: unknown };
        if (!validName(input.name))
          return json({ error: "Invalid callsign." }, 400);
        const token = crypto.randomUUID() + crypto.randomUUID();
        const hash = await digest(token);
        const profile = await this.change((data) =>
          createCareer(data, hash, input.name as string),
        );
        return json({ token, profile });
      }
      const header = request.headers.get("Authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
      const profile = await this.resolve(token);
      if (!profile)
        return json(
          { error: "Career session expired. Create a new profile." },
          401,
        );
      if (path === "/api/career/profile" && request.method === "GET")
        return json({ profile });
      if (request.method !== "POST") return json({ error: "Not found." }, 404);
      const input = (await request.json()) as { id?: string; type?: string };
      if (path === "/api/career/claim") {
        if (
          !input.id ||
          !["kills", "matches", "wins", "charges"].includes(input.id)
        )
          return json({ error: "Unknown objective." }, 400);
        const updated = await this.change((data) => {
          const p = data.profiles[profile.id];
          claimGoal(p, input.id as GoalId);
          return p;
        });
        return json({ profile: updated });
      }
      if (path === "/api/career/buy") {
        const updated = await this.change((data) => {
          const p = data.profiles[profile.id];
          buyItem(p, input.id as ShopItemId);
          return p;
        });
        return json({ profile: updated });
      }
      if (path === "/api/career/equip") {
        if (input.type !== "skin" && input.type !== "tracer")
          return json({ error: "Invalid equipment slot." }, 400);
        const updated = await this.change((data) => {
          const p = data.profiles[profile.id];
          equipItem(
            p,
            (input.id ?? null) as ShopItemId | null,
            input.type as "skin" | "tracer",
          );
          return p;
        });
        return json({ profile: updated });
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Career request failed.",
        },
        400,
      );
    }
  }
}
