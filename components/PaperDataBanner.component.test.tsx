// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaperDataBanner } from "./PaperDataBanner";

describe("PaperDataBanner", () => {
  it("renders the PAPER DATA label", () => {
    render(<PaperDataBanner />);
    expect(screen.getByText(/PAPER DATA/)).toBeInTheDocument();
  });
});
