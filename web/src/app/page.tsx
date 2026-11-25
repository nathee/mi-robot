import { cookies } from "next/headers";
import { RobotGate } from "@/components/RobotGate";
import { TurnstileGate } from "@/components/TurnstileGate";
import { TURNSTILE_COOKIE, getTurnstileConfig, verifySessionToken } from "@/lib/turnstile/session";

export default async function HomePage() {
  const config = getTurnstileConfig();
  if (!config) return <RobotGate />;

  const cookieStore = await cookies();
  if (verifySessionToken(cookieStore.get(TURNSTILE_COOKIE)?.value, config.secretKey)) {
    return <RobotGate />;
  }

  return (
    <TurnstileGate siteKey={config.siteKey}>
      <RobotGate />
    </TurnstileGate>
  );
}
