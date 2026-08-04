# AI Rationale Layer

**Status:** not implemented (Phase 5)

Calls Claude with an Anthropic **structured output / strict JSON schema**
request. Input is read-only: a signal's score, its qualifying factors, and
matching historical setup performance from `backtests`. Output is a plain-
English rationale plus qualitative risk notes, written back onto the
existing `proposals` row (`rationale`, `risk_notes`, `ai_model` columns) —
never a new proposal, never a size, never a broker call.

Hard constraints on this module's output schema:

- **No numeric confidence or probability field, ever.** Only qualitative,
  rule-grounded factors and risks — never present a percentage as if it
  were a probability of an outcome.
- No field or code path that can alter `qty`, `entry_price`, `stop_price`,
  `target_price`, or `status` on the proposal it's explaining.
- No tool access to place, cancel, or query broker orders — this module has
  no import path into `lib/broker/` at all.

Every AI response is validated against the strict Zod schema server-side
before being written to the database; a response that fails validation is
rejected/retried, never trusted as-is (see docs/ARCHITECTURE.md).

Deliberately built only after the deterministic Signal Engine, Sizing
Engine, backtesting, and paper-execution loop are all working reliably —
this module has no reason to exist until there's something real for it to
explain.
