import { describe, expect, it, vi } from "vitest";
import {
  SITEVERIFY_URL,
  TURNSTILE_SESSION_SECONDS,
  createSessionToken,
  getTurnstileConfig,
  verifySessionToken,
  verifyTurnstileToken,
} from "../turnstile/session";

const SECRET = "test-secret";

describe("getTurnstileConfig", () => {
  it("is disabled when either key is blank", () => {
    expect(getTurnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "a" })).toBeNull();
    expect(getTurnstileConfig({ TURNSTILE_SECRET_KEY: "b" })).toBeNull();
    expect(
      getTurnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: " ", TURNSTILE_SECRET_KEY: "b" }),
    ).toBeNull();
  });

  it("returns both keys when set", () => {
    expect(
      getTurnstileConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "a", TURNSTILE_SECRET_KEY: "b" }),
    ).toEqual({ siteKey: "a", secretKey: "b" });
  });
});

describe("session token", () => {
  const now = 1_700_000_000_000;

  it("round-trips", () => {
    expect(verifySessionToken(createSessionToken(SECRET, now), SECRET, now)).toBe(true);
  });

  it("rejects expired tokens", () => {
    const token = createSessionToken(SECRET, now);
    expect(verifySessionToken(token, SECRET, now + TURNSTILE_SESSION_SECONDS * 1000 + 1000)).toBe(false);
  });

  it("rejects a different secret or tampered expiry", () => {
    const token = createSessionToken(SECRET, now);
    expect(verifySessionToken(token, "other", now)).toBe(false);
    const [, mac] = token.split(".");
    expect(verifySessionToken(`9999999999.${mac}`, SECRET, now)).toBe(false);
  });

  it("rejects malformed values", () => {
    for (const bad of [undefined, "", "abc", ".x", "12x.y"]) {
      expect(verifySessionToken(bad, SECRET, now)).toBe(false);
    }
  });
});

describe("verifyTurnstileToken", () => {
  it("posts secret, response and remoteip to siteverify", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    const result = await verifyTurnstileToken("tok", SECRET, "1.2.3.4", fetchImpl as unknown as typeof fetch);
    expect(result.success).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("fails closed on HTTP and network errors", async () => {
    const httpErr = vi.fn(async () => new Response("x", { status: 500 }));
    expect((await verifyTurnstileToken("t", SECRET, undefined, httpErr as unknown as typeof fetch)).success).toBe(false);
    const netErr = vi.fn(async () => {
      throw new Error("down");
    });
    expect((await verifyTurnstileToken("t", SECRET, undefined, netErr as unknown as typeof fetch)).success).toBe(false);
  });
});
