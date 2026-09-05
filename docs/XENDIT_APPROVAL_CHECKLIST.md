# Xendit approval checklist for ThaiPay

ThaiPay's target user flow is **not** a normal merchant checkout. The user is a foreign tourist who wants to fund a payment and send THB to a third-party Thai PromptPay recipient. Xendit's ordinary card acquiring terms restrict acting as a payment intermediary / aggregator, so the card-to-third-party-PromptPay bridge must stay disabled until Xendit explicitly approves the correct regulated product structure.

## Questions for Xendit

1. Can a German-registered sole proprietor / foreign business operate the Thailand PromptPay payout rail, or is a Thai legal entity required for this use case?
2. Which Xendit product should be used when an end-user funds a transfer and the beneficiary is an unrelated third-party PromptPay recipient: Remittance, Banking-as-a-Service, E-Money-as-a-Service, xenPlatform, or another product?
3. Can foreign tourists be onboarded using a foreign passport and Thailand travel/visa data?
4. Can the first-mile funding source be a **foreign-issued Visa/Mastercard** (including Revolut cards)?
5. If card funding is allowed, is Xendit the merchant of record / licensed remittance or e-money provider for the transfer, or what licensing/MCC structure is required?
6. Who is responsible for end-user KYC/AML, sanctions screening, transaction monitoring, limits, and source-of-funds checks?
7. For Thailand Local PromptPay payouts, confirm the exact accepted value format for `MOBILE_NO`, `NATIONAL_ID`, and `BUSINESS_REG_NO`.
8. BOT tag 29 subtag `02` can mean either National ID or Tax ID. Should ThaiPay map a Tax ID to `BUSINESS_REG_NO`?
9. Are personal PromptPay IDs and business PromptPay IDs both supported on the payout rail?
10. What product/rail should be used for BOT tag 30 Bill Payment / merchant QRs? They are intentionally blocked from generic payout conversion in the MVP.
11. Are e-wallet PromptPay IDs supported as a payout destination and, if so, which `routing_type_1` should be used?
12. What webhook events and failure codes are specific to the Thailand PromptPay corridor?
13. Are there additional recipient fields required for B2C vs B2B Thailand payouts beyond the generic Payout API v3 schema?
14. What are the applicable fees, card settlement timing, payout funding/settlement timing, reserves and chargeback exposure for this exact flow?

## Product gates in code

- `XENDIT_ALLOW_LIVE=false` keeps live payouts hard-locked.
- `XENDIT_CARD_BRIDGE_APPROVED=false` keeps foreign-card funding visibly disabled.
- The server re-decodes the original PromptPay QR and does not trust client-provided routing values.
- Fixed QR amounts cannot be changed by the client.
- CRC-invalid QRs are blocked.
- Bill Payment, customer-presented, e-wallet and reserved bank-account identifiers are blocked until their rail is explicitly confirmed.
