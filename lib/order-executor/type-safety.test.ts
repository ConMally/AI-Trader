// Proves — at compile time, via `npx tsc --noEmit` (part of the standard
// verification suite) — that nothing Alpaca-backed can be passed where
// executeProposal expects a LocalOnlyOrderRecorder. This is enforced
// through the type system and dependency injection, not a source-text
// scan: `recorder` is typed as the concrete LocalOnlyOrderRecorder class,
// and AlpacaPaperAdapter has no `submitLocalOrder` method (or
// `submitOrder`/`getOrderByClientOrderId` at all) to structurally match it.
//
// If this file fails to typecheck, either someone reintroduced a matching
// method on AlpacaPaperAdapter, or `executeProposal`'s `recorder` parameter
// was loosened to an interface something else could satisfy — both would
// mean this guarantee has regressed.
import { describe, it, expect } from "vitest";
import type { ExecuteProposalParams } from "./executor";
import { AlpacaPaperAdapter } from "@/lib/broker/alpaca/paper-adapter";
import type { ReadOnlyAlpacaClient } from "@/lib/broker/alpaca/client";
import { LocalOnlyOrderRecorder } from "@/lib/local-broker/local-order-recorder";

describe("type safety: only LocalOnlyOrderRecorder can fill executeProposal's recorder slot", () => {
  it("accepts a real LocalOnlyOrderRecorder (sanity check for the assertion below)", () => {
    const recorder: ExecuteProposalParams["recorder"] = new LocalOnlyOrderRecorder();
    expect(recorder).toBeInstanceOf(LocalOnlyOrderRecorder);
  });

  it("documents (and lets tsc enforce) that an Alpaca-backed adapter cannot satisfy the same slot", () => {
    const alpacaAdapter = new AlpacaPaperAdapter({} as ReadOnlyAlpacaClient);

    // @ts-expect-error — AlpacaPaperAdapter has no submitLocalOrder method
    // (and no submitOrder/getOrderByClientOrderId at all, per the Phase 1
    // recovery pass), so it cannot structurally satisfy the
    // LocalOnlyOrderRecorder type executeProposal requires.
    const recorder: ExecuteProposalParams["recorder"] = alpacaAdapter;

    expect(recorder).toBeDefined();
  });
});
