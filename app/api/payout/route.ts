import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTING_TYPES = new Set(["MOBILE_NO", "NATIONAL_ID", "BUSINESS_REG_NO"]);

function cleanName(name: string) {
  return name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 50);
}

export async function POST(request: NextRequest) {
  const secret = process.env.XENDIT_SECRET_KEY || "";
  if (!secret) return NextResponse.json({ error: "XENDIT_NOT_CONFIGURED", message: "Xendit Secret Key fehlt auf dem Server." }, { status: 503 });

  const isDevelopment = secret.startsWith("xnd_development_");
  if (!isDevelopment && process.env.XENDIT_ALLOW_LIVE !== "true") {
    return NextResponse.json({ error: "LIVE_PAYOUTS_LOCKED", message: "Live-Payouts sind absichtlich gesperrt. Verwende zuerst einen Development-Key." }, { status: 403 });
  }

  let input: any;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  const amount = Number(input?.amount);
  const recipientName = cleanName(String(input?.recipientName || ""));
  const promptPay = input?.promptPay || {};
  const routingType = String(promptPay.routingType || "");
  const proxyValue = String(promptPay.proxyValue || "").trim();

  if (!Number.isFinite(amount) || amount <= 0 || amount > 2_000_000) return NextResponse.json({ error: "INVALID_AMOUNT", message: "Betrag muss zwischen 0 und 2.000.000 THB liegen." }, { status: 400 });
  if (recipientName.length < 2) return NextResponse.json({ error: "RECIPIENT_NAME_REQUIRED", message: "Empfängername fehlt." }, { status: 400 });
  if (!promptPay.payoutCompatible || !ROUTING_TYPES.has(routingType) || !proxyValue) return NextResponse.json({ error: "UNSUPPORTED_PROMPTPAY_QR", message: "Dieser QR enthält keinen unterstützten PromptPay-Payout-Proxy." }, { status: 400 });

  const names = recipientName.split(" ");
  const givenName = names.shift() || recipientName;
  const surname = names.join(" ") || "Recipient";
  const referenceId = `thaipay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const minor = Math.round(amount * 100);

  // Xendit Payout API v3. Thailand uses the local PromptPay payout rail.
  // MOBILE_NO/NATIONAL_ID are derived only from the explicit PromptPay proxy in the QR.
  const payout = {
    reference_id: referenceId,
    recipient: {
      type: "INDIVIDUAL",
      given_name: givenName,
      surname,
      relationship: "SUPPLIER",
      address: { country: "TH" },
      account_details: {
        currency: "THB",
        account_country: "TH",
        account_holder_name: recipientName,
        account_number: proxyValue,
        routing_type_1: routingType,
        routing_value_1: proxyValue
      }
    },
    payout_details: {
      source_currency: "THB",
      source_amount: minor,
      destination_currency: "THB"
    },
    source_of_fund: "BUSINESS_REVENUE",
    purpose_code: "TRAVEL"
  };

  const idempotencyKey = crypto.randomUUID();
  const auth = Buffer.from(`${secret}:`).toString("base64");

  let response: Response;
  try {
    response = await fetch("https://api.xendit.co/v3/payouts", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "api-version": "2025-09-01",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify(payout),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ error: "XENDIT_UNREACHABLE", message: "Xendit API konnte nicht erreicht werden." }, { status: 502 });
  }

  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 500) }; }

  if (!response.ok) {
    return NextResponse.json({ error: "XENDIT_REJECTED", message: body?.message || body?.error_code || "Xendit hat den Payout abgelehnt.", xendit: body }, { status: response.status });
  }

  return NextResponse.json({ ...body, sandbox: isDevelopment, thaiPayReference: referenceId });
}
