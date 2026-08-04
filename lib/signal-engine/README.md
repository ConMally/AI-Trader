# Signal Engine

**Status:** not implemented (Phase 2)

Pure, unit-testable, rule-based functions that turn market data for a symbol
into a `signal_score` plus the plain-fact `qualifying_factors` that produced
it (e.g. "price > 50MA", "RSI < 30", "volume spike"). No AI involvement here
at all — the signal score is computed, not generated. This is the only input
the AI rationale layer (`lib/ai/`) is later allowed to explain; it cannot
change or invent it.

Every signal computed here also records which data source/feed and which
quote (with timestamp) it was computed from — see the `signals` table in
`supabase/migrations/0001_init.sql`.
