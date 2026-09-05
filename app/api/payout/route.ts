import { NextRequest, NextResponse } from "next/server";
import { decodePromptPay, PromptPayRouting } from "@/lib/promptpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTING_TYPES = new Set<PromptPayRouting>(["MOBILE_NO", "NATIONAL_ID", "BUSINESS_REG_NO"]);
const INTENT_ID = /^[a-f0-9-]{20,64}$/i;

function cleanName(name: string) {
  return name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 50);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function individualRecipient(name: string) {
  const names = name.split(" ").filter(Boolean);
  const givenName = names.shift() || name;
  const surname = names.join(" ") || "Recipient";
  return { type: "INDIVIDUAL", given_name: givenName, surname } as const;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "CROSS_ORIGIN_BLOCKED" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 24_000) {
    return NextResponse.json({ error: "REQUEST_TOO_LARGE" }, { status: 413 });
  }

  const secret = process.env.XENDIT_SECRET_KEY || "";
  if (!secret) {
    return NextResponse.json(
      { error: "XENDIT_NOT_CONFIGURED", message: "Xendit Secret Key fehlt auf dem Server." },
      { status: 503 }
    );
  }

  const isDevelopment = secret.startsWith("xnd_development_");
  if (!isDevelopment && process.env.XENDIT_ALLOW_LIVE !== "true") {
    return NextResponse.json(
      { error: "LIVE_PAYOUTS_LOCKED", message: "Live-Payouts sind absichtlich gesperrt. Verwende zuerst einen Development-Key." },
      { status: 403 }
    );
  }

  let input: any;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const rawQr = String(input?.rawQr || "").trim();
  const amount = Number(input?.amount);
  const recipientName = cleanName(String(input?.recipientName || ""));
  const intentId = String(input?.intentId || "");
  const requestedIdRouting = String(input?.idRouting || "") as PromptPayRouting;

  if (!INTENT_ID.test(intentId)) {
    return NextResponse.json({ error: "INVALID_INTENT_ID", message: "Ungültige Zahlungs-ID." }, { status: 400 });
  }
  if (!rawQr || rawQr.length > 4096) {
    return NextResponse.json({ error: "INVALID_QR", message: "QR-Payload fehlt oder ist zu groß." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 2_000_000) {
    return NextResponse.json({ error: "INVALID_AMOUNT", message: "Betrag muss zwischen 0 und 2.000.000 THB liegen." }, { status: 400 });
  }
  if (recipientName.length < 2) {
    return NextResponse.json({ error: "RECIPIENT_NAME_REQUIRED", message: "Empfängername fehlt." }, { status: 400 });
  }

  // Security boundary: never trust proxy/routing fields supplied by the browser.
  // Re-decode the original QR server-side and derive the payout route from it.
  const decoded = decodePromptPay(rawQr);
  if (!decoded.validFormat || decoded.validCrc !== true || !decoded.payoutCompatible || !decoded.proxyValue) {
    return NextResponse.json(
      { error: "UNSUPPORTED_PROMPTPAY_QR", message: decoded.note || "Dieser QR ist nicht sicher als PromptPay-Payout verwendbar." },
      { status: 400 }
    );
  }

  if (decoded.amount != null && Math.abs(decoded.amount - amount) > 0.005) {
    return NextResponse.json(
      { error: "AMOUNT_MISMATCH", message: `Der QR ist fest auf ${decoded.amount.toFixed(2)} THB gesetzt. Der Betrag darf nicht verändert werden.` },
      { status: 400 }
    );
  }

  let routingType = decoded.routingType;
  if (decoded.routingChoiceRequired) {
    if (requestedIdRouting !== "NATIONAL_ID" && requestedIdRouting !== "BUSINESS_REG_NO") {
      return NextResponse.json(
        { error: "ID_ROUTING_REQUIRED", message: "Bitte bestätigen, ob die 13-stellige PromptPay-ID eine National-ID oder Business/Tax-ID ist." },
        { status: 400 }
      );
    }
    routingType = requestedIdRouting;
  }

  if (!routingType || !ROUTING_TYPES.has(routingType)) {
    return NextResponse.json({ error: "UNSUPPORTED_ROUTING" }, { status: 400 });
  }

  const isBusinessRecipient = routingType === "BUSINESS_REG_NO";
  const recipientIdentity = isBusinessRecipient
    ? { type: "BUSINESS" as const, business_name: recipientName }
    : individualRecipient(recipientName);

  const referenceId = `thaipay-${intentId}`;
  const minor = Math.round(amount * 100);

  const payout = {
    reference_id: referenceId,
    recipient: {
      ...recipientIdentity,
      relationship: "CUSTOMER",
      address: {
        country: "TH",
        ...(decoded.merchantCity ? { city: decoded.merchantCity.slice(0, 255) } : {})
      },
      account_details: {
        currency: "THB",
        account_country: "TH",
        account_holder_name: recipientName,
        account_number: decoded.proxyValue,
        routing_type_1: routingType,
        routing_value_1: decoded.proxyValue
      }
    },
    payout_details: {
      source_currency: "THB",
      source_amount: minor,
      destination_currency: "THB"
    },
    source_of_fund: "BUSINESS_REVENUE",
    purpose_code: "TRAVEL",
    metadata: {
      thaipay_intent_id: intentId,
      qr_kind: decoded.kind,
      qr_proxy_type: decoded.proxyType || "unknown",
      qr_poi_method: decoded.poiMethod || "unknown"
    }
  };

  const auth = Buffer.from(`${secret}:`).toString("base64");

  let response: Response;
  try {
    response = await fetch("https://api.xendit.co/v3/payouts", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "api-version": "2025-09-01",
        "idempotency-key": referenceId
      },
      body: JSON.stringify(payout),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ error: "XENDIT_UNREACHABLE", message: "Xendit API konnte nicht erreicht werden." }, { status: 502 });
  }

  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "XENDIT_REJECTED", message: body?.message || body?.error_code || "Xendit hat den Payout abgelehnt.", xendit: body },
      { status: response.status }
    );
  }

  return NextResponse.json({ ...body, sandbox: isDevelopment, thaiPayReference: referenceId });
}
