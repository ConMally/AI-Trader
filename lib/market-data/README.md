# Market Data

**Status:** Phase 1 implemented. No indicators or signals here — that's `lib/signal-engine/`
(Phase 2), which this module does not import and is not imported by.

- `default-universe.ts` / `universe.ts` — the configurable 20-symbol allow-list a new account is
  seeded with (`ensureDefaultUniverse`, idempotent), and `assertSymbolInUniverse`, which every
  quote fetch and order validation calls before touching a user-supplied symbol.
- `quotes.ts` — `validateQuote` (pure: rejects missing/malformed/crossed/future-dated/stale quotes
  — the single source of truth both the watchlist display and order validation call) and
  `getQuote` (fetches via the broker, validates, and logs every attempt — including rejections —
  to `market_data_snapshots` with provider/feed/source timestamp/retrieval timestamp).
- `bars.ts` — fetch-through historical bars, not persisted (no backtesting engine yet to justify
  caching history).
