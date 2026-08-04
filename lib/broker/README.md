# Broker Adapters

**Status:** not implemented (Phase 1 for paper, Phase 7 for live)

A common `BrokerAdapter` interface (place order, get positions, get account,
get quotes) with two **fully separate** implementations:

- `AlpacaPaperAdapter` — reads only `ALPACA_PAPER_*` env vars, hits
  `ALPACA_PAPER_BASE_URL`. Built in Phase 1.
- `AlpacaLiveAdapter` — reads only `ALPACA_LIVE_*` env vars, hits
  `ALPACA_LIVE_BASE_URL`. Built in Phase 7, behind an explicit opt-in flow.

Hard rules for this module, carried over from the approved architecture:

- No shared code path ever reads both credential namespaces at once.
- No adapter ever falls back to the other automatically — if live env vars
  are missing, live mode is simply unavailable, not silently downgraded to
  paper (and vice versa).
- **Only the deterministic Order Executor calls into this module.** The AI
  rationale layer (Phase 5) has no import path to this directory at all.
- Order submission is idempotent via a caller-supplied `client_order_id` —
  the same id must never place two orders.
