// A minimal in-memory stand-in for a Supabase client, supporting exactly
// the query-builder chains this codebase's repositories use
// (select/insert/update/delete/eq/order/limit/single/maybeSingle/in/gte/lte/count).
// Used by tests that want to exercise REAL repository/route code without a
// real Supabase project or any network access — see
// lib/order-executor/no-network.test.ts for why this matters for the
// "zero network requests" proof, and app/api/*/route.test.ts for route-level
// tests that need a working `.from()` without mocking every repository call.
export type Row = Record<string, unknown>;

interface FakeQueryResult {
  data: unknown;
  error: { message: string } | null;
  count?: number;
}

class FakeQueryBuilder implements PromiseLike<FakeQueryResult> {
  private filters: Array<[string, unknown, "eq" | "gte" | "lte" | "in"]> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | undefined;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private wantCount = false;
  private limitCount: number | undefined;
  private orderBy: { column: string; ascending: boolean } | undefined;

  constructor(
    private readonly store: Map<string, Row[]>,
    private readonly table: string
  ) {}

  select(_columns?: string, options?: { count?: "exact"; head?: boolean }) {
    if (options?.count) this.wantCount = true;
    return this;
  }
  insert(payload: Row | Row[]) {
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
    this.filters.push([column, value, "eq"]);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push([column, value, "gte"]);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push([column, value, "lte"]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push([column, values, "in"]);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
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

  then<T1 = FakeQueryResult, T2 = never>(
    onfulfilled?: ((value: FakeQueryResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every(([col, val, kind]) => {
      const rowVal = row[col];
      if (kind === "eq") return rowVal === val;
      if (kind === "gte") return String(rowVal) >= String(val);
      if (kind === "lte") return String(rowVal) <= String(val);
      if (kind === "in") return Array.isArray(val) && val.includes(rowVal);
      return true;
    });
  }

  private async run(): Promise<FakeQueryResult> {
    const rows = this.store.get(this.table) ?? [];

    if (this.op === "select") {
      let matched = rows.filter((r) => this.matches(r));
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        matched = [...matched].sort((a, b) => {
          const av = String(a[column]);
          const bv = String(b[column]);
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (this.limitCount !== undefined) matched = matched.slice(0, this.limitCount);
      if (this.wantCount) return { data: null, error: null, count: matched.length };
      if (this.wantSingle) return { data: matched[0] ?? null, error: matched[0] ? null : { message: "no rows" } };
      if (this.wantMaybeSingle) return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }

    if (this.op === "insert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const newRows = payloads.map((p) => ({ id: crypto.randomUUID(), ...p }));
      rows.push(...newRows);
      this.store.set(this.table, rows);
      return { data: this.wantSingle ? newRows[0] : newRows, error: null };
    }

    if (this.op === "update") {
      const matched = rows.filter((r) => this.matches(r));
      matched.forEach((r) => Object.assign(r, this.payload));
      if (this.wantSingle || this.wantMaybeSingle) return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }

    // delete
    const remaining = rows.filter((r) => !this.matches(r));
    this.store.set(this.table, remaining);
    return { data: null, error: null };
  }
}

export interface FakeSupabase {
  from(table: string): FakeQueryBuilder;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  __store: Map<string, Row[]>;
}

export function createFakeSupabaseClient(userId: string | null = "user-1"): FakeSupabase {
  const store = new Map<string, Row[]>();
  return {
    from(table: string) {
      return new FakeQueryBuilder(store, table);
    },
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null } };
      },
    },
    __store: store,
  };
}

export function seed(supabase: FakeSupabase, table: string, rows: Row[]): void {
  supabase.__store.set(table, [...(supabase.__store.get(table) ?? []), ...rows]);
}
