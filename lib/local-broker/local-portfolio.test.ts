import { describe, expect, it } from "vitest";
import { computeLocalPortfolio, type FilledLocalOrder } from "./local-portfolio";

describe("computeLocalPortfolio", () => {
  it("starts with the full starting balance and no positions when there are no orders", () => {
    const portfolio = computeLocalPortfolio(1000, []);
    expect(portfolio.cash).toBe(1000);
    expect(portfolio.positions).toEqual([]);
  });

  it("reduces cash and opens a position on a buy", () => {
    const orders: FilledLocalOrder[] = [{ symbol: "AAPL", direction: "buy", qty: 5, filledAvgPrice: 100 }];
    const portfolio = computeLocalPortfolio(1000, orders);

    expect(portfolio.cash).toBe(500); // 1000 - 5*100
    expect(portfolio.positions).toEqual([{ symbol: "AAPL", qty: 5, avgEntryPrice: 100 }]);
  });

  it("averages entry price across multiple buys of the same symbol", () => {
    const orders: FilledLocalOrder[] = [
      { symbol: "AAPL", direction: "buy", qty: 10, filledAvgPrice: 100 },
      { symbol: "AAPL", direction: "buy", qty: 10, filledAvgPrice: 120 },
    ];
    const portfolio = computeLocalPortfolio(10_000, orders);

    // cost basis = 1000 + 1200 = 2200 over 20 shares = 110 avg
    expect(portfolio.positions).toEqual([{ symbol: "AAPL", qty: 20, avgEntryPrice: 110 }]);
    expect(portfolio.cash).toBe(10_000 - 2200);
  });

  it("increases cash and reduces qty on a sell, keeping the same avg entry price", () => {
    const orders: FilledLocalOrder[] = [
      { symbol: "AAPL", direction: "buy", qty: 10, filledAvgPrice: 100 },
      { symbol: "AAPL", direction: "sell", qty: 4, filledAvgPrice: 150 },
    ];
    const portfolio = computeLocalPortfolio(1000, orders);

    expect(portfolio.cash).toBe(1000 - 1000 + 600); // -1000 (buy) + 600 (sell proceeds)
    expect(portfolio.positions).toEqual([{ symbol: "AAPL", qty: 6, avgEntryPrice: 100 }]);
  });

  it("removes a symbol from positions entirely once fully sold", () => {
    const orders: FilledLocalOrder[] = [
      { symbol: "AAPL", direction: "buy", qty: 10, filledAvgPrice: 100 },
      { symbol: "AAPL", direction: "sell", qty: 10, filledAvgPrice: 110 },
    ];
    const portfolio = computeLocalPortfolio(1000, orders);

    expect(portfolio.positions).toEqual([]);
    expect(portfolio.cash).toBe(1000 - 1000 + 1100);
  });

  it("tracks multiple symbols independently", () => {
    const orders: FilledLocalOrder[] = [
      { symbol: "AAPL", direction: "buy", qty: 5, filledAvgPrice: 100 },
      { symbol: "MSFT", direction: "buy", qty: 2, filledAvgPrice: 300 },
    ];
    const portfolio = computeLocalPortfolio(1000, orders);

    expect(portfolio.cash).toBe(1000 - 500 - 600);
    expect(portfolio.positions).toEqual(
      expect.arrayContaining([
        { symbol: "AAPL", qty: 5, avgEntryPrice: 100 },
        { symbol: "MSFT", qty: 2, avgEntryPrice: 300 },
      ])
    );
  });
});
