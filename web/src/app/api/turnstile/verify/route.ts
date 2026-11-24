import { NextResponse, type NextRequest } from "next/server";
import {
  TURNSTILE_COOKIE,
  TURNSTILE_SESSION_SECONDS,
  createSessionToken,
  getTurnstileConfig,
  verifyTurnstileToken,
} from "@/lib/turnstile/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const config = getTurnstileConfig();
  if (!config) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token;
  } catch {
    // fall through to the empty-token error below
  }
  // Turnstile tokens are at most 2048 characters.
  if (!token || token.length > 2048) {
    return NextResponse.json({ ok: false, errors: ["missing-input-response"] }, { status: 400 });
  }

  const remoteIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined;

  const result = await verifyTurnstileToken(token, config.secretKey, remoteIp);
  if (!result.success) {
    return NextResponse.json({ ok: false, errors: result["error-codes"] ?? [] }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TURNSTILE_COOKIE, createSessionToken(config.secretKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TURNSTILE_SESSION_SECONDS,
  });
  return res;
}
