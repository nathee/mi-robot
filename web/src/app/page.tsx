import { cookies } from "next/headers";
import { SimulatorShell } from "@/components/SimulatorShell";
import { TurnstileGate } from "@/components/TurnstileGate";
import { TURNSTILE_COOKIE, getTurnstileConfig, verifySessionToken } from "@/lib/turnstile/session";

export default async function HomePage() {
  const config = getTurnstileConfig();
  if (!config) return <SimulatorShell />;

  const cookieStore = await cookies();
  if (verifySessionToken(cookieStore.get(TURNSTILE_COOKIE)?.value, config.secretKey)) {
    return <SimulatorShell />;
  }

  return (
    <TurnstileGate siteKey={config.siteKey}>
      <SimulatorShell />
    </TurnstileGate>
  );
}
