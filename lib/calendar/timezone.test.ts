import { describe, expect, it } from "vitest";
import { exchangeTimeToUtcIso } from "./timezone";

describe("exchangeTimeToUtcIso", () => {
  it("converts a summer (EDT, UTC-4) open time correctly", () => {
    // 2024-07-01 is well inside 2024's DST window (Mar 10 - Nov 3).
    expect(exchangeTimeToUtcIso("2024-07-01", "09:30")).toBe("2024-07-01T13:30:00.000Z");
  });

  it("converts a winter (EST, UTC-5) open time correctly", () => {
    // 2024-12-02 is after DST ended (Nov 3, 2024).
    expect(exchangeTimeToUtcIso("2024-12-02", "09:30")).toBe("2024-12-02T14:30:00.000Z");
  });

  it("resolves the day immediately after the fall-back DST transition correctly", () => {
    // DST ended 2024-11-03 at 2am ET. 2024-11-04 is fully back on EST (UTC-5).
    expect(exchangeTimeToUtcIso("2024-11-04", "09:30")).toBe("2024-11-04T14:30:00.000Z");
  });

  it("resolves the day immediately after the spring-forward DST transition correctly", () => {
    // DST began 2024-03-10 at 2am ET. 2024-03-11 is fully on EDT (UTC-4).
    expect(exchangeTimeToUtcIso("2024-03-11", "09:30")).toBe("2024-03-11T13:30:00.000Z");
  });

  it("converts an early-close time (1:00pm ET) correctly", () => {
    expect(exchangeTimeToUtcIso("2024-11-29", "13:00")).toBe("2024-11-29T18:00:00.000Z");
  });
});
