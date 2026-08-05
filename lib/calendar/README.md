# Market Calendar Service

**Status:** Phase 1 implemented.

`service.ts` exports the four deterministic functions (`isTradingDay`, `isMarketOpen`,
`getCurrentTradingSession`, `getNextMarketOpen`) as pure functions over an already-fetched
`CalendarDay[]` window plus an injectable "now" — no DB or broker access, so DST/holiday/weekend
behavior is unit-tested against fixed dates (see `service.test.ts`) without waiting for a real
holiday. `timezone.ts` converts exchange-local (`America/New_York`) wall-clock times to absolute
UTC instants via `date-fns-tz`, correct across DST transitions.

`sync.ts` calls `BrokerAdapter.getCalendar()` and upserts `market_calendar`, explicitly writing a
`'closed'` row for every date the broker's response omits (weekends, holidays) — so "not synced
yet" and "known closed" are never confused.

`supabase/functions/sync-market-calendar/` is the scheduled Edge Function that runs this in
production (self-contained Deno reimplementation of the same logic — see the comment at the top of
that file for why it isn't a shared import). Every order-submission code path re-checks
`isMarketOpen` immediately before calling the broker — never trusts a value computed earlier in the
request.
