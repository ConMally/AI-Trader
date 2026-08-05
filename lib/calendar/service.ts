// Pure functions over an already-fetched window of CalendarDay rows plus an
// injectable "now" — deliberately no DB or broker access in this file, so
// weekend/holiday/early-close/DST behavior is unit-testable against fixed
// dates without waiting for a real holiday to roll around. The DB-backed
// convenience wrappers that fetch `days` from market_calendar live in
// lib/repositories/market-calendar-repository.ts.

import type { CalendarDay, CurrentTradingSession, NextMarketOpen } from "./types";

export function isTradingDay(days: CalendarDay[], date: string): boolean {
  const day = days.find((d) => d.date === date);
  return Boolean(day && day.sessionType !== "closed");
}

export function isMarketOpen(days: CalendarDay[], now: Date = new Date()): boolean {
  return days.some(
    (day) =>
      day.sessionType !== "closed" &&
      day.marketOpen !== null &&
      day.marketClose !== null &&
      new Date(day.marketOpen) <= now &&
      now <= new Date(day.marketClose)
  );
}

export function getCurrentTradingSession(days: CalendarDay[], now: Date = new Date()): CurrentTradingSession {
  const openDay = days.find(
    (day) =>
      day.sessionType !== "closed" &&
      day.marketOpen !== null &&
      day.marketClose !== null &&
      new Date(day.marketOpen) <= now &&
      now <= new Date(day.marketClose)
  );

  if (openDay) {
    return { status: "open", date: openDay.date, marketOpen: openDay.marketOpen, marketClose: openDay.marketClose };
  }

  // Not currently open — report against whichever calendar day contains
  // `now` in wall-clock terms if we have it, otherwise just the nearest
  // known day, purely for display purposes (callers must use isMarketOpen
  // for actual gating logic, not this label).
  const nowIso = now.toISOString();
  const nearestDay =
    days.find((day) => day.date === nowIso.slice(0, 10)) ??
    days.slice().sort((a, b) => a.date.localeCompare(b.date))[0];

  return {
    status: "closed",
    date: nearestDay?.date ?? nowIso.slice(0, 10),
    marketOpen: nearestDay?.marketOpen ?? null,
    marketClose: nearestDay?.marketClose ?? null,
  };
}

export function getNextMarketOpen(days: CalendarDay[], now: Date = new Date()): NextMarketOpen | null {
  const upcoming = days
    .filter((day) => day.sessionType !== "closed" && day.marketOpen !== null && new Date(day.marketOpen) > now)
    .sort((a, b) => new Date(a.marketOpen!).getTime() - new Date(b.marketOpen!).getTime());

  const next = upcoming[0];
  if (!next || !next.marketOpen) return null;

  return { date: next.date, marketOpen: next.marketOpen };
}
