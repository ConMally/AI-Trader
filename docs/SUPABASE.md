# Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from **Project Settings → API**.
3. Run the migration in `supabase/migrations/0001_init.sql` against your
   project, either by:
   - pasting its contents into the SQL Editor in the Supabase dashboard, or
   - installing the [Supabase CLI](https://supabase.com/docs/guides/cli) and
     running `supabase link --project-ref <ref>` then `supabase db push`.
4. For anything server-only that needs to bypass Row Level Security
   (starting Phase 1 — scheduled Edge Functions, admin scripts), also set
   `SUPABASE_SERVICE_ROLE_KEY` from the same **Project Settings → API**
   page. Never expose this value to the client and never prefix it with
   `NEXT_PUBLIC_`.

## What's in the schema (Phase 0)

`profiles`, `accounts`, `universe`, `risk_limits`, `market_calendar`,
`signals`, `backtests`, `proposals`, `orders`, `positions`, `audit_log` — see
[ARCHITECTURE.md](ARCHITECTURE.md) for what each is for. Every table is
Row-Level-Security protected per-user; a new signup automatically gets a
`profiles` row, a `paper` `accounts` row with a $1,000 simulated starting
balance, and a `risk_limits` row defaulting to 0.5% risk per trade, via the
`handle_new_user()` trigger.

Nothing in the app calls Supabase yet beyond the inert client helpers in
`lib/supabase/` — there's no login page or protected route in Phase 0. That
starts in Phase 1.
