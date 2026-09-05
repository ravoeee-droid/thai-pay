import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN || "";
  if (!expected) {
    return NextResponse.json(
      { error: "WEBHOOK_TOKEN_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const received = request.headers.get("x-callback-token") || "";
  if (!received || !safeEqual(received, expected)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const event = String(payload?.event || "");
  if (!event.startsWith("v3_payout.")) {
    // Acknowledge authenticated Xendit events that are not part of the payout
    // integration, but do not process them as payout state changes.
    return NextResponse.json({ received: true, ignored: true });
  }

  const data = payload?.data || payload;
  // No recipient PII is logged. Production should persist this in a database
  // once authentication and per-user transaction storage are added.
  console.info("xendit.payout.webhook", {
    event,
    payout_id: data?.payout_id,
    reference_id: data?.reference_id,
    status: data?.status,
    failure_code: data?.failure_code,
    updated: data?.updated
  });

  return NextResponse.json({ received: true });
}
