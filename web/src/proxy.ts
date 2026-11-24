import { NextResponse, type NextRequest } from "next/server";
import { TURNSTILE_COOKIE, getTurnstileConfig, verifySessionToken } from "@/lib/turnstile/session";

/**
 * Requires a passed Turnstile challenge (signed session cookie) before serving
 * the robot STL models. Disabled when Turnstile keys are not configured.
 *
 * `/_next/static` is intentionally NOT gated: the Turnstile gate page itself
 * needs those JS/CSS chunks to render.
 */
export function proxy(request: NextRequest) {
  const config = getTurnstileConfig();
  if (!config) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(TURNSTILE_COOKIE)?.value, config.secretKey)) {
    return NextResponse.next();
  }

  return new NextResponse("Forbidden: complete the Turnstile check on the home page first.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: "/models/:path*",
};
