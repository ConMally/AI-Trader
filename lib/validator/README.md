# Proposal Validator

**Status:** not implemented (Phase 4)

Runs immediately before a proposal is allowed to move from `approved` to
`executing`/`executed`. Independent of both the Signal Engine and the AI
rationale layer — this is the last deterministic gate before the Order
Executor is ever invoked. Rejects a proposal if:

- it has passed its `expires_at`
- the quote it was priced against is now stale (older than
  `risk_limits.quote_staleness_seconds`)
- the current price has moved beyond `risk_limits.max_price_slippage_pct`
  from the proposal's reference price
- it would be a duplicate submission (same `client_order_id` already used,
  or the proposal is not actually in `approved` status — the approve to
  executing transition itself must be a single atomic conditional update so
  two concurrent approval clicks can't both pass this check)
