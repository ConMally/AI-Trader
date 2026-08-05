// The initial, configurable allow-list of liquid US stocks/ETFs a new
// account's universe is seeded with (see ensureDefaultUniverse in
// universe.ts). 20 symbols — large-cap tech/financials/consumer plus major
// index ETFs, chosen for liquidity and name-recognition, not as investment
// advice (see docs/DISCLAIMER.md). Editable per-account after signup; this
// is only the starting point, not a hard-coded ceiling.
export const DEFAULT_UNIVERSE: readonly string[] = [
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "NVDA",
  "TSLA",
  "JPM",
  "V",
  "JNJ",
  "PG",
  "KO",
  "DIS",
  "NFLX",
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "XLF",
  "XLK",
];
