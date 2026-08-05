# Order Executor

**Status:** Phase 1 implemented, local-simulation-only. No dependency on `lib/broker/` anywhere in
this directory — order placement happens entirely through `lib/local-broker/`
(`LocalOnlyOrderRecorder`), which makes no network call of any kind. See
`lib/order-executor/type-safety.test.ts` and `no-network.test.ts` for the enforcement proofs.

- `confirm.ts` — `confirmManualOrder()`: the human-approval moment for a manual order ticket.
  Duplicate-`client_order_id` detection, then inserts the `proposals` row (`status: 'approved'`).
- `executor.ts` — `executeProposal()`: re-validates fresh (`validateProposalBeforeExecution`),
  atomically transitions `approved → executing`, calls `LocalOnlyOrderRecorder`, records the
  `orders` row, and marks the proposal `executed`/`failed`. The `recorder` parameter is typed as
  the concrete `LocalOnlyOrderRecorder` class — nothing Alpaca-backed can be substituted, because
  nothing Alpaca-backed has a matching shape.
- `local-reconcile.ts` — `reconcileStuckProposal()`: resolves a proposal stuck in `'executing'`
  (e.g. a crash mid-operation) using **only** our own `orders` table (`client_order_id` lookup) —
  no network call. There is nothing "ambiguous" left to resolve against an external broker, since
  order placement never left this server to begin with.

## Critical vs. best-effort audit events

**Critical** (`logCriticalEvent` — throws on failure; the caller must abort or escalate, never
swallow):

| Event | When | On audit-write failure |
|---|---|---|
| `manual_order_confirmed` | Proposal row just inserted | Compensating delete of the just-inserted proposal; confirm fails |
| `duplicate_submission_blocked` | An existing proposal already matches this `client_order_id` (or a repeated `executeProposal` call finds the proposal already past `'approved'`) | Request refused either way — fail closed means refuse, not allow-through |
| `order_execution_started` | Immediately after `approved → executing`, before any fill is recorded | Proposal reverted to `'approved'` (safe — nothing filled yet); execution aborts |
| `order_execution_rejected` | Re-validation fails before execution, or the local recorder itself rejects (no usable reference price) | Proposal marked `'failed'` regardless; audit failure here still propagates as an error |
| `order_execution_succeeded` | After the local order is recorded and proposal marked `'executed'` | **Cannot** be cleanly rolled back — the local fill is real, committed local state. `executeProposal` returns `execution_recorded_but_audit_failed`, never a plain `"executed"` result, so no caller can treat this as clean |
| `local_state_reconciled` | `local-reconcile.ts` changes a stuck proposal's status | Same escalation reasoning as above — this is itself a state transition |

**Best-effort** (`logEventSafely` — swallows and logs to console): informational-only events with
no state-changing consequence, e.g. `local_order_recorded` after a successful execution. Quote
fetch/rejection has its own dedicated, always-throwing log (`market_data_snapshots` via
`lib/market-data/quotes.ts`) — unrelated to this module.

## Standing rule for future UI work

Any order-related UI must display a prominent **LOCAL SIMULATION** banner — this is not an Alpaca
paper order, and the UI must never imply otherwise. Not implemented yet (no dashboard exists), but
binding once one is built.
