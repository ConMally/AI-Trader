"use client";

import { useEffect, useState, type FormEvent } from "react";

export interface OrderTicketDraft {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  qty: number;
  limitPrice?: number;
}

export interface OrderTicketFormProps {
  submitting: boolean;
  errors: { code: string; message: string }[];
  onSubmit: (draft: OrderTicketDraft) => void;
}

export function OrderTicketForm({ submitting, errors, onSubmit }: OrderTicketFormProps) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");

  useEffect(() => {
    fetch("/api/universe")
      .then((res) => res.json())
      .then((result) => {
        if (result.ok) {
          setSymbols(result.data.symbols);
          setSymbol((current) => current || result.data.symbols[0] || "");
        }
      })
      .catch(() => {
        // Left as an empty list — the <select> below shows "No symbols
        // available" rather than crashing the page.
      });
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedQty = Number.parseInt(qty, 10);
    const parsedLimitPrice = limitPrice ? Number.parseFloat(limitPrice) : undefined;

    onSubmit({
      symbol,
      side,
      type,
      qty: parsedQty,
      limitPrice: type === "limit" ? parsedLimitPrice : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        New LOCAL SIMULATION order
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Symbol
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          required
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        >
          {symbols.length === 0 && <option value="">No symbols available</option>}
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Side
          <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")} className="rounded border border-black/20 px-3 py-2 dark:border-white/20">
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Order type
          <select value={type} onChange={(e) => setType(e.target.value as "market" | "limit")} className="rounded border border-black/20 px-3 py-2 dark:border-white/20">
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Quantity (whole shares)
        <input
          type="number"
          min={1}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          required
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
      </label>

      {type === "limit" && (
        <label className="flex flex-col gap-1 text-sm">
          Limit price
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            required
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
          />
        </label>
      )}

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-red-600 dark:text-red-400">
          {errors.map((issue) => (
            <li key={issue.code}>{issue.message}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting || !symbol}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {submitting ? "Checking…" : "Preview order"}
      </button>

      <p className="text-xs opacity-60">
        Long-only. No shorting, options, margin, extended hours, or fractional shares in Phase 1.
      </p>
    </form>
  );
}
