import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYOUT_ID = /^po-[0-9a-f-]{20,}$/i;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!PAYOUT_ID.test(id)) {
    return NextResponse.json({ error: "INVALID_PAYOUT_ID" }, { status: 400 });
  }

  const secret = process.env.XENDIT_SECRET_KEY || "";
  if (!secret) {
    return NextResponse.json(
      { error: "XENDIT_NOT_CONFIGURED", message: "Xendit Secret Key fehlt auf dem Server." },
      { status: 503 }
    );
  }

  const auth = Buffer.from(`${secret}:`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`https://api.xendit.co/v3/payouts/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "api-version": "2025-09-01"
      },
      cache: "no-store"
    });
  } catch {
    return NextResponse.json(
      { error: "XENDIT_UNREACHABLE", message: "Xendit API konnte nicht erreicht werden." },
      { status: 502 }
    );
  }

  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error: "XENDIT_REJECTED",
        message: body?.message || body?.error_code || "Payout-Status konnte nicht geladen werden."
      },
      { status: response.status }
    );
  }

  // Only return the fields the mobile client needs. Do not mirror the complete
  // Xendit recipient/business object back to an unauthenticated browser.
  return NextResponse.json({
    payout_id: body?.payout_id,
    reference_id: body?.reference_id,
    status: body?.status,
    type: body?.type,
    source_currency: body?.source_currency,
    source_amount: body?.source_amount,
    destination_currency: body?.destination_currency,
    destination_amount: body?.destination_amount,
    estimated_arrival_time: body?.estimated_arrival_time,
    failure_code: body?.failure_code,
    updated: body?.updated
  });
}
