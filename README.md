# AI-Trader

A human-in-the-loop, AI-assisted stock trading platform. The AI analyzes
data and proposes trades with a clear explanation; **deterministic server
code calculates position size and enforces every risk limit** — the AI
never sizes a trade, never bypasses a risk rule, and never talks to a
broker directly. Every trade requires explicit human approval. Paper
trading (simulated money, real market data) is always the default; live
brokerage execution is a separate, later, explicitly opted-into mode.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased build plan. This repo is
currently at **Phase 0 — Foundations**: scaffold and schema only, no broker
connection and no trading logic yet.

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth +
Row Level Security), Zod validation, Alpaca (paper/live trading + market
data, Phase 1+), Claude via the Anthropic API (AI rationale layer, Phase
5+).

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in the Supabase variables in `.env.local` — see
[`docs/SUPABASE.md`](docs/SUPABASE.md) for project setup and how to run the
migration in `supabase/migrations/`. Every other variable in `.env.example`
belongs to a later phase; leave those blank for now.

```bash
npm run dev
```

## Project structure

```
app/                 Next.js App Router pages
lib/supabase/         Supabase client/server helpers (Phase 0)
lib/repositories/      Typed data-access layer (Phase 1+)
lib/calendar/          Market Calendar service (Phase 1)
lib/broker/            Broker adapters — paper/live, strictly separated (Phase 1 / 7)
lib/signal-engine/      Deterministic technical signal scoring (Phase 2)
lib/risk/               Deterministic position sizing + risk limits (Phase 2)
lib/validator/          Proposal Validator — expiry/stale-quote/duplicate checks (Phase 4)
lib/ai/                 AI rationale layer — explanation only, no sizing, no broker access (Phase 5)
supabase/migrations/    Database schema
types/database.ts       Hand-written Supabase types (Phase 0), regenerate once a project exists
docs/                   Architecture, roadmap, Supabase setup, disclaimer
```

Each `lib/*` directory not yet built has a `README.md` describing its
purpose and which roadmap phase implements it.

## Guardrails (summary)

- Human approval is mandatory for every trade, in every mode.
- Position sizing and risk limits are deterministic and enforced server-side
  — never delegated to the AI's judgement.
- Paper and live broker credentials/adapters are completely separate, with
  no automatic fallback between them.
- Every signal, proposal, and order transition is recorded in an
  append-only audit log.

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Disclaimer

Not financial advice, not a registered investment advisor. See
[`docs/DISCLAIMER.md`](docs/DISCLAIMER.md).
