# Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`
   and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from **Project Settings → API**.
3. Run **both** migrations against your project, **in order**:
   `supabase/migrations/0001_init.sql` then
   `supabase/migrations/0002_phase1_paper_pipeline.sql`. Either:
   - paste each file's contents into the SQL Editor in the Supabase
     dashboard, in order, or
   - install the [Supabase CLI](https://supabase.com/docs/guides/cli), run
     `supabase link --project-ref <ref>`, then `supabase db push` (it
     applies every migration under `supabase/migrations/` in filename
     order automatically).
4. For anything server-only that needs to bypass Row Level Security
   (scheduled Edge Functions, admin scripts), also set
   `SUPABASE_SERVICE_ROLE_KEY` from the same **Project Settings → API**
   page. Never expose this value to the client and never prefix it with
   `NEXT_PUBLIC_` — `lib/supabase/service-role.ts` is the only place this
   codebase reads it, and it's `server-only`-guarded (a build fails if any
   Client Component ever imports it).
5. **Authentication**: in the dashboard, go to **Authentication → Providers**
   and confirm the **Email** provider is enabled (it is by default on a new
   project). Under **Authentication → URL Configuration**, set the **Site
   URL** to your local dev origin (e.g. `http://localhost:3000`) for now —
   `app/login/` and `app/signup/` use plain email/password
   (`supabase.auth.signInWithPassword` / `signUp`), no OAuth provider setup
   needed.
6. **Scheduled calendar sync** (optional until Phase 1's dashboard needs
   fresh calendar data continuously): deploy the Edge Function and give it
   its own secrets — Edge Function secrets are a **separate store** from
   `.env.local`, set via the CLI, not the dashboard's project settings:
   ```bash
   supabase functions deploy sync-market-calendar
   supabase secrets set \
     ALPACA_PAPER_API_KEY_ID=... \
     ALPACA_PAPER_API_SECRET_KEY=... \
     SUPABASE_URL=https://<ref>.supabase.co \
     SUPABASE_SERVICE_ROLE_KEY=...
   ```
   Then schedule it to run daily via the dashboard's Edge Function schedule
   UI, or a `pg_cron` job calling `net.http_post` against the function's
   URL. Until this is deployed, `lib/calendar/sync.ts` can be run manually
   (e.g. from a one-off script) using the same `ALPACA_PAPER_*` values
   already in `.env.local`.
7. **Never commit a real credential.** `.gitignore` already excludes every
   `.env*` file except the checked-in `.env.example` template — verify with
   `git check-ignore -v .env.local` if unsure.

## What's in the schema

`profiles`, `accounts`, `universe`, `risk_limits`, `market_calendar`,
`signals`, `backtests`, `proposals`, `orders`, `positions`,
`broker_account_snapshots`, `market_data_snapshots`, `audit_log` — see
[ARCHITECTURE.md](ARCHITECTURE.md) for what each is for. Every table is
Row-Level-Security protected per-user; a new signup automatically gets a
`profiles` row, a `paper` `accounts` row with a $1,000 simulated starting
balance, and a `risk_limits` row defaulting to 0.5% risk per trade, via the
`handle_new_user()` trigger.

`orders.is_simulated` is `true` for every row this app can currently create —
order placement is local-simulation-only (see `lib/local-broker/README.md`
and `lib/order-executor/README.md`); nothing is ever transmitted to Alpaca.
Alpaca's own paper-account order history is read live for display
(`ReadOnlyBrokerAdapter.getRecentOrders()`) and is never written into this
table.
