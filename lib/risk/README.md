# Risk & Position-Sizing Engine

**Status:** not implemented (Phase 2)

Deterministic module that turns a signal into an actual, concrete proposal:
quantity, stop price, and target price — computed from account equity times
the configurable `risk_per_trade_pct` (default 0.5%, see `risk_limits`
table), clipped by every other hard limit on that same row (max position %,
max concurrent positions, etc.).

**This is the only module allowed to decide position size.** The AI
rationale layer (Phase 5) receives this module's output as a fact and
explains it — it never computes or overrides it. This is also the
highest-priority target for automated tests (see docs/ROADMAP.md Phase 6):
risk sizing correctness is the single most safety-critical piece of logic in
the whole system.
