// Scheduled Supabase Edge Function (Deno) — refreshes market_calendar daily.
//
// Deliberately self-contained rather than importing lib/calendar/sync.ts:
// Deno and Next.js's Node runtime aren't easily shared without a build
// step, and this function's own logic is narrow (~fetch Alpaca's calendar,
// upsert rows) so the duplication is small and explicit rather than hidden
// behind a cross-runtime build. If lib/calendar/sync.ts's early-close/
// closed-day logic ever changes, this function must be updated to match —
// see lib/calendar/sync.ts for the canonical version and its test suite.
//
// Deploy: `supabase functions deploy sync-market-calendar`
// Secrets (separate from .env.local — see docs/SUPABASE.md):
//   supabase secrets set ALPACA_PAPER_API_KEY_ID=... ALPACA_PAPER_API_SECRET_KEY=...
// Schedule (daily, well before market open): via the Supabase dashboard's
// Edge Function schedule UI, or a pg_cron job calling net.http_post against
// this function's URL.

import { createClient } from "jsr:@supabase/supabase-js@2";

const EXCHANGE_TIMEZONE = "America/New_York";
const STANDARD_CLOSE_TIME = "16:00";
const SYNC_WINDOW_DAYS = 90;

interface AlpacaCalendarDay {
  date: string;
  open: string;
  close: string;
}

function exchangeTimeToUtcIso(date: string, time: string): string {
  // Deno's Intl support resolves the IANA offset for the given date, same
  // approach as date-fns-tz on the Node side — no hand-tracked DST rules.
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: EXCHANGE_TIMEZONE,
    timeZoneName: "shortOffset",
  });
  const offsetPart = formatter.formatToParts(utcGuess).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const offsetHours = Number.parseInt(offsetPart.replace("GMT", ""), 10);
  return new Date(utcGuess - offsetHours * 60 * 60 * 1000).toISOString();
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

Deno.serve(async () => {
  const keyId = Deno.env.get("ALPACA_PAPER_API_KEY_ID");
  const secretKey = Deno.env.get("ALPACA_PAPER_API_SECRET_KEY");
  const baseUrl = Deno.env.get("ALPACA_PAPER_BASE_URL") ?? "https://paper-api.alpaca.markets";

  if (!keyId || !secretKey) {
    return new Response(JSON.stringify({ error: "Missing ALPACA_PAPER_* function secrets" }), { status: 500 });
  }
  if (!baseUrl.includes("paper-api.alpaca.markets")) {
    return new Response(JSON.stringify({ error: "ALPACA_PAPER_BASE_URL is not the paper endpoint" }), { status: 500 });
  }

  const start = new Date().toISOString().slice(0, 10);
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() + SYNC_WINDOW_DAYS);
  const end = endDate.toISOString().slice(0, 10);

  const calendarUrl = new URL("/v2/calendar", baseUrl);
  calendarUrl.searchParams.set("start", start);
  calendarUrl.searchParams.set("end", end);

  const response = await fetch(calendarUrl, {
    headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey },
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: `Alpaca calendar request failed: ${response.status}` }), {
      status: 502,
    });
  }

  const tradingDays = (await response.json()) as AlpacaCalendarDay[];
  const byDate = new Map(tradingDays.map((d) => [d.date, d]));

  const rows = enumerateDates(start, end).map((date) => {
    const day = byDate.get(date);
    if (!day) {
      return { date, session_type: "closed", market_open: null, market_close: null };
    }
    const sessionType = day.close < STANDARD_CLOSE_TIME ? "early_close" : "regular";
    return {
      date,
      session_type: sessionType,
      market_open: exchangeTimeToUtcIso(date, day.open),
      market_close: exchangeTimeToUtcIso(date, day.close),
    };
  });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("market_calendar").upsert(rows, { onConflict: "date" });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ synced: rows.length }), { status: 200 });
});
