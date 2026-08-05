# Local Broker (order placement — local simulation only)

**Status:** Phase 1 implemented. This is the only place in the codebase order placement happens.
There is no network call anywhere in this directory, and no import of `lib/broker/*` — order
placement has zero dependency on the Alpaca-backed read-only adapter.

`LocalOnlyOrderRecorder.submitLocalOrder()` takes a plain, already-fetched, already-validated
reference quote (numbers, not a broker object) and computes a deterministic fill synchronously:

- **Fill model is configurable** (`LocalFillConfig.fillModel`): `bid_ask` (buy fills at ask, sell
  at bid — the default), `mid` (fills at the midpoint regardless of side), or
  `bid_ask_plus_slippage` (bid/ask adjusted by a configurable `slippagePct`, always worse for the
  trader — simulates realistic execution cost).
- **Market orders** always fill immediately at the model's effective price.
- **Limit orders** fill immediately, at the limit price, only if the effective price has already
  crossed it; otherwise they're recorded `status: "open"` and stay that way. Phase 1 has no
  background sweep to fill an open limit order later — that's an explicit non-goal, not an
  oversight.
- Every result carries a `localOrderId` (`"local-<uuid>"`) and a full `SimulationMetadata` object
  (fill model, reference quote timestamp, bid/ask/last used, simulated latency, slippage applied,
  simulation engine version) — both are stored on the `orders` row (`is_simulated`,
  `simulation_metadata`) so nothing downstream has to infer that an order was simulated.

**Standing rule for future UI work:** any order-related UI must display a prominent
**LOCAL SIMULATION** banner/label — this is not an Alpaca paper order, and the UI must never imply
otherwise. Not implemented yet (no dashboard exists), but binding once one is built.
