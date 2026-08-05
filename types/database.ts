// Hand-written to match supabase/migrations/0001_init.sql and
// 0002_phase1_paper_pipeline.sql. Once a real Supabase project exists,
// regenerate this from the live schema instead of hand-editing further:
//
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
//
// Kept hand-written since no project exists yet to generate from. Every
// table below carries `Relationships: []` even though we have no FK
// relationships to describe yet — @supabase/supabase-js's generic type
// machinery structurally requires that property to resolve Insert/Update
// types at all; omitting it silently collapses every insert()/update() call
// site to `never` instead of raising a clear error, which is exactly what
// happened here before this was added.

export type AccountMode = "paper" | "live";
export type ProposalDirection = "buy" | "sell";
export type ProposalStatus = "pending" | "approved" | "rejected" | "expired" | "executing" | "executed" | "failed";
export type ProposalSource = "manual" | "ai";
export type ProposalOrderType = "market" | "limit";
export type OrderStatus = "submitted" | "accepted" | "partially_filled" | "filled" | "canceled" | "rejected";
export type MarketSessionType = "regular" | "early_close" | "closed";
export type QuoteValidationStatus = "ok" | "stale" | "future_dated" | "crossed" | "malformed" | "missing";

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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
          stop_price: number | null;
          target_price: number | null;
          risk_amount: number | null;
          rationale: string | null;
          risk_notes: unknown[];
          ai_model: string | null;
          source: ProposalSource;
          order_type: ProposalOrderType;
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
          // Nullable at the type level, but only 'manual' rows may actually
          // omit these — 'ai' rows must supply both (enforced in the DB by
          // proposals_ai_requires_risk_fields, and mirrored in application
          // validation before insert).
          stop_price?: number | null;
          target_price?: number | null;
          risk_amount?: number | null;
          rationale?: string | null;
          risk_notes?: unknown[];
          ai_model?: string | null;
          source?: ProposalSource;
          order_type: ProposalOrderType;
          status?: ProposalStatus;
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
        Relationships: [];
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
          // Defaults true — every order in Phase 1 is a local simulation
          // (lib/local-broker/), never a real brokerage transmission.
          is_simulated: boolean;
          simulation_metadata: Record<string, unknown> | null;
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
          filled_qty?: number;
          filled_avg_price?: number | null;
          filled_at?: string | null;
          is_simulated?: boolean;
          simulation_metadata?: Record<string, unknown> | null;
        };
        Update: Partial<{
          broker_order_id: string | null;
          status: OrderStatus;
          filled_qty: number;
          filled_avg_price: number | null;
          filled_at: string | null;
        }>;
        Relationships: [];
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
        Relationships: [];
      };
      broker_account_snapshots: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          broker_account_id: string;
          equity: number;
          cash: number;
          buying_power: number;
          status: string;
          synced_at: string;
          raw: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          broker_account_id: string;
          equity: number;
          cash: number;
          buying_power: number;
          status: string;
          raw?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
      };
      market_data_snapshots: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          symbol: string;
          provider: string;
          feed: string;
          bid_price: number | null;
          ask_price: number | null;
          last_price: number | null;
          source_timestamp: string;
          retrieved_at: string;
          validation_status: QuoteValidationStatus;
          validation_notes: string | null;
          raw: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          symbol: string;
          provider: string;
          feed: string;
          bid_price?: number | null;
          ask_price?: number | null;
          last_price?: number | null;
          source_timestamp: string;
          validation_status: QuoteValidationStatus;
          validation_notes?: string | null;
          raw?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
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
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
