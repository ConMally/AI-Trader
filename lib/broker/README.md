# Broker Adapters — READ-ONLY

**Status:** Phase 1 implemented, read-only only. Order placement does not live here — see
`lib/local-broker/` (local simulation, no network) and `lib/order-executor/`.

`types.ts` defines `ReadOnlyBrokerAdapter` — account/position/order display, quotes, bars,
calendar. There is no `submitOrder`, no `getOrderByClientOrderId`, no write method of any kind on
this interface, and `alpaca/client.ts` (`ReadOnlyAlpacaClient`) has no `post`/`put`/`patch`/`delete`
method at all — its one entry point, `get()`, funnels through an internal `request()` that asserts
`method === "GET"` before ever calling `fetch`. This is a structural guarantee, not a convention:
even a future edit that tries to reintroduce a write call here fails immediately.

`index.ts` exports `getPaperBrokerAdapter()` — the **only** function that reads `ALPACA_PAPER_*` env
vars. It fails closed (throws `BrokerConfigError`) if any credential is missing, or if
`ALPACA_PAPER_BASE_URL` doesn't contain `paper-api.alpaca.markets`. There is no
`getLiveBrokerAdapter` and no function anywhere in this codebase that returns anything capable of
placing an order against Alpaca, paper or live.

Hard rules:

- No shared code path ever reads both credential namespaces.
- **`lib/order-executor/` and `lib/local-broker/` must never import from `lib/broker/` at all** —
  order placement has zero dependency on this module. Only `lib/account-sync/` and
  `lib/market-data/` may import it.
- Order placement/reconciliation is entirely local — see `lib/local-broker/README.md` and
  `lib/order-executor/README.md`.
