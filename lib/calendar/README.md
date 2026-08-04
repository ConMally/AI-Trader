# Market Calendar Service

**Status:** not implemented (Phase 1)

Wraps Alpaca's `/v2/calendar` endpoint, caching trading days/hours/early-closes
into the `market_calendar` table. Answers "is the market open right now" for:

- the Supabase scheduled Edge Function that gates when the scanner runs
- the Proposal Validator, which must not accept a submission outside market
  hours (or must route it as a queued/next-session order, per the eventual
  design)

Every scheduled run and every order submission checks this service first.
See `docs/ARCHITECTURE.md` for how this fits into the pipeline.
