import { formatCurrency } from "@/lib/format";
import type { RecentOrderWithSymbol } from "@/lib/repositories/orders-repository";

export interface LocalOrdersTableProps {
  orders: RecentOrderWithSymbol[];
}

export function LocalOrdersTable({ orders }: LocalOrdersTableProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium opacity-70">Local simulated orders</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2 pr-4 font-medium">Symbol</th>
              <th className="py-2 pr-4 font-medium">Side</th>
              <th className="py-2 pr-4 font-medium">Qty</th>
              <th className="py-2 pr-4 font-medium">Filled avg</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4 font-medium">{o.symbol}</td>
                <td className="py-2 pr-4 capitalize">{o.direction}</td>
                <td className="py-2 pr-4">{o.filledQty || o.qty}</td>
                <td className="py-2 pr-4">{formatCurrency(o.filledAvgPrice)}</td>
                <td className="py-2">
                  <span title="LOCAL SIMULATION — never sent to Alpaca">{o.status}</span>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center opacity-60">
                  No local simulated orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
