# Roadmap

Each phase is built and approved before the next one starts. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the design each phase implements.

## Phase 0 — Foundations ✅ (this commit)

Project scaffold, folder structure, README, `.env.example`, Supabase client
wiring, initial DB schema/migration, `CLAUDE.md`, initial documentation. No
broker connection, no trading/signal logic.

## Phase 1 — Paper account + data pipeline (no signals, no AI)

Initialize the Alpaca paper account with a $1,000 simulated balance
(already the schema default — see `handle_new_user()` in the migration).
Wire up market data for the fixed universe. Build the Market Calendar
service and the deterministic Order Executor against the paper adapter
only, with `client_order_id` idempotency. Validate a manual round-trip
order (place → fill → position update) before anything is built on top.

## Phase 2 — Deterministic Signal Engine + Risk/Sizing Engine

Rule-based technical signal scoring + qualifying factors (pure, unit-tested
functions). Risk & Position-Sizing Engine computes qty/stop/target from
account equity and the configurable risk-per-trade (0.5% default), clipped
by `risk_limits`. Still no AI, no live proposals yet.

## Phase 3 — Basic backtesting (before any AI-generated proposal)

Run the Phase 2 Signal Engine against historical data for the fixed
universe; store per-setup performance stats in `backtests`. Validates the
deterministic strategy is sane before it's ever shown to the user, and gives
the AI layer real historical stats to reference later instead of inventing
them.

## Phase 4 — Proposal pipeline + human approval workflow (deterministic only)

Signals → Sizing Engine → `proposals` (pending). Proposal Inbox UI.
Proposal Validator enforces expiry/staleness/price-tolerance/duplicate
checks at approval time. Order Executor submits idempotently to the paper
broker with an atomic approve→execute transition. First fully closed loop —
no AI rationale yet, so correctness is verified independent of the AI.

## Phase 5 — AI rationale layer

Claude, structured output with a strict schema (no confidence/probability
field), takes the deterministic signal score + qualifying factors +
historical setup stats and produces a plain-English rationale and risk
notes, attached to the existing proposal row. No broker tool access.

## Phase 6 — Guardrail hardening + automated test suite

Kill switch, daily loss caps, alerting, audit log UI, and the explicit test
suite: risk sizing, stale-quote rejection, duplicate/idempotent order
submission, kill-switch behavior, paper/live separation.

## Phase 7 — Live trading path (opt-in)

Separate live broker adapter and credential namespace, small initial
capital limits, extra confirmation step for the first N live trades, no
automatic fallback either direction.

## Phase 8 — Stretch

News/sentiment analysis (only once everything above is reliable), push
notifications, multi-strategy support, expanded asset classes, tax-lot
reporting.
