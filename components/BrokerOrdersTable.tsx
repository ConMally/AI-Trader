import { formatCurrency } from "@/lib/format";
import type { BrokerOrder } from "@/lib/broker/types";

export interface BrokerOrdersTableProps {
  orders: BrokerOrder[];
  unavailable: boolean;
}

// Read-only display of Alpaca's own order history — fetched live, never
// persisted (see lib/account-sync/README.md). These are NOT this app's
// simulated orders; if the account has any, they were placed some other
// way (e.g. directly on Alpaca's own dashboard).
export function BrokerOrdersTable({ orders, unavailable }: BrokerOrdersTableProps) {
  if (unavailable) {
    return <p className="text-sm opacity-60">Broker order history unavailable — broker data isn&apos;t configured.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium opacity-70">Existing Alpaca paper orders (read-only)</p>
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
              <tr key={o.brokerOrderId} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4 font-medium">{o.symbol}</td>
                <td className="py-2 pr-4 capitalize">{o.side}</td>
                <td className="py-2 pr-4">{o.qty}</td>
                <td className="py-2 pr-4">{formatCurrency(o.filledAvgPrice)}</td>
                <td className="py-2">{o.status}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center opacity-60">
                  No orders in the Alpaca paper account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
