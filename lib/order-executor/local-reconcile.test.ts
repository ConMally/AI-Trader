import { describe, expect, it, vi, beforeEach } from "vitest";

const getProposalById = vi.fn();
const markExecuted = vi.fn();
const revertToApproved = vi.fn();
const findOrderByClientOrderId = vi.fn();
const logCriticalEvent = vi.fn();

vi.mock("@/lib/repositories/proposals-repository", () => ({
  getProposalById: (...args: unknown[]) => getProposalById(...args),
  markExecuted: (...args: unknown[]) => markExecuted(...args),
  revertToApproved: (...args: unknown[]) => revertToApproved(...args),
}));

vi.mock("@/lib/repositories/orders-repository", () => ({
  findOrderByClientOrderId: (...args: unknown[]) => findOrderByClientOrderId(...args),
}));

vi.mock("@/lib/repositories/audit-log-repository", () => ({
  logCriticalEvent: (...args: unknown[]) => logCriticalEvent(...args),
}));

const { reconcileStuckProposal } = await import("./local-reconcile");

const FAKE_SUPABASE = {} as never;

describe("reconcileStuckProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logCriticalEvent.mockResolvedValue(undefined);
  });

  it("makes no network call — every dependency is a local repository function", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    getProposalById.mockResolvedValue({ id: "p1", status: "executing", user_id: "u1", account_id: "a1", client_order_id: "c1" });
    findOrderByClientOrderId.mockResolvedValue({ id: "o1" });

    await reconcileStuckProposal(FAKE_SUPABASE, "p1");

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns already_resolved without touching orders when the proposal is no longer 'executing'", async () => {
    getProposalById.mockResolvedValue({ id: "p1", status: "executed", user_id: "u1", account_id: "a1", client_order_id: "c1" });

    const outcome = await reconcileStuckProposal(FAKE_SUPABASE, "p1");

    expect(outcome.result).toBe("already_resolved");
    expect(findOrderByClientOrderId).not.toHaveBeenCalled();
  });

  it("marks executed when a matching local order row exists", async () => {
    getProposalById.mockResolvedValue({ id: "p1", status: "executing", user_id: "u1", account_id: "a1", client_order_id: "c1" });
    findOrderByClientOrderId.mockResolvedValue({ id: "o1" });

    const outcome = await reconcileStuckProposal(FAKE_SUPABASE, "p1");

    expect(outcome.result).toBe("order_found_marked_executed");
    expect(markExecuted).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
    expect(revertToApproved).not.toHaveBeenCalled();
  });

  it("reverts to approved when no local order row exists", async () => {
    getProposalById.mockResolvedValue({ id: "p1", status: "executing", user_id: "u1", account_id: "a1", client_order_id: "c1" });
    findOrderByClientOrderId.mockResolvedValue(null);

    const outcome = await reconcileStuckProposal(FAKE_SUPABASE, "p1");

    expect(outcome.result).toBe("no_order_found_reverted_to_approved");
    expect(revertToApproved).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
    expect(markExecuted).not.toHaveBeenCalled();
  });
});
