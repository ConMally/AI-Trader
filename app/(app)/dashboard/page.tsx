import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getPaperAccount, getRiskLimits } from "@/lib/repositories/accounts-repository";
import { listUniverse } from "@/lib/repositories/universe-repository";
import { ensureDefaultUniverse } from "@/lib/market-data/universe";
import { getQuote } from "@/lib/market-data/quotes";
import { listRecentOrdersWithSymbol } from "@/lib/repositories/orders-repository";
import { getLocalPortfolio } from "@/lib/local-broker/local-portfolio";
import { getPaperBrokerAdapter } from "@/lib/broker";
import { syncAccountSnapshot, syncPositions, getRecentBrokerOrders } from "@/lib/account-sync/sync";
import {
  getCurrentTradingSessionNow,
  getNextMarketOpenFromNow,
  isMarketOpenNow,
} from "@/lib/repositories/market-calendar-repository";
import type { ReadOnlyBrokerAdapter, BrokerAccountSnapshot, BrokerPosition, BrokerOrder } from "@/lib/broker/types";
import { ExperimentAllocationCard } from "@/components/ExperimentAllocationCard";
import { BrokerAccountCard } from "@/components/BrokerAccountCard";
import { MarketStatusBadge } from "@/components/MarketStatusBadge";
import { WatchlistQuotes, type WatchlistQuote } from "@/components/WatchlistQuotes";
import { LocalPositionsTable } from "@/components/LocalPositionsTable";
import { LocalOrdersTable } from "@/components/LocalOrdersTable";
import { BrokerPositionsTable } from "@/components/BrokerPositionsTable";
import { BrokerOrdersTable } from "@/components/BrokerOrdersTable";

const WATCHLIST_LIMIT = 20;

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-6 text-center">
        <p className="text-sm opacity-70">
          Supabase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>{" "}
          and fill in your project&apos;s values — see <code>docs/SUPABASE.md</code>.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const account = await getPaperAccount(supabase, user.id);
  await ensureDefaultUniverse(supabase, user.id);
  const universe = await listUniverse(supabase, user.id);
  const riskLimits = await getRiskLimits(supabase, account.id);

  // Broker data degrades gracefully and independently — a missing/broken
  // Alpaca connection never blocks the local-simulation sections below,
  // which have no broker dependency at all.
  let broker: ReadOnlyBrokerAdapter | null = null;
  let brokerConfigError: string | null = null;
  try {
    broker = getPaperBrokerAdapter();
  } catch (error) {
    brokerConfigError = error instanceof Error ? error.message : String(error);
  }

  let brokerSnapshot: BrokerAccountSnapshot | null = null;
  let brokerPositions: BrokerPosition[] = [];
  let brokerOrders: BrokerOrder[] = [];
  let quotes: WatchlistQuote[] = [];

  if (broker) {
    const activeBroker = broker;
    const syncParams = { supabase, broker: activeBroker, userId: user.id, accountId: account.id };

    await Promise.allSettled([
      syncAccountSnapshot(syncParams).then((snapshot) => {
        brokerSnapshot = snapshot;
      }),
      syncPositions(syncParams).then((positions) => {
        brokerPositions = positions;
      }),
      getRecentBrokerOrders(activeBroker, { limit: 20 }).then((orders) => {
        brokerOrders = orders;
      }),
    ]);

    const watchlistSymbols = universe.filter((u) => u.enabled).slice(0, WATCHLIST_LIMIT);
    const quoteResults = await Promise.allSettled(
      watchlistSymbols.map(async (u) => {
        const { quote, validation } = await getQuote(activeBroker, supabase, {
          userId: user.id,
          accountId: account.id,
          symbol: u.symbol,
          stalenessSeconds: riskLimits.quote_staleness_seconds,
        });
        return { symbol: u.symbol, bidPrice: quote.bidPrice, askPrice: quote.askPrice, validationStatus: validation.status };
      })
    );
    quotes = quoteResults.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  }

  const [portfolio, localOrders, marketOpen, session, nextOpen] = await Promise.all([
    getLocalPortfolio(supabase, { accountId: account.id, startingBalance: account.starting_balance }),
    listRecentOrdersWithSymbol(supabase, account.id, 20),
    isMarketOpenNow(supabase),
    getCurrentTradingSessionNow(supabase),
    getNextMarketOpenFromNow(supabase),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <a href="/orders/new" className="rounded bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          New simulated order
        </a>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <ExperimentAllocationCard startingBalance={account.starting_balance} localCash={portfolio.cash} localEquity={portfolio.equity} />
        <BrokerAccountCard snapshot={brokerSnapshot} error={brokerConfigError} />
      </section>

      <section>
        <MarketStatusBadge open={marketOpen} session={session} nextOpen={nextOpen} />
      </section>

      <section>
        <p className="mb-2 text-sm font-medium opacity-70">Watchlist quotes</p>
        <WatchlistQuotes quotes={quotes} unavailable={!broker} />
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold">Local Simulation</h2>
          <LocalPositionsTable positions={portfolio.positions} />
          <LocalOrdersTable orders={localOrders} />
        </div>
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold">Alpaca Paper Account (read-only)</h2>
          <BrokerPositionsTable positions={brokerPositions} unavailable={!broker} />
          <BrokerOrdersTable orders={brokerOrders} unavailable={!broker} />
        </div>
      </section>
    </main>
  );
}
