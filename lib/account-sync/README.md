# Account Sync

**Status:** Phase 1 implemented. Read-only — calls only `ReadOnlyBrokerAdapter` methods
(`getAccount`, `getPositions`, `getRecentOrders`); never submits, cancels, replaces, or reconciles
an Alpaca order (those methods don't exist on the adapter at all).

- `syncAccountSnapshot` — persists a `broker_account_snapshots` row.
- `syncPositions` — upserts the `positions` table from Alpaca's reported positions, zeroing out any
  symbol the broker no longer reports (never deleted, so the fact a symbol was once held survives).
- `getRecentBrokerOrders` — a live pass-through to `getRecentOrders()`, **never persisted**.
  `orders.proposal_id` is `NOT NULL` (every persisted order traces to a proposal — 0001_init.sql),
  and an order placed directly on Alpaca's own dashboard has no proposal; rather than loosen that
  constraint, Alpaca's own order history is simply re-fetched live on every request.
- `syncAccount` — orchestrates the first two for the account-snapshot/positions API routes.

Broker equity/cash/buying power (`broker_account_snapshots`) is a completely separate concept from
the $1,000 experiment allocation (`accounts.starting_balance`) and the locally-computed simulated
portfolio (`lib/local-broker/local-portfolio.ts`) — never conflate the three when displaying them.

Sync success/failure is logged via `logEventSafely` (informational/best-effort — a sync failure
doesn't touch any order or proposal state, so it doesn't need the fail-closed treatment order
lifecycle events get).

Uses the session-scoped Supabase client, not the service-role client — this is the signed-in user's
own data, and ordinary RLS applies.
