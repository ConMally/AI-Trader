import type { CurrentTradingSession, NextMarketOpen } from "@/lib/calendar/types";

export interface MarketStatusBadgeProps {
  open: boolean;
  session: CurrentTradingSession;
  nextOpen: NextMarketOpen | null;
}

export function MarketStatusBadge({ open, session, nextOpen }: MarketStatusBadgeProps) {
  return (
    <div>
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
          open ? "bg-green-500/15 text-green-800 dark:text-green-300" : "bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/70"
        }`}
      >
        <span aria-hidden>{open ? "🟢" : "⚪"}</span>
        <span>{open ? "Market open" : "Market closed"}</span>
        {!open && nextOpen && (
          <span className="opacity-70">
            — next open {new Date(nextOpen.marketOpen).toLocaleString()}
          </span>
        )}
        <span className="sr-only">Trading day: {session.date}</span>
      </div>
      <p className="mt-1 text-xs opacity-60">Market status from Alpaca paper market data — read only.</p>
    </div>
  );
}
