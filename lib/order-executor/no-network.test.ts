// Proves that the REAL confirm -> execute order lifecycle (not mocked
// repositories, not a mocked LocalOnlyOrderRecorder) never issues a single
// network request. A minimal in-memory fake stands in for Supabase (so no
// real DB round-trip is needed either) — global `fetch` is stubbed to
// throw immediately on any call, so any accidental network access anywhere
// in the real code path fails this test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmManualOrder } from "./confirm";
import { executeProposal } from "./executor";
import { LocalOnlyOrderRecorder } from "@/lib/local-broker/local-order-recorder";

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Array<[string, unknown]> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | undefined;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private readonly store: Map<string, Row[]>,
    private readonly table: string
  ) {}

  select() {
    return this;
  }
  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this.run();
  }
  single() {
    this.wantSingle = true;
    return this.run();
  }

  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every(([col, val]) => row[col] === val);
  }

  private async run() {
    const rows = this.store.get(this.table) ?? [];

    if (this.op === "select") {
      const matched = rows.filter((r) => this.matches(r));
      if (this.wantSingle) return { data: matched[0] ?? null, error: null };
      if (this.wantMaybeSingle) return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }

    if (this.op === "insert") {
      const newRow: Row = { id: crypto.randomUUID(), ...this.payload };
      rows.push(newRow);
      this.store.set(this.table, rows);
      return { data: newRow, error: null };
    }

    if (this.op === "update") {
      const matched = rows.filter((r) => this.matches(r));
      matched.forEach((r) => Object.assign(r, this.payload));
      return { data: matched[0] ?? null, error: null };
    }

    // delete
    const remaining = rows.filter((r) => !this.matches(r));
    this.store.set(this.table, remaining);
    return { data: null, error: null };
  }
}

function makeFakeSupabase() {
  const store = new Map<string, Row[]>();
  return {
    from(table: string) {
      return new FakeQueryBuilder(store, table);
    },
  } as never;
}

describe("full order lifecycle — zero network requests", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => {
      throw new Error("Network access attempted during local-simulation-only order flow");
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirmManualOrder -> executeProposal never calls fetch, using the real implementations", async () => {
    const supabase = makeFakeSupabase();

    const proposal = await confirmManualOrder(supabase, {
      user_id: "u1",
      account_id: "a1",
      symbol: "AAPL",
      direction: "buy",
      qty: 10,
      entry_price: 100,
      order_type: "market",
      client_order_id: "no-network-test-1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const outcome = await executeProposal({
      supabase,
      recorder: new LocalOnlyOrderRecorder(),
      proposalId: proposal.id,
      quote: {
        bidPrice: 100,
        askPrice: 100.1,
        lastPrice: null,
        sourceTimestamp: new Date().toISOString(),
        validation: { status: "ok" },
      },
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("executed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
