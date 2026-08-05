import { formatCurrency } from "@/lib/format";
import type { BrokerAccountSnapshot } from "@/lib/broker/types";

export interface BrokerAccountCardProps {
  snapshot: BrokerAccountSnapshot | null;
  error: string | null;
}

export function BrokerAccountCard({ snapshot, error }: BrokerAccountCardProps) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-medium uppercase tracking-wide opacity-60">Alpaca Paper Account (read-only)</p>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t sync broker data: {error}
        </p>
      )}
      {!error && !snapshot && <p className="mt-2 text-sm opacity-60">Loading…</p>}
      {snapshot && (
        <>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(snapshot.equity)}</p>
          <dl className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="opacity-70">Cash</dt>
              <dd>{formatCurrency(snapshot.cash)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="opacity-70">Buying power</dt>
              <dd>{formatCurrency(snapshot.buyingPower)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="opacity-70">Status</dt>
              <dd>{snapshot.status}</dd>
            </div>
          </dl>
        </>
      )}
      <p className="mt-3 text-xs opacity-60">
        Real Alpaca paper-account data, read-only. Not affected by any order this app places — order
        placement never reaches Alpaca. See the LOCAL SIMULATION section for this app&apos;s own
        orders.
      </p>
    </div>
  );
}
