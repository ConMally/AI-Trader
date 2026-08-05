// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocalSimulationBanner } from "./LocalSimulationBanner";

describe("LocalSimulationBanner", () => {
  it("renders the LOCAL SIMULATION label and states orders are never sent to Alpaca", () => {
    render(<LocalSimulationBanner />);

    expect(screen.getByText(/LOCAL SIMULATION/)).toBeInTheDocument();
    expect(screen.getByText(/never sent to Alpaca/i)).toBeInTheDocument();
  });
});
