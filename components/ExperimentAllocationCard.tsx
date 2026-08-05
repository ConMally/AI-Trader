import { formatCurrency } from "@/lib/format";

export interface ExperimentAllocationCardProps {
  startingBalance: number;
  localCash: number;
  localEquity: number;
}

// The $1,000 experiment allocation and its locally-computed remaining
// cash/equity — entirely separate from the Alpaca paper account shown in
// BrokerAccountCard. Never merge these two numbers.
export function ExperimentAllocationCard({ startingBalance, localCash, localEquity }: ExperimentAllocationCardProps) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-medium uppercase tracking-wide opacity-60">Experiment Allocation</p>
      <p className="mt-2 text-2xl font-semibold">{formatCurrency(startingBalance)}</p>
      <dl className="mt-3 flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">Local simulated cash remaining</dt>
          <dd>{formatCurrency(localCash)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Local simulated equity</dt>
          <dd>{formatCurrency(localEquity)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs opacity-60">
        Computed entirely from this app&apos;s own LOCAL SIMULATION order ledger — never Alpaca&apos;s
        real account balance.
      </p>
    </div>
  );
}
