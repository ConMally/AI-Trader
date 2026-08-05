import { describe, expect, it, vi, beforeEach } from "vitest";
import { LocalOnlyOrderRecorder } from "@/lib/local-broker/local-order-recorder";

const getProposalById = vi.fn();
const markExecuted = vi.fn();
const markFailed = vi.fn();
const revertToApproved = vi.fn();
const transitionToExecuting = vi.fn();
const recordLocalOrder = vi.fn();
const logCriticalEvent = vi.fn();
const logEventSafely = vi.fn();

vi.mock("@/lib/repositories/proposals-repository", () => ({
  getProposalById: (...args: unknown[]) => getProposalById(...args),
  markExecuted: (...args: unknown[]) => markExecuted(...args),
  markFailed: (...args: unknown[]) => markFailed(...args),
  revertToApproved: (...args: unknown[]) => revertToApproved(...args),
  transitionToExecuting: (...args: unknown[]) => transitionToExecuting(...args),
}));

vi.mock("@/lib/repositories/orders-repository", () => ({
  recordLocalOrder: (...args: unknown[]) => recordLocalOrder(...args),
}));

vi.mock("@/lib/repositories/audit-log-repository", () => ({
  logCriticalEvent: (...args: unknown[]) => logCriticalEvent(...args),
  logEventSafely: (...args: unknown[]) => logEventSafely(...args),
}));

const { executeProposal } = await import("./executor");

const FAKE_SUPABASE = {} as never;

function approvedProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    user_id: "u1",
    account_id: "a1",
    symbol: "AAPL",
    direction: "buy",
    qty: 10,
    entry_price: 100,
    order_type: "market",
    client_order_id: "c1",
    status: "approved",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

const GOOD_QUOTE = {
  bidPrice: 100,
  askPrice: 100.1,
  lastPrice: null,
  sourceTimestamp: new Date().toISOString(),
  validation: { status: "ok" as const },
};

describe("executeProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logCriticalEvent.mockResolvedValue(undefined);
    logEventSafely.mockResolvedValue(undefined);
    recordLocalOrder.mockResolvedValue(undefined);
    markExecuted.mockResolvedValue(undefined);
    markFailed.mockResolvedValue(undefined);
    revertToApproved.mockResolvedValue(undefined);
  });

  it("returns already_handled without touching the recorder when the proposal is no longer 'approved'", async () => {
    getProposalById.mockResolvedValue(approvedProposal({ status: "executed" }));
    const recorder = { submitLocalOrder: vi.fn() } as unknown as LocalOnlyOrderRecorder;

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: GOOD_QUOTE,
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("already_handled");
    expect(recorder.submitLocalOrder).not.toHaveBeenCalled();
    expect(transitionToExecuting).not.toHaveBeenCalled();
  });

  it("rejects at validation and never transitions to executing when the market is closed", async () => {
    getProposalById.mockResolvedValue(approvedProposal());
    const recorder = { submitLocalOrder: vi.fn() } as unknown as LocalOnlyOrderRecorder;

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: GOOD_QUOTE,
      marketOpen: false,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("rejected_by_validation");
    expect(transitionToExecuting).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
    expect(recorder.submitLocalOrder).not.toHaveBeenCalled();
  });

  it("returns already_handled when a concurrent call already claimed the transition", async () => {
    getProposalById.mockResolvedValue(approvedProposal());
    transitionToExecuting.mockResolvedValue(null);
    const recorder = { submitLocalOrder: vi.fn() } as unknown as LocalOnlyOrderRecorder;

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: GOOD_QUOTE,
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("already_handled");
    expect(recorder.submitLocalOrder).not.toHaveBeenCalled();
  });

  it("reverts to approved (never marks executed) when the pre-fill audit write fails", async () => {
    getProposalById.mockResolvedValue(approvedProposal());
    transitionToExecuting.mockResolvedValue(approvedProposal({ status: "executing" }));
    logCriticalEvent.mockRejectedValueOnce(new Error("audit down"));
    const recorder = { submitLocalOrder: vi.fn() } as unknown as LocalOnlyOrderRecorder;

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: GOOD_QUOTE,
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("audit_failed_before_execution");
    expect(revertToApproved).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
    expect(recorder.submitLocalOrder).not.toHaveBeenCalled();
    expect(markExecuted).not.toHaveBeenCalled();
  });

  it("executes successfully end to end using the real LocalOnlyOrderRecorder", async () => {
    getProposalById.mockResolvedValue(approvedProposal());
    transitionToExecuting.mockResolvedValue(approvedProposal({ status: "executing" }));
    const recorder = new LocalOnlyOrderRecorder();

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: GOOD_QUOTE,
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("executed");
    if (outcome.status === "executed") {
      expect(outcome.order.simulation).toBe(true);
      expect(outcome.order.filledAvgPrice).toBe(100.1); // ask, bid_ask default model
    }
    expect(recordLocalOrder).toHaveBeenCalled();
    expect(markExecuted).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
  });

  it("escalates rather than claims success when the post-fill audit write fails", async () => {
    getProposalById.mockResolvedValue(approvedProposal());
    transitionToExecuting.mockResolvedValue(approvedProposal({ status: "executing" }));
    logCriticalEvent.mockResolvedValueOnce(undefined); // order_execution_started succeeds
    logCriticalEvent.mockRejectedValueOnce(new Error("audit down")); // order_execution_succeeded fails
    const recorder = new LocalOnlyOrderRecorder();

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: GOOD_QUOTE,
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("execution_recorded_but_audit_failed");
    // The local fill is still real/recorded — markExecuted already ran.
    expect(markExecuted).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
  });

  it("marks failed and reports execution_rejected when the recorder itself has no usable price", async () => {
    getProposalById.mockResolvedValue(approvedProposal());
    transitionToExecuting.mockResolvedValue(approvedProposal({ status: "executing" }));
    const recorder = new LocalOnlyOrderRecorder();

    const outcome = await executeProposal({
      supabase: FAKE_SUPABASE,
      recorder,
      proposalId: "p1",
      quote: { bidPrice: null, askPrice: null, lastPrice: null, sourceTimestamp: new Date().toISOString(), validation: { status: "ok" } },
      marketOpen: true,
      maxSlippagePct: 0.005,
    });

    expect(outcome.status).toBe("execution_rejected");
    expect(markFailed).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
    expect(markExecuted).not.toHaveBeenCalled();
  });
});
