import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie that remembers a passed Turnstile challenge (server-only, HMAC-signed). */
export const TURNSTILE_COOKIE = "mirobot_ts";
/** How long a passed challenge stays valid. */
export const TURNSTILE_SESSION_SECONDS = 12 * 60 * 60;

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

/** Returns config when both keys are set; null means CAPTCHA is disabled. */
export function getTurnstileConfig(env: Record<string, string | undefined> = process.env): TurnstileConfig | null {
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (!siteKey || !secretKey) return null;
  return { siteKey, secretKey };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`turnstile-session:${payload}`).digest("base64url");
}

/** Creates a cookie value `<expiryEpochSeconds>.<hmac>`. */
export function createSessionToken(secret: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TURNSTILE_SESSION_SECONDS;
  return `${exp}.${sign(String(exp), secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(expStr)) return false;
  if (Number(expStr) <= Math.floor(nowMs / 1000)) return false;
  const expected = Buffer.from(sign(expStr, secret));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface SiteverifyResult {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
}

/** Validates a widget token with Cloudflare's Siteverify API. */
export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteIp?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SiteverifyResult> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const res = await fetchImpl(SITEVERIFY_URL, { method: "POST", body });
    if (!res.ok) return { success: false, "error-codes": [`http-${res.status}`] };
    return (await res.json()) as SiteverifyResult;
  } catch {
    return { success: false, "error-codes": ["network-error"] };
  }
}
