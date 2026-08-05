import { describe, expect, it, vi } from "vitest";
import type { ReadOnlyBrokerAdapter, BrokerCalendarDay } from "@/lib/broker/types";

const upsertMock = vi.fn().mockResolvedValue({ error: null });
const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: fromMock }),
}));

const { syncMarketCalendar } = await import("./sync");

function fakeBroker(days: BrokerCalendarDay[]): ReadOnlyBrokerAdapter {
  return {
    mode: "paper",
    getCalendar: vi.fn().mockResolvedValue(days),
  } as unknown as ReadOnlyBrokerAdapter;
}

describe("syncMarketCalendar", () => {
  it("fills in 'closed' rows for weekend/holiday dates the broker's calendar omits", async () => {
    upsertMock.mockClear();
    fromMock.mockClear();

    // Broker only returns the one trading day in this 3-day window (a Friday).
    const broker = fakeBroker([{ date: "2024-11-29", openTime: "09:30", closeTime: "13:00" }]);

    const count = await syncMarketCalendar(broker, { start: "2024-11-29", end: "2024-12-01" });

    expect(count).toBe(3); // Fri, Sat, Sun
    const rows = upsertMock.mock.calls[0][0];
    const byDate = Object.fromEntries(rows.map((r: { date: string }) => [r.date, r]));

    expect(byDate["2024-11-29"].session_type).toBe("early_close");
    // Nov 29, 2024 is after DST ended (Nov 3) — EST, UTC-5.
    expect(byDate["2024-11-29"].market_open).toBe("2024-11-29T14:30:00.000Z");
    expect(byDate["2024-11-29"].market_close).toBe("2024-11-29T18:00:00.000Z");

    expect(byDate["2024-11-30"].session_type).toBe("closed");
    expect(byDate["2024-11-30"].market_open).toBeNull();
    expect(byDate["2024-12-01"].session_type).toBe("closed");
  });

  it("classifies a full 4pm-close day as 'regular', not 'early_close'", async () => {
    upsertMock.mockClear();
    fromMock.mockClear();

    const broker = fakeBroker([{ date: "2024-12-02", openTime: "09:30", closeTime: "16:00" }]);
    await syncMarketCalendar(broker, { start: "2024-12-02", end: "2024-12-02" });

    const rows = upsertMock.mock.calls[0][0];
    expect(rows[0].session_type).toBe("regular");
  });

  it("upserts with onConflict: date so re-running the sync is idempotent", async () => {
    upsertMock.mockClear();
    fromMock.mockClear();

    const broker = fakeBroker([{ date: "2024-12-02", openTime: "09:30", closeTime: "16:00" }]);
    await syncMarketCalendar(broker, { start: "2024-12-02", end: "2024-12-02" });

    expect(upsertMock).toHaveBeenCalledWith(expect.any(Array), { onConflict: "date" });
  });
});
