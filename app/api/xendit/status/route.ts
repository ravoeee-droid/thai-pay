import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.XENDIT_SECRET_KEY || "";
  const mode = !key ? "missing" : key.startsWith("xnd_development_") ? "development" : "live";

  let apiReachable: boolean | null = null;
  if (key) {
    try {
      const auth = Buffer.from(`${key}:`).toString("base64");
      const response = await fetch("https://api.xendit.co/balance?account_type=CASH", {
        headers: { Authorization: `Basic ${auth}` },
        cache: "no-store"
      });
      apiReachable = response.ok;
    } catch {
      apiReachable = false;
    }
  }

  return NextResponse.json({
    configured: Boolean(key),
    mode,
    apiReachable,
    liveAllowed: mode === "live" && process.env.XENDIT_ALLOW_LIVE === "true",
    cardBridgeApproved: process.env.XENDIT_CARD_BRIDGE_APPROVED === "true"
  });
}
