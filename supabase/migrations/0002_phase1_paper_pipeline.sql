-- Phase 1: paper account sync history, market-data snapshots, and the
-- proposals changes needed to let a manual order ticket use the same
-- human-approval-gate tables Phase 0 built for AI-generated proposals.
-- 0001_init.sql is not modified — additive only. See docs/ARCHITECTURE.md
-- and docs/ROADMAP.md Phase 1 for the design this implements.

-- ---------------------------------------------------------------------------
-- proposals — a manual order ticket creates a row here too (source =
-- 'manual'), reusing the exact same approval-gate/executor path Phase 2+
-- will use for AI-generated proposals (source = 'ai'). Manual orders have
-- no natural stop/target, so stop_price/risk_amount become nullable — but
-- only for manual rows; the CHECK below still requires both on any
-- deterministically-sized (AI) proposal.
-- ---------------------------------------------------------------------------

alter table public.proposals
  add column source text not null default 'manual' check (source in ('manual', 'ai'));

-- Neither 0001_init.sql nor the rest of this file previously recorded
-- whether a proposal is a market or limit order — without it, the Order
-- Executor has no way to know whether entry_price should actually be sent
-- to the broker as a limit price, or is just an informational estimate for
-- a market order. Defaults to 'market' since that's the more common case;
-- every insert should still set this explicitly.
alter table public.proposals
  add column order_type text not null default 'market' check (order_type in ('market', 'limit'));

alter table public.proposals
  alter column stop_price drop not null,
  alter column risk_amount drop not null;

alter table public.proposals
  add constraint proposals_ai_requires_risk_fields
  check (source = 'manual' or (stop_price is not null and risk_amount is not null));

-- ---------------------------------------------------------------------------
-- orders — Phase 1 order placement is entirely local simulation (see
-- lib/local-broker/), never a real brokerage transmission. is_simulated
-- defaults true because, until Phase 7 (live trading) exists, every order
-- this app can ever create IS a simulation — Phase 7 is what would
-- introduce a code path that sets this false. simulation_metadata records
-- exactly how the fill was simulated (fill model, reference quote used,
-- slippage applied, engine version) so nothing downstream has to infer it
-- from broker_order_id's "local-" prefix alone.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column is_simulated boolean not null default true,
  add column simulation_metadata jsonb;

-- ---------------------------------------------------------------------------
-- broker_account_snapshots — history of Alpaca's own reported equity/cash/
-- buying_power/status, kept entirely separate from accounts.starting_balance
-- (the $1,000 experiment allocation, set in 0001). The app must never
-- assume Alpaca's paper balance equals the experiment allocation — this
-- table is the only source of truth for broker-reported numbers, and the
-- UI/repositories must read both and label them distinctly.
-- ---------------------------------------------------------------------------

create table public.broker_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  broker_account_id text not null,
  equity numeric(14, 2) not null,
  cash numeric(14, 2) not null,
  buying_power numeric(14, 2) not null,
  status text not null,
  synced_at timestamptz not null default now(),
  raw jsonb not null default '{}'
);

create index broker_account_snapshots_account_synced_idx
  on public.broker_account_snapshots (account_id, synced_at desc);

alter table public.broker_account_snapshots enable row level security;

create policy "broker_account_snapshots_select_own" on public.broker_account_snapshots
  for select using (auth.uid() = user_id);
create policy "broker_account_snapshots_insert_own" on public.broker_account_snapshots
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );
-- No update/delete policy — immutable snapshots, same append-only reasoning
-- as audit_log in 0001.

-- ---------------------------------------------------------------------------
-- market_data_snapshots — every quote retrieval attempt, logged with
-- provider/feed/source timestamp/retrieval timestamp and its validation
-- outcome, so a rejected quote (stale/crossed/future-dated/malformed) has a
-- durable, traceable record of why it was rejected — not just a thrown
-- error that vanishes.
-- ---------------------------------------------------------------------------

create table public.market_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol text not null,
  provider text not null,
  feed text not null,
  bid_price numeric(14, 4),
  ask_price numeric(14, 4),
  last_price numeric(14, 4),
  source_timestamp timestamptz not null,
  retrieved_at timestamptz not null default now(),
  validation_status text not null
    check (validation_status in ('ok', 'stale', 'future_dated', 'crossed', 'malformed', 'missing')),
  validation_notes text,
  raw jsonb not null default '{}'
);

create index market_data_snapshots_account_symbol_idx
  on public.market_data_snapshots (account_id, symbol, retrieved_at desc);

alter table public.market_data_snapshots enable row level security;

create policy "market_data_snapshots_select_own" on public.market_data_snapshots
  for select using (auth.uid() = user_id);
create policy "market_data_snapshots_insert_own" on public.market_data_snapshots
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  );
-- No update/delete — immutable snapshots.
