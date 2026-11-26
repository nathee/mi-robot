/**
 * Site-wide visit counter.
 *
 * Production (Vercel) stores the count in Upstash Redis via its REST API, so no
 * extra dependency is needed. Add Upstash Redis to the Vercel project and it
 * injects KV_REST_API_URL / KV_REST_API_TOKEN automatically.
 * Without those env vars an in-memory counter is used (local dev only).
 */

export const VISITS_KEY = "mirobot:visits";

export interface RedisConfig {
  url: string;
  token: string;
}

type Env = Record<string, string | undefined>;

export function getRedisConfig(env: Env = process.env): RedisConfig | null {
  const url = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

let memoryCount = 0;

/** Test helper. */
export function resetMemoryCount(): void {
  memoryCount = 0;
}

async function redisCommand(
  config: RedisConfig,
  command: "incr" | "get",
  fetchImpl: typeof fetch,
): Promise<number> {
  const res = await fetchImpl(`${config.url}/${command}/${encodeURIComponent(VISITS_KEY)}`, {
    method: command === "incr" ? "POST" : "GET",
    headers: { Authorization: `Bearer ${config.token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${command} failed: ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`redis ${command} error: ${data.error}`);
  const n = Number(data.result ?? 0);
  if (!Number.isFinite(n)) throw new Error(`redis ${command} returned non-number`);
  return n;
}

export async function incrementVisits(
  config: RedisConfig | null = getRedisConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!config) return ++memoryCount;
  return redisCommand(config, "incr", fetchImpl);
}

export async function getVisits(
  config: RedisConfig | null = getRedisConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!config) return memoryCount;
  return redisCommand(config, "get", fetchImpl);
}
