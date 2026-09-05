import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.XENDIT_SECRET_KEY || "";
  const mode = !key ? "missing" : key.startsWith("xnd_development_") ? "development" : "live";
  return NextResponse.json({
    configured: Boolean(key),
    mode,
    liveAllowed: mode === "live" && process.env.XENDIT_ALLOW_LIVE === "true"
  });
}
