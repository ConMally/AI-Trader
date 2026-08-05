import type {
  BrokerAccountSnapshot,
  BrokerBar,
  BrokerCalendarDay,
  BrokerOrder,
  BrokerPosition,
  BrokerQuote,
  GetBarsParams,
  GetCalendarParams,
  ReadOnlyBrokerAdapter,
} from "../types";
import type { ReadOnlyAlpacaClient } from "./client";
import {
  mapAccount,
  mapBar,
  mapCalendarDay,
  mapOrder,
  mapPosition,
  mapQuote,
  type AlpacaAccountWire,
  type AlpacaBarWire,
  type AlpacaCalendarDayWire,
  type AlpacaOrderWire,
  type AlpacaPositionWire,
  type AlpacaQuoteWire,
} from "./mapper";

// Free-tier market data feed. Alpaca gates the higher-quality 'sip' feed
// behind a paid subscription; 'iex' works on every account including a
// brand-new paper one, which is what Phase 1 needs to run out of the box.
const DEFAULT_FEED = "iex";

/**
 * The only ReadOnlyBrokerAdapter implementation in Phase 1. `mode` is the
 * literal type 'paper'. There is no `submitOrder` or
 * `getOrderByClientOrderId` method on this class at all — order placement
 * lives entirely in lib/local-broker/ (LocalOnlyOrderRecorder), which has
 * no dependency on this class or this module. This class cannot be used,
 * structurally or otherwise, to place, cancel, or reconcile an order
 * against Alpaca.
 */
export class AlpacaPaperAdapter implements ReadOnlyBrokerAdapter {
  readonly mode = "paper" as const;

  constructor(private readonly client: ReadOnlyAlpacaClient) {}

  async getAccount(): Promise<BrokerAccountSnapshot> {
    const wire = await this.client.get<AlpacaAccountWire>("/v2/account");
    return mapAccount(wire);
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const wire = await this.client.get<AlpacaPositionWire[]>("/v2/positions");
    return wire.map(mapPosition);
  }

  async getRecentOrders(params: { limit?: number } = {}): Promise<BrokerOrder[]> {
    const wire = await this.client.get<AlpacaOrderWire[]>("/v2/orders", {
      query: { status: "all", limit: params.limit ?? 50, direction: "desc" },
    });
    return wire.map(mapOrder);
  }

  async getLatestQuote(symbol: string): Promise<BrokerQuote> {
    const wire = await this.client.get<AlpacaQuoteWire>(`/v2/stocks/${symbol}/quotes/latest`, {
      target: "data",
      query: { feed: DEFAULT_FEED },
    });
    return mapQuote(wire, DEFAULT_FEED);
  }

  async getBars(symbol: string, params: GetBarsParams): Promise<BrokerBar[]> {
    const wire = await this.client.get<{ bars: AlpacaBarWire[] }>(`/v2/stocks/${symbol}/bars`, {
      target: "data",
      query: {
        timeframe: params.timeframe,
        start: params.start,
        end: params.end,
        feed: DEFAULT_FEED,
      },
    });
    return (wire.bars ?? []).map((bar) => mapBar(symbol, bar));
  }

  async getCalendar(params: GetCalendarParams): Promise<BrokerCalendarDay[]> {
    const wire = await this.client.get<AlpacaCalendarDayWire[]>("/v2/calendar", {
      query: { start: params.start, end: params.end },
    });
    return wire.map(mapCalendarDay);
  }
}
