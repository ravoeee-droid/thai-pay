# ThaiPay MVP

Mobile-first PWA for scanning Thai PromptPay QR codes and testing Xendit Thailand payout routing.

## Current scope

ThaiPay currently provides a **safe sandbox payout prototype**, not a live Revolut-to-PromptPay remittance product.

Implemented:

- iPhone/Android camera QR scanner plus image upload
- Bank of Thailand Thai QR / EMVCo TLV decoder
- PromptPay tag `29` detection
- Merchant-presented PromptPay AID `A000000677010111`
- Customer-presented AID `A000000677010114` detection and blocking
- Bill Payment tag `30` detection including domestic AID `A000000677010112` and cross-border AID `A000000677012006`
- Mobile proxy mapping to Xendit `MOBILE_NO`
- National-ID / Tax-ID ambiguity is surfaced to the user instead of guessed
- CRC-16 validation; invalid/unverifiable QRs cannot be paid
- Fixed amount protection for dynamic QRs
- Xendit Payout API v3 server route (`POST /v3/payouts`)
- Deterministic idempotency key per payment intent
- Server-side re-decode of the original QR; client routing fields are not trusted
- Same-origin check on the payout write route
- Xendit payout status polling and final success/failure UI
- Authenticated Xendit payout webhook endpoint (`x-callback-token`)
- Xendit API health check without exposing balance or secret data
- Local sandbox transaction history
- Installable PWA shell
- Hard live-payout gate and separate foreign-card bridge approval gate

## Architecture boundary

Xendit supports a Thailand Local PromptPay payout rail, but **ordinary card acquiring must not be used as an unapproved payment intermediary / aggregator for unrelated third-party beneficiaries**. Therefore this repository does not enable `foreign card -> arbitrary PromptPay recipient` merely by combining Xendit Cards and Payouts.

The intended live architecture must be explicitly approved by Xendit under the appropriate regulated product, likely involving Remittance, Banking-as-a-Service or E-Money-as-a-Service. See `docs/XENDIT_APPROVAL_CHECKLIST.md`.

## Environment

```bash
XENDIT_SECRET_KEY=xnd_development_...
XENDIT_ALLOW_LIVE=false
XENDIT_CARD_BRIDGE_APPROVED=false
XENDIT_WEBHOOK_TOKEN=...
```

Never expose the secret key as `NEXT_PUBLIC_*` and never commit it to GitHub.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Live gate

Do not set either live flag to `true` until all of the following are complete:

1. Xendit confirms the correct legal entity / onboarding path for the business.
2. Thailand PromptPay payout corridor is enabled for the account.
3. Exact Thailand routing-value formats are confirmed.
4. Xendit approves the end-user funding/remittance structure.
5. Foreign-issued card funding is explicitly approved for this structure.
6. End-user KYC/AML ownership, limits and monitoring are defined.
7. Persistent transaction storage, authentication, device binding and production rate limiting are added.
8. Webhook token is configured and payout state is persisted server-side.

## Key public references

- Xendit Thailand payout coverage: https://docs.xendit.co/docs/payout-coverage-thailand
- Xendit Payout API v3: https://docs.xendit.co/apidocs/create-payout-v3
- Xendit payout status: https://docs.xendit.co/apidocs/get-payout-v3-by-id
- Xendit balance API: https://docs.xendit.co/apidocs/get-balance
- Xendit regional product terms: https://www.xendit.co/en/legal-regional-product/
- Bank of Thailand Thai QR Payment Standard: https://www.bot.or.th/content/dam/bot/documents/th/our-roles/payment-systems/about-payment-systems/ThaiQRCode_Payment_Standard.pdf
