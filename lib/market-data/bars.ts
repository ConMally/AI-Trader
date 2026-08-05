import type { ReadOnlyBrokerAdapter, BrokerBar, GetBarsParams } from "@/lib/broker/types";

/**
 * Fetch-through only — Phase 1 has no backtesting engine yet to justify
 * persisting bar history, so this is a thin pass-through to the broker,
 * not a cache. Revisit once Phase 3 (backtesting) needs historical bars
 * repeatedly rather than for a single watchlist chart render.
 */
export async function getBars(broker: ReadOnlyBrokerAdapter, symbol: string, params: GetBarsParams): Promise<BrokerBar[]> {
  return broker.getBars(symbol, params);
}
