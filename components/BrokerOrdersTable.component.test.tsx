// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrokerOrdersTable } from "./BrokerOrdersTable";
import type { BrokerOrder } from "@/lib/broker/types";

const SAMPLE_BROKER_ORDER: BrokerOrder = {
  brokerOrderId: "b1",
  clientOrderId: "c1",
  symbol: "MSFT",
  side: "buy",
  type: "market",
  qty: 2,
  limitPrice: null,
  status: "filled",
  filledQty: 2,
  filledAvgPrice: 300,
  submittedAt: "2024-06-01T14:30:00.000Z",
  filledAt: "2024-06-01T14:30:01.000Z",
};

describe("BrokerOrdersTable", () => {
  it("clearly labels this section as read-only Alpaca data — distinct from local simulation", () => {
    render(<BrokerOrdersTable orders={[SAMPLE_BROKER_ORDER]} unavailable={false} />);

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
  });

  it("shows a clear unavailable state instead of an empty/broken table when broker data isn't configured", () => {
    render(<BrokerOrdersTable orders={[]} unavailable={true} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});
