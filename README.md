# ThaiPay MVP

Mobile-first PWA for scanning Thai PromptPay QR codes and testing Xendit payout routing.

## What is implemented

- iPhone/Android camera QR scanner plus image upload
- EMVCo TLV / PromptPay decoder
- Detects PromptPay credit-transfer AID `A000000677010111`
- Extracts phone or national-ID proxies when present
- Detects Bill Payment AID `A000000677010112` and blocks unsafe payout reinterpretation
- CRC-16 validation
- Xendit Payout API v3 server route (`POST /v3/payouts`)
- Xendit development-key detection and hard live-key safety lock
- Local sandbox payment history
- Installable PWA shell

## Important architecture boundary

This MVP does **not** claim that a foreign Revolut/Visa/Mastercard can legally be charged and immediately forwarded to a third-party PromptPay recipient. Xendit must approve the correct e-money / BaaS / card-funding flow for that use case. Until then, the payout route uses the Xendit balance/sandbox rail only.

Not every Thai QR is a generic PromptPay payout address. Personal PromptPay proxies can be extracted from compatible QRs; bill-payment and some merchant QRs require their own payment rail and are intentionally blocked.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `XENDIT_SECRET_KEY` to a **development** key. Never expose it as a `NEXT_PUBLIC_*` variable or commit it to GitHub.

### Vercel

Add `XENDIT_SECRET_KEY` as a server-side Environment Variable. Keep `XENDIT_ALLOW_LIVE=false` during testing.

## Xendit API assumptions

The server uses Payout API v3 (`/v3/payouts`, API version `2025-09-01`). The QR proxy is mapped to `MOBILE_NO` or `NATIONAL_ID`. Xendit's exact Thailand-account field requirements can depend on the enabled payout corridor/account configuration; API errors are surfaced to the UI rather than retried automatically.

## Live checklist

1. Correct Xendit business type/KYC.
2. Thailand PromptPay payout corridor enabled.
3. Confirm exact supported Thailand routing fields with Xendit.
4. Confirm card/e-money funding permission for foreign tourists.
5. Configure payout webhooks and server-side transaction storage.
6. Add authentication, rate limits, device binding and stronger transaction confirmation.
7. Only then consider `XENDIT_ALLOW_LIVE=true`.
