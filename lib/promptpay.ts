export type PromptPayKind = "personal" | "merchant" | "bill" | "unknown";
export type PromptPayRouting = "MOBILE_NO" | "NATIONAL_ID" | "BUSINESS_REG_NO";

export type PromptPayData = {
  raw: string;
  validFormat: boolean;
  validCrc: boolean | null;
  currency?: string;
  country?: string;
  amount?: number;
  merchantName?: string;
  kind: PromptPayKind;
  proxyType?: "phone" | "national_id" | "ewallet" | "merchant_id";
  proxyValue?: string;
  routingType?: PromptPayRouting;
  payoutCompatible: boolean;
  note?: string;
};

type Tlv = { id: string; value: string };

function tlv(input: string): Tlv[] {
  const result: Tlv[] = [];
  let offset = 0;
  while (offset + 4 <= input.length) {
    const id = input.slice(offset, offset + 2);
    const lenText = input.slice(offset + 2, offset + 4);
    const len = Number.parseInt(lenText, 10);
    if (!/^\d{2}$/.test(id) || Number.isNaN(len) || len < 0) break;
    const start = offset + 4;
    const end = start + len;
    if (end > input.length) break;
    result.push({ id, value: input.slice(start, end) });
    offset = end;
  }
  return result;
}

function field(items: Tlv[], id: string) {
  return items.find((item) => item.id === id)?.value;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0066")) return `+66${digits.slice(4)}`;
  if (digits.startsWith("66")) return `+${digits}`;
  if (digits.startsWith("0")) return `+66${digits.slice(1)}`;
  return value;
}

function crc16CcittFalse(input: string) {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function validateCrc(raw: string) {
  const marker = raw.lastIndexOf("6304");
  if (marker < 0 || marker + 8 !== raw.length) return null;
  const provided = raw.slice(-4).toUpperCase();
  return crc16CcittFalse(raw.slice(0, -4)) === provided;
}

export function maskPromptPay(value?: string) {
  if (!value) return "–";
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

export function decodePromptPay(payload: string): PromptPayData {
  const raw = payload.trim();
  const top = tlv(raw);
  const validFormat = field(top, "00") === "01" && top.length > 2;
  const currency = field(top, "53");
  const country = field(top, "58");
  const amountRaw = field(top, "54");
  const amount = amountRaw ? Number.parseFloat(amountRaw) : undefined;
  const merchantName = field(top, "59")?.trim() || undefined;

  const base: PromptPayData = {
    raw,
    validFormat,
    validCrc: validateCrc(raw),
    currency,
    country,
    amount: Number.isFinite(amount) ? amount : undefined,
    merchantName,
    kind: "unknown",
    payoutCompatible: false
  };

  if (!validFormat) return { ...base, note: "Kein gültiger EMVCo/PromptPay QR-Code erkannt." };
  if (currency && currency !== "764") return { ...base, note: "QR-Code verwendet nicht THB (ISO 764)." };

  const accountFields = top.filter(({ id }) => {
    const n = Number.parseInt(id, 10);
    return n >= 26 && n <= 51;
  });

  for (const account of accountFields) {
    const nested = tlv(account.value);
    const aid = field(nested, "00");

    // BOT PromptPay credit-transfer AID.
    if (aid === "A000000677010111") {
      const phone = field(nested, "01");
      const nationalId = field(nested, "02");
      const ewallet = field(nested, "03");

      if (phone) {
        return {
          ...base,
          kind: merchantName ? "merchant" : "personal",
          proxyType: "phone",
          proxyValue: normalizePhone(phone),
          routingType: "MOBILE_NO",
          payoutCompatible: true,
          note: "PromptPay-Mobilnummer erkannt."
        };
      }
      if (nationalId) {
        return {
          ...base,
          kind: merchantName ? "merchant" : "personal",
          proxyType: "national_id",
          proxyValue: nationalId,
          routingType: "NATIONAL_ID",
          payoutCompatible: true,
          note: "PromptPay-ID erkannt."
        };
      }
      if (ewallet) {
        return {
          ...base,
          kind: "merchant",
          proxyType: "ewallet",
          proxyValue: ewallet,
          payoutCompatible: false,
          note: "E-Wallet/Merchant-Identifier erkannt. Xendit-Payout-Mapping muss hierfür separat freigeschaltet werden."
        };
      }
    }

    // BOT Bill Payment AID. A bill/merchant QR cannot safely be converted into a generic payout proxy.
    if (aid === "A000000677010112") {
      return {
        ...base,
        kind: "bill",
        proxyType: "merchant_id",
        proxyValue: field(nested, "01"),
        payoutCompatible: false,
        note: "Bill-Payment/Merchant-QR erkannt. Dieser QR braucht einen eigenen Payment-Rail und wird nicht als Payout umgedeutet."
      };
    }
  }

  return { ...base, note: "Thai QR erkannt, aber kein direkt auszahlbarer PromptPay-Proxy gefunden." };
}
