import type { DiagnosticResult, Severity } from "../core/types.js";
import type { PlatformType } from "../platforms/types.js";

// ---------------------------------------------------------------------------
// Multi-platform orchestrator types
// ---------------------------------------------------------------------------

/** Result from a single platform's diagnostic run */
export interface PlatformResult {
  platform: PlatformType;
  status: "success" | "error";
  result?: DiagnosticResult;
  error?: string;
}

/** Cross-platform signal types */
export type CrossPlatformSignalType =
  | "market_wide_cpm_increase"
  | "halo_effect"
  | "platform_conflict"
  | "budget_reallocation";

/** A finding that correlates data across multiple platforms */
export interface CrossPlatformFinding {
  signal: CrossPlatformSignalType;
  severity: Severity;
  platforms: PlatformType[];
  message: string;
  recommendation: string;
}

/** Budget reallocation recommendation */
export interface BudgetRecommendation {
  from: PlatformType;
  to: PlatformType;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/** Complete result from multi-platform diagnostic */
export interface MultiPlatformResult {
  /** Per-platform results */
  platforms: PlatformResult[];
  /** Cross-platform correlation findings */
  crossPlatformFindings: CrossPlatformFinding[];
  /** Budget reallocation recommendations */
  budgetRecommendations: BudgetRecommendation[];
  /** Executive summary (plain text) */
  executiveSummary: string;
}
