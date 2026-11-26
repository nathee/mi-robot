import { NextResponse } from "next/server";
import { getVisits, incrementVisits } from "@/lib/visits/store";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

async function respond(op: () => Promise<number>) {
  try {
    return NextResponse.json({ count: await op() }, { headers: NO_STORE });
  } catch (err) {
    console.error("[visits]", err);
    // Counter is non-critical: the UI hides itself when count is null.
    return NextResponse.json({ count: null }, { headers: NO_STORE });
  }
}

export async function GET() {
  return respond(() => getVisits());
}

export async function POST() {
  return respond(() => incrementVisits());
}
