import { formatCurrency } from "@/lib/format";
import type { LocalPosition } from "@/lib/local-broker/local-portfolio";

export interface LocalPositionsTableProps {
  positions: LocalPosition[];
}

export function LocalPositionsTable({ positions }: LocalPositionsTableProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium opacity-70">Local simulated positions</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2 pr-4 font-medium">Symbol</th>
              <th className="py-2 pr-4 font-medium">Qty</th>
              <th className="py-2 font-medium">Avg entry (simulated)</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4 font-medium">{p.symbol}</td>
                <td className="py-2 pr-4">{p.qty}</td>
                <td className="py-2">{formatCurrency(p.avgEntryPrice)}</td>
              </tr>
            ))}
            {positions.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center opacity-60">
                  No local simulated positions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
