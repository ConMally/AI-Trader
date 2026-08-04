// Hand-written to match supabase/migrations/0001_init.sql. Once a real
// Supabase project exists, regenerate this from the live schema instead of
// hand-editing further:
//
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
//
// Kept hand-written for Phase 0 since no project exists yet to generate
// from.

export type AccountMode = "paper" | "live";
export type ProposalDirection = "buy" | "sell";
export type ProposalStatus = "pending" | "approved" | "rejected" | "expired" | "executing" | "executed" | "failed";
export type OrderStatus = "submitted" | "accepted" | "partially_filled" | "filled" | "canceled" | "rejected";
export type MarketSessionType = "regular" | "early_close" | "closed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
        };
        Update: {
          display_name?: string | null;
        };
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          mode: AccountMode;
          broker: string;
          starting_balance: number;
          kill_switch_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          mode: AccountMode;
          broker?: string;
          starting_balance: number;
          kill_switch_enabled?: boolean;
        };
        Update: {
          kill_switch_enabled?: boolean;
        };
      };
      universe: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          enabled?: boolean;
        };
        Update: {
          enabled?: boolean;
        };
      };
      risk_limits: {
        Row: {
          id: string;
          account_id: string;
          risk_per_trade_pct: number;
          max_position_pct: number;
          max_daily_loss_pct: number;
          max_concurrent_positions: number;
          max_price_slippage_pct: number;
          quote_staleness_seconds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          risk_per_trade_pct?: number;
          max_position_pct?: number;
          max_daily_loss_pct?: number;
          max_concurrent_positions?: number;
          max_price_slippage_pct?: number;
          quote_staleness_seconds?: number;
        };
        Update: Partial<{
          risk_per_trade_pct: number;
          max_position_pct: number;
          max_daily_loss_pct: number;
          max_concurrent_positions: number;
          max_price_slippage_pct: number;
          quote_staleness_seconds: number;
        }>;
      };
      market_calendar: {
        Row: {
          date: string;
          session_type: MarketSessionType;
          market_open: string | null;
          market_close: string | null;
          synced_at: string;
        };
        Insert: {
          date: string;
          session_type: MarketSessionType;
          market_open?: string | null;
          market_close?: string | null;
        };
        Update: Partial<{
          session_type: MarketSessionType;
          market_open: string | null;
          market_close: string | null;
        }>;
      };
      signals: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          symbol: string;
          signal_score: number;
          qualifying_factors: unknown[];
          data_source: string;
          feed: string;
          quote_price: number;
          quote_timestamp: string;
          computed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          symbol: string;
          signal_score: number;
          qualifying_factors?: unknown[];
          data_source: string;
          feed: string;
          quote_price: number;
          quote_timestamp: string;
        };
        Update: never;
      };
      backtests: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          symbol: string;
          strategy_version: string;
          setup_description: string;
          sample_size: number;
          win_rate: number | null;
          avg_return_pct: number | null;
          stats: Record<string, unknown>;
          computed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          symbol: string;
          strategy_version: string;
          setup_description: string;
          sample_size: number;
          win_rate?: number | null;
          avg_return_pct?: number | null;
          stats?: Record<string, unknown>;
        };
        Update: never;
      };
      proposals: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          signal_id: string | null;
          symbol: string;
          direction: ProposalDirection;
          qty: number;
          entry_price: number;
          stop_price: number;
          target_price: number | null;
          risk_amount: number;
          rationale: string | null;
          risk_notes: unknown[];
          ai_model: string | null;
          status: ProposalStatus;
          client_order_id: string;
          expires_at: string;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          signal_id?: string | null;
          symbol: string;
          direction: ProposalDirection;
          qty: number;
          entry_price: number;
          stop_price: number;
          target_price?: number | null;
          risk_amount: number;
          rationale?: string | null;
          risk_notes?: unknown[];
          ai_model?: string | null;
          client_order_id: string;
          expires_at: string;
        };
        Update: Partial<{
          rationale: string | null;
          risk_notes: unknown[];
          ai_model: string | null;
          status: ProposalStatus;
          decided_at: string | null;
        }>;
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          proposal_id: string;
          broker_order_id: string | null;
          client_order_id: string;
          status: OrderStatus;
          filled_qty: number;
          filled_avg_price: number | null;
          submitted_at: string;
          filled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          proposal_id: string;
          broker_order_id?: string | null;
          client_order_id: string;
          status?: OrderStatus;
        };
        Update: Partial<{
          broker_order_id: string | null;
          status: OrderStatus;
          filled_qty: number;
          filled_avg_price: number | null;
          filled_at: string | null;
        }>;
      };
      positions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          symbol: string;
          qty: number;
          avg_entry_price: number;
          market_value: number | null;
          unrealized_pl: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          symbol: string;
          qty: number;
          avg_entry_price: number;
          market_value?: number | null;
          unrealized_pl?: number | null;
        };
        Update: Partial<{
          qty: number;
          avg_entry_price: number;
          market_value: number | null;
          unrealized_pl: number | null;
        }>;
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          event_type: string;
          entity_type: string;
          entity_id: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id?: string | null;
          event_type: string;
          entity_type: string;
          entity_id?: string | null;
          payload?: Record<string, unknown>;
        };
        Update: never;
      };
    };
  };
}
