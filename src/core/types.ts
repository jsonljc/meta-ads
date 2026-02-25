// ---------------------------------------------------------------------------
// Funnel Schema — defines the shape of a vertical's funnel
// ---------------------------------------------------------------------------

export interface FunnelStage {
  /** Human-readable name shown in diagnostics */
  name: string;
  /** The Meta actions[] action_type, or a top-level field like 'impressions' */
  metric: string;
  /** Where to find this metric in the API response (e.g. "actions", "top_level", "metrics") */
  metricSource: string;
  /** The cost metric for this stage (null if not directly billable) */
  costMetric: string | null;
  /** Where to find the cost metric */
  costMetricSource: string | null;
}

export interface FunnelSchema {
  vertical: VerticalType;
  stages: FunnelStage[];
  /** The primary KPI action_type (e.g. 'purchase', 'lead') */
  primaryKPI: string;
  /** ROAS metric if applicable */
  roasMetric: string | null;
}

// ---------------------------------------------------------------------------
// Verticals
// ---------------------------------------------------------------------------

export type VerticalType = "commerce" | "leadgen" | "brand";

// ---------------------------------------------------------------------------
// Metric data — normalized output from the API fetch layer
// ---------------------------------------------------------------------------

export interface StageMetrics {
  count: number;
  cost: number | null;
}

/** A single time-period snapshot of all funnel metrics for an entity */
export interface MetricSnapshot {
  /** The ad account, campaign, or adset ID */
  entityId: string;
  entityLevel: EntityLevel;
  /** ISO date string for period start */
  periodStart: string;
  /** ISO date string for period end */
  periodEnd: string;
  /** Total spend in this period */
  spend: number;
  /** Metrics keyed by the FunnelStage.metric value */
  stages: Record<string, StageMetrics>;
  /** Raw top-level fields (ctr, cpm, cpc, etc.) */
  topLevel: Record<string, number>;
}

export type EntityLevel = "account" | "campaign" | "adset" | "ad";

// ---------------------------------------------------------------------------
// Time ranges
// ---------------------------------------------------------------------------

export interface TimeRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export interface ComparisonPeriods {
  current: TimeRange;
  previous: TimeRange;
}

// ---------------------------------------------------------------------------
// Diagnostic output
// ---------------------------------------------------------------------------

export type Severity = "critical" | "warning" | "info" | "healthy";

export interface StageDiagnostic {
  stageName: string;
  metric: string;
  currentValue: number;
  previousValue: number;
  /** Absolute change */
  delta: number;
  /** Percentage change (positive = increase) */
  deltaPercent: number;
  /** Whether this change is statistically meaningful given spend */
  isSignificant: boolean;
  severity: Severity;
}

export interface FunnelDropoff {
  fromStage: string;
  toStage: string;
  currentRate: number;
  previousRate: number;
  deltaPercent: number;
}

export interface DiagnosticResult {
  vertical: VerticalType;
  entityId: string;
  /** Platform that generated this result (e.g. "meta", "google", "tiktok") */
  platform?: string;
  periods: ComparisonPeriods;
  spend: { current: number; previous: number };
  /** Primary KPI summary */
  primaryKPI: {
    name: string;
    current: number;
    previous: number;
    deltaPercent: number;
    severity: Severity;
  };
  /** Per-stage WoW comparison */
  stageAnalysis: StageDiagnostic[];
  /** Drop-off rates between adjacent stages */
  dropoffs: FunnelDropoff[];
  /** The stage with the most significant negative change */
  bottleneck: StageDiagnostic | null;
  /** Human-readable diagnosis strings */
  findings: Finding[];
}

export interface Finding {
  severity: Severity;
  stage: string;
  message: string;
  recommendation: string | null;
}

// ---------------------------------------------------------------------------
// Vertical benchmarks — fallback thresholds for new accounts
// ---------------------------------------------------------------------------

export interface StageBenchmark {
  /** Expected drop-off rate from the stage above (e.g. 0.03 = 3% of clicks become ATC) */
  expectedDropoffRate: number;
  /** How much WoW variance is normal before flagging */
  normalVariancePercent: number;
}

export interface VerticalBenchmarks {
  vertical: VerticalType;
  benchmarks: Record<string, StageBenchmark>;
}
