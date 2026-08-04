-- AI-Trader — initial schema
--
-- Phase 0 only: this creates the tables the rest of the roadmap will read
-- and write, plus the guardrails that must exist at the data layer itself
-- (not just in application code) — the human-approval gate, the paper/live
-- separation, and the append-only audit trail. Nothing in the app calls any
-- of this yet; no broker connection, no signal generation, no AI calls
-- exist in this phase. See docs/ARCHITECTURE.md for the full design and
-- docs/SUPABASE.md for how to run this migration.
--
-- Run once against a fresh Supabase project: paste into the SQL Editor in
-- the dashboard, or `supabase db push` (see docs/SUPABASE.md for both).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at helper — attached as a BEFORE UPDATE trigger to every table
-- below that has an updated_at column.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, id IS the auth.users id.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts — one row per (user, mode). Deliberately holds no broker
-- credentials: those live only in namespaced server env vars
-- (ALPACA_PAPER_* / ALPACA_LIVE_*, see .env.example), never in the
-- database, so there is no shared code path or shared row that could ever
-- mix paper and live secrets. `mode` never changes in place — moving to
-- live means creating a new 'live' row via an explicit opt-in flow
-- (Phase 7), not flipping this column.
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('paper', 'live')),
  broker text not null default 'alpaca',
  starting_balance numeric(14, 2) not null check (starting_balance > 0),
  kill_switch_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mode)
);

create index accounts_user_id_idx on public.accounts (user_id);

create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- universe — the explicit, configurable allow-list of symbols the scanner
-- may ever look at (20-50 liquid US stocks/ETFs, not "the market"). The
-- 20-50 count is enforced by the application layer at write time, not by a
-- DB constraint, since Postgres CHECK constraints can't cheaply reference
-- an aggregate across sibling rows.
-- ---------------------------------------------------------------------------

create table public.universe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null check (symbol = upper(symbol)),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create index universe_user_id_idx on public.universe (user_id);

-- ---------------------------------------------------------------------------
-- risk_limits — one row per account. risk_per_trade_pct is the single
-- configurable dial the deterministic Sizing Engine (Phase 2) reads to turn
-- account equity into a position size; every other column is a hard ceiling
-- the Sizing Engine and Proposal Validator (Phase 4) both enforce
-- regardless of what any signal or AI rationale says.
-- ---------------------------------------------------------------------------

create table public.risk_limits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts (id) on delete cascade,
  risk_per_trade_pct numeric(6, 4) not null default 0.0050 check (risk_per_trade_pct > 0 and risk_per_trade_pct <= 0.05),
  max_position_pct numeric(6, 4) not null default 0.2000 check (max_position_pct > 0 and max_position_pct <= 1),
  max_daily_loss_pct numeric(6, 4) not null default 0.0300 check (max_daily_loss_pct > 0 and max_daily_loss_pct <= 1),
  max_concurrent_positions integer not null default 5 check (max_concurrent_positions > 0),
  max_price_slippage_pct numeric(6, 4) not null default 0.0050 check (max_price_slippage_pct > 0),
  quote_staleness_seconds integer not null default 60 check (quote_staleness_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_risk_limits_updated_at
  before update on public.risk_limits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- market_calendar — cached trading days/hours from Alpaca's calendar
-- endpoint (Phase 1). Global reference data, not per-user; every user reads
-- the same rows. Populated by a service-role job, never by client code —
-- see the RLS policy below (select-only for authenticated users).
-- ---------------------------------------------------------------------------

create table public.market_calendar (
  date date primary key,
  session_type text not null check (session_type in ('regular', 'early_close', 'closed')),
  market_open timestamptz,
  market_close timestamptz,
  synced_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- signals — output of the deterministic Signal Engine (Phase 2). Records
-- exactly which data source/feed and which quote produced the score, so
-- every downstream proposal is traceable back to the data it was computed
-- from (requirement: record market-data source/feed for every signal).
-- ---------------------------------------------------------------------------

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol text not null,
  signal_score numeric(6, 3) not null,
  qualifying_factors jsonb not null default '[]',
  data_source text not null,
  feed text not null,
  quote_price numeric(14, 4) not null,
  quote_timestamp timestamptz not null,
  computed_at timestamptz not null default now()
);

create index signals_account_id_idx on public.signals (account_id);
create index signals_user_id_idx on public.signals (user_id);
create index signals_symbol_computed_at_idx on public.signals (symbol, computed_at desc);

-- ---------------------------------------------------------------------------
-- backtests — stored runs of the Signal Engine against historical data
-- (Phase 3), computed before any AI-generated proposal exists. `proposals`
-- references this for "historical setup performance" instead of an AI
-- inventing a number.
-- ---------------------------------------------------------------------------

create table public.backtests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol text not null,
  strategy_version text not null,
  setup_description text not null,
  sample_size integer not null check (sample_size >= 0),
  win_rate numeric(6, 4) check (win_rate is null or (win_rate >= 0 and win_rate <= 1)),
  avg_return_pct numeric(8, 4),
  stats jsonb not null default '{}',
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index backtests_account_id_idx on public.backtests (account_id);
create index backtests_symbol_idx on public.backtests (symbol, strategy_version);

-- ---------------------------------------------------------------------------
-- proposals — the human-approval gate itself. A proposal is inert until a
-- user action flips `status` to 'approved'; only 'approved' rows are ever
-- picked up for order submission (Phase 4), and the approve -> execute
-- transition is a single atomic conditional update guarded by `status` so
-- the same proposal can never be executed twice (Phase 4/6). qty/stop/
-- target come from the deterministic Sizing Engine; rationale/risk_notes
-- are attached afterward by the AI layer (Phase 5) and cannot change them.
-- `client_order_id` gives idempotent submission (Phase 4) independent of
-- this status machine.
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  signal_id uuid references public.signals (id) on delete set null,
  symbol text not null,
  direction text not null check (direction in ('buy', 'sell')),
  qty numeric(14, 4) not null check (qty > 0),
  entry_price numeric(14, 4) not null check (entry_price > 0),
  stop_price numeric(14, 4) not null check (stop_price > 0),
  target_price numeric(14, 4) check (target_price is null or target_price > 0),
  risk_amount numeric(14, 2) not null check (risk_amount >= 0),
  rationale text,
  risk_notes jsonb not null default '[]',
  ai_model text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'executing', 'executed', 'failed')),
  client_order_id text not null unique,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposals_account_id_status_idx on public.proposals (account_id, status);
create index proposals_user_id_idx on public.proposals (user_id);

create trigger set_proposals_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders — one-to-one with proposals (enforced by the unique constraint on
-- proposal_id), so a proposal can never produce two orders even under
-- concurrent execution attempts. Only the deterministic Order Executor
-- writes here; the AI never has broker access.
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  proposal_id uuid not null unique references public.proposals (id) on delete cascade,
  broker_order_id text,
  client_order_id text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'partially_filled', 'filled', 'canceled', 'rejected')),
  filled_qty numeric(14, 4) not null default 0 check (filled_qty >= 0),
  filled_avg_price numeric(14, 4),
  submitted_at timestamptz not null default now(),
  filled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_account_id_idx on public.orders (account_id);
create index orders_user_id_idx on public.orders (user_id);

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- positions — current holdings, reconciled against the broker. One row per
-- (account, symbol).
-- ---------------------------------------------------------------------------

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol text not null,
  qty numeric(14, 4) not null,
  avg_entry_price numeric(14, 4) not null check (avg_entry_price >= 0),
  market_value numeric(14, 2),
  unrealized_pl numeric(14, 2),
  updated_at timestamptz not null default now(),
  unique (account_id, symbol)
);

create index positions_account_id_idx on public.positions (account_id);
create index positions_user_id_idx on public.positions (user_id);

create trigger set_positions_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log — append-only. Every signal computed, every AI rationale
-- generated, every human decision, every order state transition. Nothing
-- ever updates or deletes a row here (no updated_at, no update trigger).
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_account_id_created_at_idx on public.audit_log (account_id, created_at desc);
create index audit_log_user_id_created_at_idx on public.audit_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — every user-owned table checks auth.uid() against a
-- user_id column already present on that same row, no joins through parent
-- tables, and WITH CHECK means a client can never insert/update a row
-- claiming a different owner. audit_log additionally has no update/delete
-- policy at all (append-only, enforced at the DB level, not just by
-- application code choosing not to call update/delete). market_calendar is
-- shared reference data: authenticated users can read it, but only the
-- service role (which bypasses RLS) can write it.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.universe enable row level security;
alter table public.risk_limits enable row level security;
alter table public.market_calendar enable row level security;
alter table public.signals enable row level security;
alter table public.backtests enable row level security;
alter table public.proposals enable row level security;
alter table public.orders enable row level security;
alter table public.positions enable row level security;
alter table public.audit_log enable row level security;

-- profiles (owner column is `id`, not `user_id`)
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

-- risk_limits (owner is via accounts.user_id — the only table here without
-- its own user_id column, since it's strictly 1:1 with an account)
create policy "risk_limits_select_own" on public.risk_limits for select
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));
create policy "risk_limits_insert_own" on public.risk_limits for insert
  with check (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));
create policy "risk_limits_update_own" on public.risk_limits for update
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));
create policy "risk_limits_delete_own" on public.risk_limits for delete
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()));

-- market_calendar — shared, read-only from the client; no insert/update/
-- delete policy at all, so only the service role (which bypasses RLS) can
-- write it.
create policy "market_calendar_select_authenticated" on public.market_calendar
  for select using (auth.role() = 'authenticated');

-- audit_log — insert and select only, no update/delete policy at all, so
-- append-only is enforced by Postgres itself, not just by which endpoints
-- the app happens to expose. account_id is nullable, but when present it
-- must belong to the same user — same cross-ownership reasoning as the
-- account_id-bearing tables below.
create policy "audit_log_select_own" on public.audit_log for select using (auth.uid() = user_id);
create policy "audit_log_insert_own" on public.audit_log for insert with check (
  auth.uid() = user_id
  and (
    account_id is null
    or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
  )
);

-- accounts / universe follow the identical `user_id` pattern — no
-- account_id column to cross-check on these two.
do $$
declare
  target text;
  owned_tables text[] := array[
    'accounts',
    'universe'
  ];
begin
  foreach target in array owned_tables loop
    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (auth.uid() = user_id);',
      target
    );
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (auth.uid() = user_id);',
      target
    );
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      target
    );
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (auth.uid() = user_id);',
      target
    );
  end loop;
end $$;

-- signals / backtests / proposals / orders / positions all carry BOTH
-- user_id and account_id. Checking user_id alone would let a user insert a
-- row that names their own user_id but someone else's account_id — cross-
-- linking data into an account they don't own. INSERT/UPDATE therefore
-- also require account_id to resolve to an accounts row owned by the same
-- auth.uid(). SELECT/DELETE stay user_id-only: by the time a row exists,
-- its own INSERT already proved account ownership, so a plain user_id
-- check is sufficient and cheaper for reads.
do $$
declare
  target text;
  account_scoped_tables text[] := array[
    'signals',
    'backtests',
    'proposals',
    'orders',
    'positions'
  ];
begin
  foreach target in array account_scoped_tables loop
    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (auth.uid() = user_id);',
      target
    );
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (
         auth.uid() = user_id
         and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
       );',
      target
    );
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update
         using (auth.uid() = user_id)
         with check (
           auth.uid() = user_id
           and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
         );',
      target
    );
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (auth.uid() = user_id);',
      target
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New-user bootstrap — creates a profile and a default PAPER account
-- (starting_balance $1,000, per the platform's requirement to always
-- initialize paper trading with a realistic simulated balance) plus its
-- risk_limits row (risk_per_trade_pct defaults to 0.5%) the moment someone
-- signs up via Supabase Auth. No live account is ever created here — that
-- only happens through the explicit Phase 7 opt-in flow.
--
-- Written to be safely re-runnable: this is a security definer trigger on
-- auth.users, so any error inside it fails the signup itself. Every insert
-- below is ON CONFLICT DO NOTHING and falls back to looking up the
-- already-existing row, so re-invoking this (a retried signup webhook, a
-- manual backfill, etc.) can never fail on a duplicate-key error partway
-- through and leave a user with a profile but no account, or an account
-- but no risk_limits.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_account_id uuid;
begin
  insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;

  insert into public.accounts (user_id, mode, starting_balance)
    values (new.id, 'paper', 1000.00)
    on conflict (user_id, mode) do nothing
    returning id into new_account_id;

  if new_account_id is null then
    select id into new_account_id
      from public.accounts
      where user_id = new.id and mode = 'paper';
  end if;

  insert into public.risk_limits (account_id) values (new_account_id)
    on conflict (account_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
