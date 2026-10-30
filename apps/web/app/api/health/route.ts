import { NextResponse } from "next/server";

// Public liveness probe only — no configuration or security claims are exposed here.
export async function GET() {
  return NextResponse.json({ ok: true });
}
