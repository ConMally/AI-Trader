// Persistent, non-dismissible. Every order-related page/component must
// carry this — see lib/local-broker/README.md and
// lib/order-executor/README.md's "standing rule for future UI work."
export function LocalSimulationBanner() {
  return (
    <div className="w-full bg-amber-500/15 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:text-amber-200">
      🧪 LOCAL SIMULATION — orders here are never sent to Alpaca or any brokerage. Every fill is
      computed locally against a reference quote.
    </div>
  );
}
