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
- Xendit payout status endpoint (`GET /api/payout/:id`)
- Authenticated Xendit payout webhook endpoint (`POST /api/xendit/webhook`)
- Xendit development-key detection and hard live-key safety lock
- Local sandbox payment history
- Installable PWA shell

## Verified Xendit facts

Xendit's current Payout API v3 uses `/v3/payouts` with API version `2025-09-01`. Thailand is supported over the local PromptPay payout rail in THB. Xendit documents a maximum transaction amount of THB 2,000,000 and routing types including `MOBILE_NO`, `NATIONAL_ID` and `BUSINESS_REG_NO`. Amounts in Payout API v3 are sent in minor units.

Xendit's documented THB **balance top-up** method is bank transfer + proof upload. Card acceptance / foreign-card processing is a separate Money-In product. Therefore this project does **not** pretend that charging a Revolut/Visa/Mastercard and immediately forwarding those funds to an arbitrary PromptPay recipient is already approved.

Xendit also documents Pay-On-Behalf-Of (POBO) as case-by-case approval, commonly involving remittance licensing. A live tourist wallet / card-to-PromptPay product therefore requires explicit approval for the exact funding and payout model.

## Important architecture boundary

The current MVP is a **sandbox + payout-rail prototype**. It can safely decode supported personal PromptPay proxies and exercise the Xendit development payout flow, but live consumer card funding remains locked until Xendit approves the use case.

Not every Thai QR is a generic PromptPay payout address. Personal PromptPay proxies can be extracted from compatible QRs; bill-payment and some merchant QRs require their own payment rail and are intentionally blocked.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `XENDIT_SECRET_KEY` to a **development** key. Never expose it as a `NEXT_PUBLIC_*` variable or commit it to GitHub.

For webhooks, also set `XENDIT_WEBHOOK_TOKEN` from the Xendit Dashboard webhook settings.

### Vercel

Add these as server-side Environment Variables:

- `XENDIT_SECRET_KEY`
- `XENDIT_WEBHOOK_TOKEN`
- `XENDIT_ALLOW_LIVE=false`

Configure the Xendit payout webhook URL as:

`https://YOUR-DEPLOYMENT/api/xendit/webhook`

Keep live mode disabled during testing.

## Live checklist

1. Correct Xendit business type/KYC.
2. Thailand PromptPay payout corridor enabled for the account.
3. Confirm the exact Thailand recipient field requirements with Xendit.
4. Obtain written approval for the intended foreign-card / e-money funding model.
5. Configure payout webhooks and persistent server-side transaction storage.
6. Add user authentication, rate limiting, device binding and strong transaction confirmation.
7. Only then consider `XENDIT_ALLOW_LIVE=true`.

## Security

The Xendit Secret API Key must only exist server-side. The repository intentionally contains placeholders only. Uploaded/private API credentials must never be committed to this public repository.
