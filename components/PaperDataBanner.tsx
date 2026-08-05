// Persistent, non-dismissible. Distinguishes the read-only Alpaca data
// shown on this dashboard from the LOCAL SIMULATION order flow above it —
// the account/position/order data under "Alpaca Paper Account" sections is
// real paper-account data, read live from Alpaca, but not affected by any
// order this app places (since no order this app places ever reaches it).
export function PaperDataBanner() {
  return (
    <div className="w-full bg-sky-500/15 px-4 py-2 text-center text-sm font-medium text-sky-900 dark:text-sky-200">
      📊 ALPACA PAPER DATA — READ ONLY — account and position figures reflect a real Alpaca
      paper-trading account. Not financial advice — see docs/DISCLAIMER.md.
    </div>
  );
}
