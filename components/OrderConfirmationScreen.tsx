"use client";

import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/format";

export interface ConfirmResponseData {
  proposalId: string;
  referenceQuote: { bidPrice: number | null; askPrice: number | null; sourceTimestamp: string };
  fillModel: "mid" | "bid_ask" | "bid_ask_plus_slippage";
  estimatedFill: { price: number | null; status: "filled" | "open" | "rejected" };
  allocationImpact: { estimatedCost: number; localCashRemainingAfter: number; pctOfAllocation: number };
  expiresAt: string;
}

export interface OrderConfirmationScreenProps {
  confirmation: ConfirmResponseData;
  clientOrderId: string;
  onExecuted: (result: unknown) => void;
  onCancel: () => void;
}

type ExecuteResult = { ok: true; data: unknown } | { ok: false; error: string; issues?: { code: string; message: string }[] };

export function OrderConfirmationScreen({ confirmation, clientOrderId, onExecuted, onCancel }: OrderConfirmationScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  // Once true, the button is disabled forever for this confirmation
  // screen — a resubmit reuses the same clientOrderId/proposalId rather
  // than the UI ever minting a second request for the same confirmation.
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (hasSubmitted) return;
    setSubmitting(true);
    setHasSubmitted(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: confirmation.proposalId, clientOrderId }),
      });
      const result: ExecuteResult = await response.json();

      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      onExecuted(result.data);
    } catch {
      setError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Confirm LOCAL SIMULATION order
      </p>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="opacity-70">Reference quote (bid / ask)</dt>
          <dd>
            {formatCurrency(confirmation.referenceQuote.bidPrice)} / {formatCurrency(confirmation.referenceQuote.askPrice)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Quote timestamp</dt>
          <dd>{new Date(confirmation.referenceQuote.sourceTimestamp).toLocaleTimeString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Fill model</dt>
          <dd className="capitalize">{confirmation.fillModel.replace(/_/g, " ")}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Estimated simulated fill</dt>
          <dd>
            {formatCurrency(confirmation.estimatedFill.price)} ({confirmation.estimatedFill.status})
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Estimated cost</dt>
          <dd>{formatCurrency(confirmation.allocationImpact.estimatedCost)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">% of $1,000 allocation</dt>
          <dd>{formatPercent(confirmation.allocationImpact.pctOfAllocation)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Local cash remaining after</dt>
          <dd>{formatCurrency(confirmation.allocationImpact.localCashRemainingAfter)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="opacity-70">Confirmation expires</dt>
          <dd>{new Date(confirmation.expiresAt).toLocaleTimeString()}</dd>
        </div>
      </dl>

      <p className="text-xs opacity-60">
        This will simulate a fill locally using the fill model above — it will never be transmitted
        to Alpaca or any brokerage.
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={hasSubmitted}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Simulating…" : "Confirm & Simulate"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={hasSubmitted}
          className="rounded border border-black/20 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
