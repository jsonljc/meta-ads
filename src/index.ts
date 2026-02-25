// ---------------------------------------------------------------------------
// meta-ads — Multi-vertical media performance diagnostic engine
// ---------------------------------------------------------------------------

// Core types
export type {
  FunnelSchema,
  FunnelStage,
  MetricSnapshot,
  StageMetrics,
  DiagnosticResult,
  StageDiagnostic,
  FunnelDropoff,
  Finding,
  Severity,
  VerticalType,
  EntityLevel,
  TimeRange,
  ComparisonPeriods,
  VerticalBenchmarks,
  StageBenchmark,
} from "./core/types.js";

// API client
export { MetaApiClient } from "./core/api/client.js";
export type { MetaApiConfig } from "./core/api/types.js";

// Analysis engine
export { analyzeFunnel } from "./core/analysis/funnel-walker.js";
export type { FindingAdvisor, FunnelWalkerOptions } from "./core/analysis/funnel-walker.js";
export { buildComparisonPeriods, buildTrailingPeriods } from "./core/analysis/comparator.js";
export { isSignificantChange, zScore, percentChange } from "./core/analysis/significance.js";
export { accountVariance, getEffectiveVariance } from "./core/analysis/thresholds.js";
export type { AccountHistory } from "./core/analysis/thresholds.js";

// Verticals — Commerce
export { commerceFunnel } from "./verticals/commerce/funnel.js";
export { commerceBenchmarks } from "./verticals/commerce/benchmarks.js";
export { commerceAdvisors } from "./verticals/commerce/diagnostics.js";

// Verticals — Lead Generation
export { leadgenFunnel, createLeadgenFunnel, DEFAULT_QUALIFIED_LEAD_ACTION } from "./verticals/leadgen/funnel.js";
export { leadgenBenchmarks, createLeadgenBenchmarks } from "./verticals/leadgen/benchmarks.js";
export { leadgenAdvisors } from "./verticals/leadgen/diagnostics.js";

// Skills
export {
  runFunnelDiagnostic,
  formatDiagnostic,
} from "./skills/funnel-diagnostic.js";
export type { FunnelDiagnosticInput } from "./skills/funnel-diagnostic.js";
