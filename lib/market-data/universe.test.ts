import { describe, expect, it, vi } from "vitest";
import { assertSymbolInUniverse, ensureDefaultUniverse, SymbolNotInUniverseError } from "./universe";
import { DEFAULT_UNIVERSE } from "./default-universe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function fakeSupabase(overrides: Record<string, unknown> = {}) {
  return { from: vi.fn().mockReturnValue(overrides) } as unknown as SupabaseClient<Database>;
}

describe("assertSymbolInUniverse", () => {
  it("resolves when the symbol is an enabled universe row", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "row-1" }, error: null }),
    };
    const supabase = fakeSupabase(chain);

    await expect(assertSymbolInUniverse(supabase, { userId: "u1", symbol: "AAPL" })).resolves.toBeUndefined();
  });

  it("throws SymbolNotInUniverseError when the symbol is not found", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = fakeSupabase(chain);

    await expect(assertSymbolInUniverse(supabase, { userId: "u1", symbol: "ZZZZ" })).rejects.toBeInstanceOf(
      SymbolNotInUniverseError
    );
  });
});

describe("ensureDefaultUniverse", () => {
  it("seeds the default list when the universe table is empty", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
      insert: insertMock,
    };
    const supabase = fakeSupabase(chain);

    await ensureDefaultUniverse(supabase, "u1");

    expect(insertMock).toHaveBeenCalledWith(
      DEFAULT_UNIVERSE.map((symbol) => ({ user_id: "u1", symbol, enabled: true }))
    );
  });

  it("does nothing when the user already has universe rows (idempotent)", async () => {
    const insertMock = vi.fn();
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      insert: insertMock,
    };
    const supabase = fakeSupabase(chain);

    await ensureDefaultUniverse(supabase, "u1");

    expect(insertMock).not.toHaveBeenCalled();
  });
});
