import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ReadOnlyBrokerAdapter, BrokerOrder } from "@/lib/broker/types";
import { insertSnapshot } from "@/lib/repositories/broker-account-snapshots-repository";
import { listPositions, upsertPosition, zeroOutPosition } from "@/lib/repositories/positions-repository";
import { logEventSafely } from "@/lib/repositories/audit-log-repository";

export interface SyncAccountParams {
  supabase: SupabaseClient<Database>;
  broker: ReadOnlyBrokerAdapter;
  userId: string;
  accountId: string;
}

/**
 * Fetches the Alpaca paper account snapshot and persists it. Read-only —
 * calls only `broker.getAccount()`, never anything write-shaped (that
 * method doesn't exist on ReadOnlyBrokerAdapter at all). Sync
 * success/failure is logged as an informational (best-effort) event, per
 * the critical/best-effort split in lib/order-executor/README.md — a sync
 * failure here doesn't touch any order or proposal state.
 */
export async function syncAccountSnapshot(params: SyncAccountParams) {
  const { supabase, broker, userId, accountId } = params;

  try {
    const snapshot = await broker.getAccount();
    await insertSnapshot(supabase, { userId, accountId, snapshot });
    await logEventSafely(supabase, {
      userId,
      accountId,
      eventType: "account_synced",
      entityType: "account",
      entityId: accountId,
      payload: { status: snapshot.status },
    });
    return snapshot;
  } catch (error) {
    await logEventSafely(supabase, {
      userId,
      accountId,
      eventType: "account_sync_failed",
      entityType: "account",
      entityId: accountId,
      payload: { reason: String(error) },
    });
    throw error;
  }
}

/**
 * Fetches Alpaca's reported positions and reconciles them into the
 * `positions` table — broker-synced positions only (see decision #1 in
 * CLAUDE.md's Phase 1 notes); local simulated positions are a separate,
 * derived concept (lib/local-broker/local-portfolio.ts) and never touch
 * this table. Any symbol previously synced but no longer reported by the
 * broker is zeroed out, not deleted.
 */
export async function syncPositions(params: SyncAccountParams) {
  const { supabase, broker, userId, accountId } = params;

  try {
    const brokerPositions = await broker.getPositions();
    const existing = await listPositions(supabase, accountId);

    for (const position of brokerPositions) {
      await upsertPosition(supabase, { userId, accountId, position });
    }

    const reportedSymbols = new Set(brokerPositions.map((p) => p.symbol));
    for (const row of existing) {
      if (!reportedSymbols.has(row.symbol) && row.qty !== 0) {
        await zeroOutPosition(supabase, accountId, row.symbol);
      }
    }

    await logEventSafely(supabase, {
      userId,
      accountId,
      eventType: "positions_synced",
      entityType: "account",
      entityId: accountId,
      payload: { count: brokerPositions.length },
    });
    return brokerPositions;
  } catch (error) {
    await logEventSafely(supabase, {
      userId,
      accountId,
      eventType: "positions_sync_failed",
      entityType: "account",
      entityId: accountId,
      payload: { reason: String(error) },
    });
    throw error;
  }
}

/**
 * Live pass-through to Alpaca's own order history — informational display
 * only, never persisted (see decision #2 in CLAUDE.md's Phase 1 notes:
 * `orders.proposal_id` is NOT NULL and every persisted order traces to a
 * proposal, which an order placed directly on Alpaca's own dashboard
 * doesn't have).
 */
export async function getRecentBrokerOrders(broker: ReadOnlyBrokerAdapter, params: { limit?: number } = {}): Promise<BrokerOrder[]> {
  return broker.getRecentOrders(params);
}

/** Orchestrates snapshot + position sync together — what the account
 * snapshot/positions API routes call. */
export async function syncAccount(params: SyncAccountParams) {
  const [snapshot, positions] = await Promise.all([syncAccountSnapshot(params), syncPositions(params)]);
  return { snapshot, positions };
}
