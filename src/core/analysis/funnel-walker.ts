import type {
  FunnelSchema,
  MetricSnapshot,
  ComparisonPeriods,
  DiagnosticResult,
  StageDiagnostic,
  FunnelDropoff,
  Finding,
  Severity,
  VerticalBenchmarks,
} from "../types.js";
import { percentChange, isSignificantChange } from "./significance.js";

// ---------------------------------------------------------------------------
// Generic Funnel Walker
// ---------------------------------------------------------------------------
// Walks any FunnelSchema, compares two MetricSnapshots, and produces a
// DiagnosticResult. This is vertical-agnostic — the schema defines the
// shape, and optional advisors can append vertical-specific findings.
// ---------------------------------------------------------------------------

export type FindingAdvisor = (
  stageAnalysis: StageDiagnostic[],
  dropoffs: FunnelDropoff[],
  current: MetricSnapshot,
  previous: MetricSnapshot
) => Finding[];

export interface FunnelWalkerOptions {
  funnel: FunnelSchema;
  current: MetricSnapshot;
  previous: MetricSnapshot;
  periods: ComparisonPeriods;
  benchmarks?: VerticalBenchmarks;
  /** Vertical-specific advisors that generate findings */
  advisors?: FindingAdvisor[];
}

export function analyzeFunnel(options: FunnelWalkerOptions): DiagnosticResult {
  const { funnel, current, previous, periods, benchmarks, advisors } = options;

  // 1. Per-stage WoW analysis
  const stageAnalysis = analyzeStages(funnel, current, previous, benchmarks);

  // 2. Drop-off rates between adjacent stages
  const dropoffs = analyzeDropoffs(funnel, current, previous);

  // 3. Find the bottleneck — stage with worst significant degradation
  const bottleneck = findBottleneck(stageAnalysis);

  // 4. Primary KPI summary
  const primaryStage = funnel.stages.find(
    (s) => s.metric === funnel.primaryKPI || s.costMetric === funnel.primaryKPI
  );
  const primaryMetric = funnel.primaryKPI;
  const currentKPI = current.stages[primaryMetric]?.cost ?? 0;
  const previousKPI = previous.stages[primaryMetric]?.cost ?? 0;
  const kpiDelta = percentChange(currentKPI, previousKPI);

  const primaryKPI = {
    name: primaryStage?.name ?? primaryMetric,
    current: currentKPI,
    previous: previousKPI,
    deltaPercent: kpiDelta,
    severity: classifySeverity(kpiDelta, current.spend, true),
  };

  // 5. Generate findings — start with generic, then vertical-specific advisors
  const findings: Finding[] = generateGenericFindings(
    stageAnalysis,
    dropoffs,
    bottleneck,
    primaryKPI
  );

  if (advisors) {
    for (const advisor of advisors) {
      findings.push(...advisor(stageAnalysis, dropoffs, current, previous));
    }
  }

  // Sort findings by severity
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    healthy: 3,
  };
  findings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return {
    vertical: funnel.vertical,
    entityId: current.entityId,
    periods,
    spend: { current: current.spend, previous: previous.spend },
    primaryKPI,
    stageAnalysis,
    dropoffs,
    bottleneck,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Stage-level analysis
// ---------------------------------------------------------------------------

function analyzeStages(
  funnel: FunnelSchema,
  current: MetricSnapshot,
  previous: MetricSnapshot,
  benchmarks?: VerticalBenchmarks
): StageDiagnostic[] {
  return funnel.stages.map((stage) => {
    const currentMetrics = current.stages[stage.metric];
    const previousMetrics = previous.stages[stage.metric];

    const currentValue = currentMetrics?.count ?? 0;
    const previousValue = previousMetrics?.count ?? 0;
    const delta = currentValue - previousValue;
    const deltaPercent = percentChange(currentValue, previousValue);

    const benchmarkVariance =
      benchmarks?.benchmarks[stage.metric]?.normalVariancePercent;

    const significant = isSignificantChange(
      deltaPercent,
      current.spend,
      benchmarkVariance
    );

    return {
      stageName: stage.name,
      metric: stage.metric,
      currentValue,
      previousValue,
      delta,
      deltaPercent,
      isSignificant: significant,
      severity: classifySeverity(deltaPercent, current.spend, false),
    };
  });
}

// ---------------------------------------------------------------------------
// Drop-off analysis between adjacent funnel stages
// ---------------------------------------------------------------------------

function analyzeDropoffs(
  funnel: FunnelSchema,
  current: MetricSnapshot,
  previous: MetricSnapshot
): FunnelDropoff[] {
  const dropoffs: FunnelDropoff[] = [];

  for (let i = 0; i < funnel.stages.length - 1; i++) {
    const fromStage = funnel.stages[i];
    const toStage = funnel.stages[i + 1];

    const currentFrom = current.stages[fromStage.metric]?.count ?? 0;
    const currentTo = current.stages[toStage.metric]?.count ?? 0;
    const previousFrom = previous.stages[fromStage.metric]?.count ?? 0;
    const previousTo = previous.stages[toStage.metric]?.count ?? 0;

    const currentRate = currentFrom > 0 ? currentTo / currentFrom : 0;
    const previousRate = previousFrom > 0 ? previousTo / previousFrom : 0;

    dropoffs.push({
      fromStage: fromStage.name,
      toStage: toStage.name,
      currentRate,
      previousRate,
      deltaPercent: percentChange(currentRate, previousRate),
    });
  }

  return dropoffs;
}

// ---------------------------------------------------------------------------
// Bottleneck detection
// ---------------------------------------------------------------------------

function findBottleneck(
  stageAnalysis: StageDiagnostic[]
): StageDiagnostic | null {
  let worst: StageDiagnostic | null = null;

  for (const stage of stageAnalysis) {
    // Only consider significant negative changes (volume dropped)
    if (!stage.isSignificant || stage.deltaPercent >= 0) continue;

    if (worst === null || stage.deltaPercent < worst.deltaPercent) {
      worst = stage;
    }
  }

  return worst;
}

// ---------------------------------------------------------------------------
// Severity classification
// ---------------------------------------------------------------------------

function classifySeverity(
  deltaPercent: number,
  spend: number,
  isCostMetric: boolean
): Severity {
  // For cost metrics (CPA, CPL), increases are bad
  // For volume metrics (clicks, purchases), decreases are bad
  const badDirection = isCostMetric ? deltaPercent > 0 : deltaPercent < 0;
  const magnitude = Math.abs(deltaPercent);

  if (!badDirection) return "healthy";

  // Adjust thresholds by spend — larger accounts get tighter thresholds
  const spendMultiplier = spend > 5000 ? 0.7 : spend > 1000 ? 0.85 : 1;

  if (magnitude > 30 * spendMultiplier) return "critical";
  if (magnitude > 15 * spendMultiplier) return "warning";
  if (magnitude > 5 * spendMultiplier) return "info";
  return "healthy";
}

// ---------------------------------------------------------------------------
// Generic findings — not vertical-specific
// ---------------------------------------------------------------------------

function generateGenericFindings(
  stageAnalysis: StageDiagnostic[],
  dropoffs: FunnelDropoff[],
  bottleneck: StageDiagnostic | null,
  primaryKPI: DiagnosticResult["primaryKPI"]
): Finding[] {
  const findings: Finding[] = [];

  // Primary KPI summary
  if (primaryKPI.severity === "healthy") {
    findings.push({
      severity: "healthy",
      stage: primaryKPI.name,
      message: `${primaryKPI.name} is stable at $${primaryKPI.current.toFixed(2)} (${primaryKPI.deltaPercent > 0 ? "+" : ""}${primaryKPI.deltaPercent.toFixed(1)}% WoW).`,
      recommendation: null,
    });
  } else {
    findings.push({
      severity: primaryKPI.severity,
      stage: primaryKPI.name,
      message: `${primaryKPI.name} cost increased to $${primaryKPI.current.toFixed(2)} (${primaryKPI.deltaPercent > 0 ? "+" : ""}${primaryKPI.deltaPercent.toFixed(1)}% WoW).`,
      recommendation: null,
    });
  }

  // Bottleneck finding
  if (bottleneck) {
    findings.push({
      severity: bottleneck.severity,
      stage: bottleneck.stageName,
      message: `Largest volume drop is at the ${bottleneck.stageName} stage: ${bottleneck.deltaPercent.toFixed(1)}% WoW (${bottleneck.previousValue} → ${bottleneck.currentValue}).`,
      recommendation: null,
    });
  }

  // Flag any drop-off rate that worsened significantly
  for (const dropoff of dropoffs) {
    if (dropoff.deltaPercent < -20) {
      findings.push({
        severity: dropoff.deltaPercent < -40 ? "critical" : "warning",
        stage: `${dropoff.fromStage} → ${dropoff.toStage}`,
        message: `Conversion rate from ${dropoff.fromStage} to ${dropoff.toStage} dropped ${dropoff.deltaPercent.toFixed(1)}% (${(dropoff.previousRate * 100).toFixed(2)}% → ${(dropoff.currentRate * 100).toFixed(2)}%).`,
        recommendation: null,
      });
    }
  }

  // Spend change
  const spendStage = stageAnalysis.find((s) => s.metric === "impressions");
  if (spendStage && Math.abs(spendStage.deltaPercent) > 20) {
    findings.push({
      severity: "info",
      stage: "awareness",
      message: `Impression volume shifted ${spendStage.deltaPercent > 0 ? "+" : ""}${spendStage.deltaPercent.toFixed(1)}% WoW. Large volume swings affect all downstream metrics.`,
      recommendation: null,
    });
  }

  return findings;
}
