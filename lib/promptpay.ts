export type PromptPayKind = "promptpay" | "customer_presented" | "bill" | "unknown";
export type PromptPayRouting = "MOBILE_NO" | "NATIONAL_ID" | "BUSINESS_REG_NO";
export type PromptPayProxyType =
  | "phone"
  | "national_or_tax_id"
  | "ewallet"
  | "bank_account"
  | "merchant_id"
  | "unknown";

export type PromptPayData = {
  raw: string;
  validFormat: boolean;
  validCrc: boolean | null;
  currency?: string;
  country?: string;
  amount?: number;
  merchantName?: string;
  merchantCity?: string;
  referenceLabel?: string;
  poiMethod?: "static" | "dynamic" | "unknown";
  kind: PromptPayKind;
  aid?: string;
  accountTag?: string;
  proxyType?: PromptPayProxyType;
  proxyValue?: string;
  rawProxyValue?: string;
  routingType?: PromptPayRouting;
  routingChoiceRequired?: boolean;
  payoutCompatible: boolean;
  note?: string;
};

type Tlv = { id: string; value: string };

const PROMPTPAY_MERCHANT_AID = "A000000677010111";
const PROMPTPAY_CUSTOMER_AID = "A000000677010114";
const BILL_PAYMENT_AID = "A000000677010112";
const CROSS_BORDER_BILL_PAYMENT_AID = "A000000677012006";

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

function poiMethod(value?: string): PromptPayData["poiMethod"] {
  if (value === "11") return "static";
  if (value === "12") return "dynamic";
  return value ? "unknown" : undefined;
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
  const validCrc = validateCrc(raw);
  const currency = field(top, "53");
  const country = field(top, "58");
  const amountRaw = field(top, "54");
  const amount = amountRaw ? Number.parseFloat(amountRaw) : undefined;
  const merchantName = field(top, "59")?.trim() || undefined;
  const merchantCity = field(top, "60")?.trim() || undefined;
  const extra = tlv(field(top, "62") || "");
  const referenceLabel = field(extra, "05")?.trim() || undefined;

  const base: PromptPayData = {
    raw,
    validFormat,
    validCrc,
    currency,
    country,
    amount: Number.isFinite(amount) ? amount : undefined,
    merchantName,
    merchantCity,
    referenceLabel,
    poiMethod: poiMethod(field(top, "01")),
    kind: "unknown",
    payoutCompatible: false
  };

  if (!validFormat) return { ...base, note: "Kein gültiger EMVCo/Thai-QR erkannt." };
  if (validCrc !== true) {
    return {
      ...base,
      note: validCrc === false ? "CRC-Prüfung fehlgeschlagen. QR wird aus Sicherheitsgründen blockiert." : "QR enthält keine verifizierbare CRC-Prüfsumme."
    };
  }
  if (currency !== "764") return { ...base, note: "QR verwendet nicht THB (ISO 764)." };
  if (country && country !== "TH") return { ...base, note: "QR ist nicht als Thailand-Zahlung gekennzeichnet." };

  // Bank of Thailand Thai QR Payment Standard reserves top-level tag 29 for
  // PromptPay credit transfer with a PromptPay ID.
  const promptPay = top.find((item) => item.id === "29");
  if (promptPay) {
    const nested = tlv(promptPay.value);
    const aid = field(nested, "00");

    if (aid === PROMPTPAY_CUSTOMER_AID) {
      return {
        ...base,
        kind: "customer_presented",
        aid,
        accountTag: "29",
        payoutCompatible: false,
        note: "Customer-presented PromptPay QR erkannt. Dieser QR ist kein Empfänger-Payout-Ziel."
      };
    }

    if (aid === PROMPTPAY_MERCHANT_AID) {
      const phone = field(nested, "01");
      const nationalOrTaxId = field(nested, "02");
      const ewallet = field(nested, "03");
      const bankAccount = field(nested, "04");

      if (phone) {
        return {
          ...base,
          kind: "promptpay",
          aid,
          accountTag: "29",
          proxyType: "phone",
          rawProxyValue: phone,
          proxyValue: normalizePhone(phone),
          routingType: "MOBILE_NO",
          payoutCompatible: true,
          note: "PromptPay-Mobilnummer erkannt und CRC verifiziert."
        };
      }

      if (nationalOrTaxId) {
        return {
          ...base,
          kind: "promptpay",
          aid,
          accountTag: "29",
          proxyType: "national_or_tax_id",
          rawProxyValue: nationalOrTaxId,
          proxyValue: nationalOrTaxId,
          routingChoiceRequired: true,
          payoutCompatible: true,
          note: "13-stellige National-ID oder Tax-ID erkannt. Vor Auszahlung muss der Typ bestätigt werden."
        };
      }

      if (ewallet) {
        return {
          ...base,
          kind: "promptpay",
          aid,
          accountTag: "29",
          proxyType: "ewallet",
          rawProxyValue: ewallet,
          proxyValue: ewallet,
          payoutCompatible: false,
          note: "PromptPay E-Wallet-ID erkannt. Für diesen Proxy ist noch kein sicher bestätigtes Xendit-Payout-Mapping hinterlegt."
        };
      }

      if (bankAccount) {
        return {
          ...base,
          kind: "promptpay",
          aid,
          accountTag: "29",
          proxyType: "bank_account",
          rawProxyValue: bankAccount,
          proxyValue: bankAccount,
          payoutCompatible: false,
          note: "PromptPay Bankkonto-Identifier erkannt. Laut BOT ist dieses Feld reserviert; automatisches Routing bleibt gesperrt."
        };
      }

      return {
        ...base,
        kind: "promptpay",
        aid,
        accountTag: "29",
        note: "PromptPay AID erkannt, aber kein unterstützter Empfänger-Proxy gefunden."
      };
    }
  }

  // Bank of Thailand reserves tag 30 for Bill Payment / merchant identifiers.
  const bill = top.find((item) => item.id === "30");
  if (bill) {
    const nested = tlv(bill.value);
    const aid = field(nested, "00");
    if (aid === BILL_PAYMENT_AID || aid === CROSS_BORDER_BILL_PAYMENT_AID) {
      return {
        ...base,
        kind: "bill",
        aid,
        accountTag: "30",
        proxyType: "merchant_id",
        rawProxyValue: field(nested, "01"),
        proxyValue: field(nested, "01"),
        payoutCompatible: false,
        note: aid === CROSS_BORDER_BILL_PAYMENT_AID
          ? "Cross-border Bill-Payment QR erkannt. Dieser braucht einen eigenen Payment-Rail."
          : "Bill-Payment/Merchant-QR erkannt. Dieser wird nicht als generischer PromptPay-Payout umgedeutet."
      };
    }
  }

  return { ...base, note: "Thai QR erkannt, aber kein direkt auszahlbarer PromptPay-Proxy gefunden." };
}
