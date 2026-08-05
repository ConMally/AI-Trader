import { formatCurrency } from "@/lib/format";
import type { BrokerPosition } from "@/lib/broker/types";

export interface BrokerPositionsTableProps {
  positions: BrokerPosition[];
  unavailable: boolean;
}

export function BrokerPositionsTable({ positions, unavailable }: BrokerPositionsTableProps) {
  if (unavailable) {
    return <p className="text-sm opacity-60">Broker positions unavailable — broker data isn&apos;t configured.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium opacity-70">Alpaca paper positions (read-only)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2 pr-4 font-medium">Symbol</th>
              <th className="py-2 pr-4 font-medium">Qty</th>
              <th className="py-2 font-medium">Avg entry</th>
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
                  No positions in the Alpaca paper account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
