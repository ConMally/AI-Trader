"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OrderTicketForm, type OrderTicketDraft } from "@/components/OrderTicketForm";
import { OrderConfirmationScreen, type ConfirmResponseData } from "@/components/OrderConfirmationScreen";

type ConfirmResult =
  | { ok: true; data: ConfirmResponseData }
  | { ok: false; error: string; issues?: { code: string; message: string }[] };

export default function NewOrderPage() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<ConfirmResponseData | null>(null);
  // Generated once per ticket attempt, reused for retries of the same
  // attempt (network hiccup, etc.) — a fresh attempt (after Cancel) gets a
  // fresh id. Prevents a resubmit from ever minting a second client_order_id
  // for what's conceptually the same order.
  const [clientOrderId, setClientOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ code: string; message: string }[]>([]);
  const [executedResult, setExecutedResult] = useState<unknown>(null);

  async function handleTicketSubmit(draft: OrderTicketDraft) {
    setSubmitting(true);
    setErrors([]);
    const idToUse = clientOrderId ?? crypto.randomUUID();
    setClientOrderId(idToUse);

    try {
      const response = await fetch("/api/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientOrderId: idToUse, ...draft }),
      });
      const result: ConfirmResult = await response.json();

      if (!result.ok) {
        setErrors(result.issues ?? [{ code: "error", message: result.error }]);
        setSubmitting(false);
        return;
      }

      setConfirmation(result.data);
      setSubmitting(false);
    } catch {
      setErrors([{ code: "network", message: "Network error — please check your connection and try again." }]);
      setSubmitting(false);
    }
  }

  function handleCancel() {
    setConfirmation(null);
    setClientOrderId(null);
    setErrors([]);
  }

  if (executedResult) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold">Simulation result</h1>
        <pre className="overflow-x-auto rounded bg-black/5 p-4 text-xs dark:bg-white/5">
          {JSON.stringify(executedResult, null, 2)}
        </pre>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Back to dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">New simulated order</h1>
      {!confirmation && <OrderTicketForm submitting={submitting} errors={errors} onSubmit={handleTicketSubmit} />}
      {confirmation && clientOrderId && (
        <OrderConfirmationScreen
          confirmation={confirmation}
          clientOrderId={clientOrderId}
          onExecuted={setExecutedResult}
          onCancel={handleCancel}
        />
      )}
    </main>
  );
}
