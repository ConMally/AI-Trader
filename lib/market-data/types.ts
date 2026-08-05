import type { QuoteValidationStatus } from "@/types/database";

export type { QuoteValidationStatus };

export interface QuoteValidationResult {
  status: QuoteValidationStatus;
  notes?: string;
}

export interface ValidatedQuote {
  symbol: string;
  bidPrice: number | null;
  askPrice: number | null;
  sourceTimestamp: string;
  provider: string;
  feed: string;
  validation: QuoteValidationResult;
}
