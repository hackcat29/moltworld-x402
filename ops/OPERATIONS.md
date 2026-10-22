# Operations runbook

## Money flows

| Flow | When | From → to | Source of truth |
| --- | --- | --- | --- |
| Payment | every paid request | payer → `AVM_ADDRESS` (via facilitator) | `mw_requests.txid` |
| Refund | settled work failed (image/voice/video error, failed or expired video job) | payout wallet → payer | `mw_refunds` |
| Usage rebate | chat used less than its `max_tokens` budget | payout wallet → payer, batched at `REBATE_MIN_PAYOUT_USD` | `mw_credits` / `mw_payouts` |
| Creator payout | marketplace call completed (85% by default) | payout wallet → creator, batched at `CREATOR_PAYOUT_MIN_USD` | `mw_credits` / `mw_payouts` |

Keep `AVM_ADDRESS` cold (or a multisig): the gateway only ever needs its address. Fund the
payout hot wallet (`PAYOUT_WALLET_MNEMONIC`) with a float of USDC and ~1 ALGO for fees, and
top it up from revenue. Payouts are atomic groups of up to 16 transfers; a failed group pays
nobody and is retried.

Without a payout wallet, refunds and payouts stay `pending` and are listed at `/v1/ops/*`.
Nothing is ever marked sent without an on-chain txid.

## Request states

`verified` (chat: payment checked, work running) → `completed` (settled and served, receipt
issued) · `failed` (work failed before settlement; not charged) · `settle_failed` (work ran but
settlement failed; output withheld) · `settled` (upfront: paid, work running) →
`refund_pending` → `refunded`.

## Operator endpoints

All require `Authorization: Bearer $ADMIN_TOKEN` (disabled when unset).

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://moltworld.xyz/v1/ops/refunds?status=failed | jq
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://moltworld.xyz/v1/ops/refunds/<id>/retry
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://moltworld.xyz/v1/ops/payouts | jq
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://moltworld.xyz/v1/ops/listings?status=pending | jq
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"approved"}' https://moltworld.xyz/v1/ops/listings/<id>/review
```

Review listings for: the creator controls the URL, the API does what the description says, no
prohibited content, and a sensible price. Suspend (`"status":"suspended"`) to stop sales at once.

## Monitoring

`GET /health` returns 503 when the facilitator or ledger is unavailable, and reports
`catalog_sync.unverified` (models withheld because their upstream could not be verified),
`receipts.persistent_key`, `payouts_enabled` and configured providers. Alert on:

- `/health` not 200 for 2 minutes;
- any refund in `failed`, or refunds `pending` for more than 30 minutes;
- payout wallet USDC below a week of expected refunds;
- `catalog_sync.unverified` non-empty after a deploy (a provider renamed or retired a model);
- margin: `/v1/stats` net revenue vs. upstream bills, weekly.

## Pricing

Chat rates follow OpenRouter's live price list, refreshed hourly. fal.ai unit prices are
static defaults in `src/models/registry.ts` unless fal's pricing API is reachable with
`FAL_KEY`. Check them against your fal.ai invoices and override with `COST_<SLUG>` (for example
`COST_VEO_3_1_FAST=0.15` per second) without a deploy. Margin and floor: `PRICE_MARGIN`,
`PRICE_MIN_FLOOR`.

## Receipt key rotation

1. Note the current public key: `curl -s https://moltworld.xyz/.well-known/moltworld-receipts.json`.
2. Set a new `RECEIPT_SIGNING_KEY` (`openssl rand -base64 32`) and add the old public key to
   `RECEIPT_PREVIOUS_PUBLIC_KEYS` (comma-separated).
3. Restart. Old receipts stay verifiable; new ones carry the new `kid`.

Back the signing key up offline. Losing it without rotating makes past receipts unverifiable.

## Mandates

Mandate payments are identified by their LogicSig program. Payments from an unregistered or
revoked Moltworld mandate are refused. Owners revoke with a signed message
(`POST /v1/mandates/{id}/revoke`); revocation is final. On-chain limits (payee, per-call
maximum, expiry, zero fee) cannot be changed after signing; the daily cap and model allow-list
are set at registration.

## Stats integrity

`/v1/stats` excludes `AVM_ADDRESS`, `OPERATOR_WALLETS` and addresses in `.mainnet_fleet.json`.
Keep every wallet you control in one of those, so operator test traffic is never reported as
customer adoption.
