// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalOrdersTable } from "./LocalOrdersTable";
import type { RecentOrderWithSymbol } from "@/lib/repositories/orders-repository";

const SAMPLE_ORDER: RecentOrderWithSymbol = {
  id: "o1",
  symbol: "AAPL",
  direction: "buy",
  orderType: "market",
  qty: 5,
  filledQty: 5,
  filledAvgPrice: 100,
  status: "filled",
  submittedAt: "2024-06-01T14:30:00.000Z",
};

describe("LocalOrdersTable", () => {
  it("labels the section as local simulated orders and never mentions Alpaca", () => {
    render(<LocalOrdersTable orders={[SAMPLE_ORDER]} />);

    expect(screen.getByText(/local simulated orders/i)).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.queryByText(/alpaca/i)).not.toBeInTheDocument();
  });

  it("shows an empty state rather than a blank table when there are no orders", () => {
    render(<LocalOrdersTable orders={[]} />);
    expect(screen.getByText(/no local simulated orders/i)).toBeInTheDocument();
  });
});
