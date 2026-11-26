import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VISITS_KEY,
  getRedisConfig,
  getVisits,
  incrementVisits,
  resetMemoryCount,
} from "../visits/store";

describe("getRedisConfig", () => {
  it("is null without env", () => {
    expect(getRedisConfig({})).toBeNull();
    expect(getRedisConfig({ KV_REST_API_URL: "https://x" })).toBeNull();
  });

  it("reads Vercel KV names, falls back to Upstash names, trims trailing slash", () => {
    expect(getRedisConfig({ KV_REST_API_URL: "https://a/", KV_REST_API_TOKEN: "t" })).toEqual({
      url: "https://a",
      token: "t",
    });
    expect(
      getRedisConfig({ UPSTASH_REDIS_REST_URL: "https://b", UPSTASH_REDIS_REST_TOKEN: "u" }),
    ).toEqual({ url: "https://b", token: "u" });
  });
});

describe("in-memory fallback", () => {
  beforeEach(() => resetMemoryCount());

  it("increments and reads", async () => {
    expect(await getVisits(null)).toBe(0);
    expect(await incrementVisits(null)).toBe(1);
    expect(await incrementVisits(null)).toBe(2);
    expect(await getVisits(null)).toBe(2);
  });
});

describe("redis REST", () => {
  const config = { url: "https://redis.example", token: "secret" };
  const ok = (result: unknown) =>
    new Response(JSON.stringify({ result }), { status: 200 }) as unknown as Response;

  it("POSTs incr with bearer token", async () => {
    const fetchImpl = vi.fn(async () => ok(42));
    expect(await incrementVisits(config, fetchImpl as unknown as typeof fetch)).toBe(42);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://redis.example/incr/${encodeURIComponent(VISITS_KEY)}`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("GET returns 0 when key missing and parses string results", async () => {
    expect(await getVisits(config, (async () => ok(null)) as unknown as typeof fetch)).toBe(0);
    expect(await getVisits(config, (async () => ok("17")) as unknown as typeof fetch)).toBe(17);
  });

  it("throws on HTTP error", async () => {
    const fetchImpl = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(getVisits(config, fetchImpl)).rejects.toThrow();
  });
});
