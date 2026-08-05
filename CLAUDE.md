# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## What this project is

A human-in-the-loop, AI-assisted stock trading platform. Read
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/ROADMAP.md`](docs/ROADMAP.md) before making non-trivial changes —
they are the source of truth for the design and the phase order this
project is built in.

## Non-negotiable rules for this codebase

These came directly from the project owner and apply to every phase, not
just the one currently being built:

1. **The AI never sizes a position, never enforces a risk limit, and never
   calls a broker.** Position size, stop-loss, and target come only from the
   deterministic Risk & Sizing Engine (`lib/risk/`). The AI rationale layer
   (`lib/ai/`) only explains a proposal that already exists; it has no
   import path into `lib/broker/` and no field in its output schema that
   could change `qty`, prices, or `status`.
2. **No AI-generated confidence/probability numbers.** Ever. Use the
   deterministic `signal_score`, qualifying factors, and historical
   backtest stats instead — see the `signals` and `backtests` tables.
3. **Paper trading is always the default.** Live trading is a separate,
   explicitly opted-into account mode (Phase 7). No code path may fall back
   from live to paper or paper to live automatically.
4. **Paper and live broker credentials/adapters are completely separate**
   (`ALPACA_PAPER_*` vs `ALPACA_LIVE_*` env vars, separate adapter classes).
   Never let a code path read both, and never share a base URL or key
   between them.
5. **Order submission must be idempotent** via `client_order_id`, and the
   approve→execute state transition must be a single atomic conditional
   update — the same proposal must never produce two orders.
5a. **Order placement is LOCAL SIMULATION ONLY as of the Phase 1 recovery
    pass.** `lib/broker/` is read-only (`ReadOnlyBrokerAdapter`/
    `ReadOnlyAlpacaClient` — no `submitOrder`, no write method of any kind,
    no `post`/`put`/`patch`/`delete` on the Alpaca client). All order
    placement lives in `lib/local-broker/` (`LocalOnlyOrderRecorder`),
    which has zero dependency on `lib/broker/` and makes no network call.
    `lib/order-executor/executeProposal`'s `recorder` parameter is typed as
    the concrete `LocalOnlyOrderRecorder` class specifically so nothing
    Alpaca-backed can be substituted — do not loosen that type to an
    interface, and do not add a `getLiveOrderAdapter`/real-execution code
    path without the project owner explicitly asking for it. Reconciliation
    (`lib/order-executor/local-reconcile.ts`) is local-database-only, never
    a broker call.
6. **Default risk per trade is 0.5% of account equity**
   (`risk_limits.risk_per_trade_pct`), configurable but never silently
   changed.
7. Universe is a fixed, configurable allow-list of 20–50 liquid US
   stocks/ETFs (`universe` table) — never scan "the whole market."
8. Every signal/proposal records which market-data source and feed
   produced it (`data_source`, `feed`, `quote_timestamp` columns).
9. News/sentiment analysis is explicitly deferred (Phase 8) until the
   deterministic strategy, backtesting, paper execution, and audit system
   are all working reliably. Don't add it earlier without the project
   owner asking for it.
10. Follow the phase order in `docs/ROADMAP.md`. Don't build a later
    phase's functionality (e.g. AI rationale generation, live trading)
    while an earlier phase is still in progress or unapproved.
11. **Critical audit events must fail closed.** Confirmation, execution
    start/success/rejection, duplicate-submission prevention, and any
    proposal/order state transition use `logCriticalEvent` (throws on
    failure — the caller must abort or escalate, never swallow). Purely
    informational events (account sync, calendar sync) use
    `logEventSafely`. See `lib/order-executor/README.md` for the full
    critical/best-effort event list and what "fail closed" means for each.

## Conventions

- Mirrors the sibling `Workout App` project's stack and patterns: Next.js
  App Router + TypeScript + Tailwind, Supabase (Postgres + RLS + Auth),
  Zod for all validation, one repository file per aggregate under
  `lib/repositories/`.
- Every table migration follows the pattern in
  `supabase/migrations/0001_init.sql`: `user_id` (or a join through
  `accounts.user_id` where the row is 1:1 with an account) checked by RLS,
  `updated_at` trigger via `public.set_updated_at()`, indexes on the
  columns actually queried.
- `audit_log` is append-only at the database level (no update/delete RLS
  policy) — don't add one without a very good reason and the project
  owner's explicit sign-off.
- Regenerate `types/database.ts` from the live Supabase schema once a
  project exists (`npx supabase gen types typescript --project-id <ref>`)
  rather than hand-editing it further.

## Current status

Phase 1 (Paper Trading & Market-Data Pipeline) in progress. Auth, broker
read-only adapter, market calendar, market-data, repositories, validator,
and a local-simulation-only order executor exist and are tested. No
dashboard/API routes yet, and no dependency on a real brokerage's order
API anywhere in the codebase — see the "Order placement" rule above.
No signal/trading logic (Phase 2+) or AI calls (Phase 5+) exist yet.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
