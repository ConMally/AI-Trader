import { formatCurrency } from "@/lib/format";

export interface WatchlistQuote {
  symbol: string;
  bidPrice: number | null;
  askPrice: number | null;
  validationStatus: string;
}

export interface WatchlistQuotesProps {
  quotes: WatchlistQuote[];
  unavailable: boolean;
}

export function WatchlistQuotes({ quotes, unavailable }: WatchlistQuotesProps) {
  if (unavailable) {
    return <p className="text-sm opacity-60">Watchlist quotes unavailable — broker data isn&apos;t configured.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">
        Alpaca paper market data — read only. Reference prices only, not a recommendation or an
        executable price.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2 pr-4 font-medium">Symbol</th>
              <th className="py-2 pr-4 font-medium">Bid</th>
              <th className="py-2 pr-4 font-medium">Ask</th>
              <th className="py-2 font-medium">Quote status</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.symbol} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4 font-medium">{q.symbol}</td>
                <td className="py-2 pr-4">{formatCurrency(q.bidPrice)}</td>
                <td className="py-2 pr-4">{formatCurrency(q.askPrice)}</td>
                <td className="py-2">
                  <span className={q.validationStatus === "ok" ? "opacity-70" : "text-amber-600 dark:text-amber-400"}>
                    {q.validationStatus}
                  </span>
                </td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center opacity-60">
                  No quotes to display.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
