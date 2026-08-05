import { describe, expect, it } from "vitest";
import { getCurrentTradingSession, getNextMarketOpen, isMarketOpen, isTradingDay } from "./service";
import { exchangeTimeToUtcIso } from "./timezone";
import type { CalendarDay } from "./types";

function regularDay(date: string): CalendarDay {
  return {
    date,
    sessionType: "regular",
    marketOpen: exchangeTimeToUtcIso(date, "09:30"),
    marketClose: exchangeTimeToUtcIso(date, "16:00"),
  };
}

function earlyCloseDay(date: string, closeTime: string): CalendarDay {
  return {
    date,
    sessionType: "early_close",
    marketOpen: exchangeTimeToUtcIso(date, "09:30"),
    marketClose: exchangeTimeToUtcIso(date, closeTime),
  };
}

function closedDay(date: string): CalendarDay {
  return { date, sessionType: "closed", marketOpen: null, marketClose: null };
}

// A representative week: Wed regular, Thu holiday (Thanksgiving), Fri early
// close, Sat/Sun weekend, following Mon regular.
const WEEK: CalendarDay[] = [
  regularDay("2024-11-27"),
  closedDay("2024-11-28"), // Thanksgiving
  earlyCloseDay("2024-11-29", "13:00"), // day-after-Thanksgiving early close
  closedDay("2024-11-30"), // Saturday
  closedDay("2024-12-01"), // Sunday
  regularDay("2024-12-02"),
];

describe("isTradingDay", () => {
  it("is true for a regular session day", () => {
    expect(isTradingDay(WEEK, "2024-11-27")).toBe(true);
  });

  it("is false for a holiday", () => {
    expect(isTradingDay(WEEK, "2024-11-28")).toBe(false);
  });

  it("is false for a weekend day", () => {
    expect(isTradingDay(WEEK, "2024-11-30")).toBe(false);
    expect(isTradingDay(WEEK, "2024-12-01")).toBe(false);
  });

  it("is true for an early-close day", () => {
    expect(isTradingDay(WEEK, "2024-11-29")).toBe(true);
  });
});

describe("isMarketOpen", () => {
  it("is true during regular session hours", () => {
    const noon = new Date(exchangeTimeToUtcIso("2024-11-27", "12:00"));
    expect(isMarketOpen(WEEK, noon)).toBe(true);
  });

  it("is false before the regular session opens", () => {
    const beforeOpen = new Date(exchangeTimeToUtcIso("2024-11-27", "08:00"));
    expect(isMarketOpen(WEEK, beforeOpen)).toBe(false);
  });

  it("is false on a weekend", () => {
    const saturdayNoon = new Date(exchangeTimeToUtcIso("2024-11-30", "12:00"));
    expect(isMarketOpen(WEEK, saturdayNoon)).toBe(false);
  });

  it("is false on a holiday", () => {
    const thanksgivingNoon = new Date(exchangeTimeToUtcIso("2024-11-28", "12:00"));
    expect(isMarketOpen(WEEK, thanksgivingNoon)).toBe(false);
  });

  it("respects the earlier close on an early-close day", () => {
    const at2pm = new Date(exchangeTimeToUtcIso("2024-11-29", "14:00")); // after 1pm early close
    expect(isMarketOpen(WEEK, at2pm)).toBe(false);

    const at12pm = new Date(exchangeTimeToUtcIso("2024-11-29", "12:00")); // before 1pm close
    expect(isMarketOpen(WEEK, at12pm)).toBe(true);
  });
});

describe("getCurrentTradingSession", () => {
  it("reports 'open' with the correct day during regular hours", () => {
    const noon = new Date(exchangeTimeToUtcIso("2024-11-27", "12:00"));
    const session = getCurrentTradingSession(WEEK, noon);
    expect(session.status).toBe("open");
    expect(session.date).toBe("2024-11-27");
  });

  it("reports 'closed' on a holiday", () => {
    const thanksgivingNoon = new Date(exchangeTimeToUtcIso("2024-11-28", "12:00"));
    expect(getCurrentTradingSession(WEEK, thanksgivingNoon).status).toBe("closed");
  });
});

describe("getNextMarketOpen", () => {
  it("skips the Thanksgiving holiday and reports the early-close Friday's open", () => {
    const wedAfterClose = new Date(exchangeTimeToUtcIso("2024-11-27", "17:00"));
    const next = getNextMarketOpen(WEEK, wedAfterClose);
    expect(next?.date).toBe("2024-11-29");
  });

  it("skips the weekend and reports Monday's open", () => {
    const fridayAfterClose = new Date(exchangeTimeToUtcIso("2024-11-29", "14:00"));
    const next = getNextMarketOpen(WEEK, fridayAfterClose);
    expect(next?.date).toBe("2024-12-02");
  });

  it("returns null when there is no known future open in the provided window", () => {
    const afterEverything = new Date(exchangeTimeToUtcIso("2024-12-02", "17:00"));
    expect(getNextMarketOpen(WEEK, afterEverything)).toBeNull();
  });
});
