# Architecture

## Core principle

**The AI explains, deterministic code decides.** The AI never sizes a
position, never enforces a risk limit, and never talks to a broker — every
number that matters is computed by plain, testable server code. The AI's
only job is to generate a rule-grounded, non-invented explanation of a trade
a deterministic engine already produced.

## Goals / non-goals

**Goals**
- AI proposes and explains; deterministic server code calculates size and enforces every risk rule.
- Paper trading is always the safe default; live trading is a separate, explicitly opted-into mode.
- Every proposal is traceable: what data it used, what rule fired, what happened to it, and why.
- Correctness-critical paths (sizing, risk limits, order submission) are unit-tested, not "trust the AI."

**Non-goals (v1)**
- No fully autonomous execution — human approval is mandatory for every trade.
- No options/futures/crypto/margin — long-only equities/ETFs from a small, fixed universe (20–50 symbols).
- No news/sentiment analysis until the deterministic strategy, backtesting, paper execution, and audit system are all working reliably.
- Not a registered-advisor product — clear "not financial advice" disclaimers throughout (see [DISCLAIMER.md](DISCLAIMER.md)).

## Diagram

```mermaid
flowchart TB
    subgraph Data["Data Layer"]
      MD[Alpaca Market Data\n(fixed universe, 20-50 symbols)]
      CAL[Market Calendar Service\n(holidays, early closes, hours)]
    end

    subgraph Deterministic["Deterministic Core (no AI)"]
      SIGNAL[Signal Engine\nrule-based technical signal score\n+ qualifying factors]
      SIZER[Risk & Position-Sizing Engine\n% risk per trade, hard limits]
      VALID[Proposal Validator\nexpiry, stale quote, price tolerance,\nduplicate/idempotency checks]
      EXEC[Order Executor\nONLY component allowed to call a broker\natomic state transition, client_order_id]
    end

    subgraph AI["AI Layer (explanation only)"]
      RATIONALE[Claude — structured output, strict schema\nrationale + risk notes only\nNO sizing, NO confidence %, NO broker access]
    end

    subgraph App["Web App (Next.js)"]
      INBOX[Proposal Inbox UI]
      PORTFOLIO[Portfolio & Performance UI]
      CONFIG[Universe / Risk / Strategy Config UI]
    end

    subgraph Store["Supabase (Postgres + Auth + RLS)"]
      DB[(proposals, orders, positions,\naudit_log, risk_limits,\nuniverse, backtests)]
    end

    subgraph Exec["Broker Layer — strictly separated"]
      PAPER_ADAPTER[Paper Broker Adapter\nseparate creds/env/endpoint]
      LIVE_ADAPTER[Live Broker Adapter\nseparate creds/env/endpoint\nopt-in only, no auto-fallback]
    end

    subgraph Sched["Scheduling"]
      EDGE[Supabase Scheduled Edge Functions\ngated by Market Calendar]
    end

    EDGE --> MD
    CAL --> EDGE
    MD --> SIGNAL
    SIGNAL --> SIZER
    SIZER -->|deterministic proposal:\nqty, stop, target, signal score| DB
    DB --> RATIONALE
    RATIONALE -->|explanation text + risk notes\nwritten back onto the same row| DB
    DB --> INBOX
    INBOX -- approve/edit/reject --> VALID
    VALID -->|passes all checks| EXEC
    EXEC --> PAPER_ADAPTER
    EXEC -.opt-in later, never automatic.-> LIVE_ADAPTER
    PAPER_ADAPTER --> DB
    LIVE_ADAPTER --> DB
    DB --> PORTFOLIO
    CONFIG --> DB
```

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Frontend/Backend | Next.js (App Router) + TypeScript + Tailwind | Consistent, one deploy target |
| DB / Auth | Supabase (Postgres + RLS + Auth) | Repository pattern, migrations, RLS-per-user |
| Validation | Zod, strict schemas for every DB write and every AI response | AI responses are untrusted input, validated the same as user input |
| Market data + paper/live broker | Alpaca (Markets Data + Trading API) | One provider for data, paper, and live trading — but **fully separate adapter instances per mode** |
| Scheduling | Supabase scheduled Edge Functions | Co-located with the DB; avoids relying on frequent external cron ticks |
| Market calendar | Alpaca `/v2/calendar`, cached locally | Gates every scheduled run and every order submission |
| AI reasoning | Claude, Anthropic structured outputs / strict JSON schema | Schema excludes any numeric confidence/probability field |
| Secrets (broker API keys) | Supabase Vault / server-only env vars, namespaced per mode (`ALPACA_PAPER_*` vs `ALPACA_LIVE_*`) | Prevents any code path from mixing credentials between modes |
| Testing | Vitest, unit tests on all deterministic logic | Risk sizing, stale quotes, duplicate orders, kill switch, paper/live separation |

## Deterministic vs. AI responsibility

| Responsibility | Owner | Notes |
|---|---|---|
| Signal score (technical rules: MA crossovers, RSI, volume, etc.) | **Signal Engine** (deterministic) | Pure functions, unit-testable, no AI involved |
| Qualifying factors (why the signal fired) | **Signal Engine** (deterministic) | e.g. "price > 50MA", "RSI < 30" — plain facts, not AI-generated |
| Historical setup performance | **Backtest Engine** (deterministic, precomputed) | Looked up, not invented |
| Position size, stop-loss, target | **Risk & Sizing Engine** (deterministic) | Account equity × configurable risk-per-trade (default 0.5%), clipped by hard risk limits |
| Human-readable rationale + risk narrative | **Claude** (structured output) | Explains the *existing* deterministic signal/factors/history; cannot alter score, size, or limits |
| Expiry / stale-quote / price-tolerance / duplicate checks | **Proposal Validator** (deterministic) | Runs right before execution, independent of both the Signal Engine and the AI |
| Order submission | **Order Executor** (deterministic, only broker-facing component) | Idempotent via `client_order_id`; atomic approve→submit transition |

## Data model

See [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) for the authoritative
schema. Core tables: `accounts`, `universe`, `risk_limits`, `market_calendar`, `signals`,
`backtests`, `proposals`, `orders`, `positions`, `audit_log`.

## Guardrails

- Paper is always the default; switching an account to live requires a separate, explicit
  reconfirmation flow — **no code path automatically falls back from live to paper or vice versa.**
- Position size and every risk limit are computed and enforced by the deterministic Sizing Engine
  before a proposal is ever written to the DB — the AI's explanation is attached afterward and
  cannot change these numbers.
- The Proposal Validator re-checks, at approval time: proposal not expired, quote not stale, current
  price not moved beyond a configurable tolerance, and no duplicate/`client_order_id` collision.
- Approve → execute is a single atomic DB transition, so concurrent or repeated approval clicks
  cannot execute the same proposal twice.
- The AI has no broker tool access at all — only the Order Executor talks to a broker adapter, and
  only after validation passes.
- Kill switch halts both the scheduled scanner and order submission immediately.
- Full append-only audit log for every automated and human action (enforced at the DB level — see
  the RLS policies in the migration, which grant no update/delete on `audit_log`).

See [ROADMAP.md](ROADMAP.md) for the phased build order this architecture is delivered in.
