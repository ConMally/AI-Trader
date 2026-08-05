import { describe, expect, it, vi, beforeEach } from "vitest";

const getProposalByClientOrderId = vi.fn();
const createManualProposal = vi.fn();
const deleteProposal = vi.fn();
const logCriticalEvent = vi.fn();

vi.mock("@/lib/repositories/proposals-repository", () => ({
  getProposalByClientOrderId: (...args: unknown[]) => getProposalByClientOrderId(...args),
  createManualProposal: (...args: unknown[]) => createManualProposal(...args),
  deleteProposal: (...args: unknown[]) => deleteProposal(...args),
}));

vi.mock("@/lib/repositories/audit-log-repository", () => ({
  logCriticalEvent: (...args: unknown[]) => logCriticalEvent(...args),
}));

const { confirmManualOrder, DuplicateSubmissionError } = await import("./confirm");

const FAKE_SUPABASE = {} as never;

const INPUT = {
  user_id: "u1",
  account_id: "a1",
  symbol: "AAPL",
  direction: "buy" as const,
  qty: 1,
  entry_price: 100,
  order_type: "market" as const,
  client_order_id: "c1",
  expires_at: "2024-06-01T14:35:00.000Z",
};

describe("confirmManualOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a duplicate client_order_id and never creates a second proposal", async () => {
    getProposalByClientOrderId.mockResolvedValue({ id: "existing-1" });
    logCriticalEvent.mockResolvedValue(undefined);

    await expect(confirmManualOrder(FAKE_SUPABASE, INPUT)).rejects.toBeInstanceOf(DuplicateSubmissionError);

    expect(createManualProposal).not.toHaveBeenCalled();
    expect(logCriticalEvent).toHaveBeenCalledWith(
      FAKE_SUPABASE,
      expect.objectContaining({ eventType: "duplicate_submission_blocked" })
    );
  });

  it("still refuses (throws) when the duplicate-blocked audit write itself fails", async () => {
    getProposalByClientOrderId.mockResolvedValue({ id: "existing-1" });
    logCriticalEvent.mockRejectedValue(new Error("audit db down"));

    await expect(confirmManualOrder(FAKE_SUPABASE, INPUT)).rejects.toThrow("audit db down");
    expect(createManualProposal).not.toHaveBeenCalled();
  });

  it("creates the proposal and logs manual_order_confirmed on success", async () => {
    getProposalByClientOrderId.mockResolvedValue(null);
    createManualProposal.mockResolvedValue({ id: "p1", ...INPUT });
    logCriticalEvent.mockResolvedValue(undefined);

    const proposal = await confirmManualOrder(FAKE_SUPABASE, INPUT);

    expect(proposal.id).toBe("p1");
    expect(logCriticalEvent).toHaveBeenCalledWith(
      FAKE_SUPABASE,
      expect.objectContaining({ eventType: "manual_order_confirmed", entityId: "p1" })
    );
    expect(deleteProposal).not.toHaveBeenCalled();
  });

  it("deletes the just-created proposal (compensating rollback) if the confirmation audit write fails", async () => {
    getProposalByClientOrderId.mockResolvedValue(null);
    createManualProposal.mockResolvedValue({ id: "p1", ...INPUT });
    logCriticalEvent.mockRejectedValue(new Error("audit db down"));

    await expect(confirmManualOrder(FAKE_SUPABASE, INPUT)).rejects.toThrow("audit db down");
    expect(deleteProposal).toHaveBeenCalledWith(FAKE_SUPABASE, "p1");
  });
});
