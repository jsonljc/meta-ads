import { MetaApiClient } from "../core/api/client.js";
import { analyzeFunnel } from "../core/analysis/funnel-walker.js";
import { buildComparisonPeriods } from "../core/analysis/comparator.js";
import { commerceFunnel } from "../verticals/commerce/funnel.js";
import { commerceBenchmarks } from "../verticals/commerce/benchmarks.js";
import { commerceAdvisors } from "../verticals/commerce/diagnostics.js";
import { leadgenFunnel, createLeadgenFunnel } from "../verticals/leadgen/funnel.js";
import { leadgenBenchmarks, createLeadgenBenchmarks } from "../verticals/leadgen/benchmarks.js";
import { leadgenAdvisors } from "../verticals/leadgen/diagnostics.js";
import type {
  DiagnosticResult,
  EntityLevel,
  FunnelSchema,
  Finding,
  Severity,
  VerticalBenchmarks,
  VerticalType,
} from "../core/types.js";
import type { FindingAdvisor } from "../core/analysis/funnel-walker.js";

// ---------------------------------------------------------------------------
// Skill: Funnel Diagnostic
// ---------------------------------------------------------------------------
// Entry point for the agent. Takes an ad account (or campaign/adset) and
// returns a complete funnel diagnostic with actionable findings.
// ---------------------------------------------------------------------------

export interface FunnelDiagnosticInput {
  /** e.g. "act_123456789" */
  entityId: string;
  entityLevel?: EntityLevel;
  accessToken: string;
  /** Defaults to "commerce" */
  vertical?: VerticalType;
  /** Number of days per comparison period (default 7 = WoW) */
  periodDays?: number;
  /** Reference date for "current" period end. Defaults to yesterday. */
  referenceDate?: string;
  /**
   * For leadgen vertical only: the Meta actions[] action_type that represents
   * a qualified lead. This is the event the advertiser sends back via
   * Conversions API when a lead passes their qualification criteria.
   *
   * Common values:
   *   - "offsite_conversion.fb_pixel_lead" (default)
   *   - "offsite_conversion.custom.qualified_lead"
   *   - "offsite_conversion.custom.<your_event_name>"
   *
   * Ignored for non-leadgen verticals.
   */
  qualifiedLeadActionType?: string;
}

export async function runFunnelDiagnostic(
  input: FunnelDiagnosticInput
): Promise<DiagnosticResult> {
  const {
    entityId,
    entityLevel = "account",
    accessToken,
    vertical = "commerce",
    periodDays = 7,
    referenceDate,
    qualifiedLeadActionType,
  } = input;

  // Resolve vertical config
  const { funnel, benchmarks, advisors } = getVerticalConfig(
    vertical,
    qualifiedLeadActionType
  );

  // Build time periods
  const refDate = referenceDate ? new Date(referenceDate) : getYesterday();
  const periods = buildComparisonPeriods(refDate, periodDays);

  // Fetch data
  const client = new MetaApiClient({ accessToken });
  const { current, previous } = await client.fetchComparisonSnapshots(
    entityId,
    entityLevel,
    periods.current,
    periods.previous,
    funnel
  );

  // Analyze
  const result = analyzeFunnel({
    funnel,
    current,
    previous,
    periods,
    benchmarks,
    advisors,
  });

  return result;
}

/**
 * Format a DiagnosticResult into a human-readable string for agent output.
 */
export function formatDiagnostic(result: DiagnosticResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`## Funnel Diagnostic: ${result.entityId}`);
  lines.push(
    `Period: ${result.periods.current.since} to ${result.periods.current.until} vs ${result.periods.previous.since} to ${result.periods.previous.until}`
  );
  lines.push(
    `Spend: $${result.spend.current.toFixed(2)} (prev: $${result.spend.previous.toFixed(2)})`
  );
  lines.push("");

  // Primary KPI
  const kpi = result.primaryKPI;
  const kpiIcon = severityIcon(kpi.severity);
  lines.push(
    `### Primary KPI: ${kpi.name} ${kpiIcon}`
  );
  lines.push(
    `$${kpi.current.toFixed(2)} → was $${kpi.previous.toFixed(2)} (${kpi.deltaPercent > 0 ? "+" : ""}${kpi.deltaPercent.toFixed(1)}% WoW)`
  );
  lines.push("");

  // Funnel overview
  lines.push("### Funnel Stage Volumes (WoW)");
  for (const stage of result.stageAnalysis) {
    const icon = stage.isSignificant ? severityIcon(stage.severity) : "";
    lines.push(
      `- ${stage.stageName}: ${stage.currentValue.toLocaleString()} (${stage.deltaPercent > 0 ? "+" : ""}${stage.deltaPercent.toFixed(1)}%) ${icon}`
    );
  }
  lines.push("");

  // Drop-off rates
  lines.push("### Stage Conversion Rates");
  for (const dropoff of result.dropoffs) {
    const change = dropoff.deltaPercent;
    const flag = change < -20 ? " ⚠" : "";
    lines.push(
      `- ${dropoff.fromStage} → ${dropoff.toStage}: ${(dropoff.currentRate * 100).toFixed(2)}% (was ${(dropoff.previousRate * 100).toFixed(2)}%)${flag}`
    );
  }
  lines.push("");

  // Bottleneck
  if (result.bottleneck) {
    lines.push(
      `### Bottleneck: ${result.bottleneck.stageName} (${result.bottleneck.deltaPercent.toFixed(1)}% drop)`
    );
    lines.push("");
  }

  // Findings
  if (result.findings.length > 0) {
    lines.push("### Findings");
    for (const finding of result.findings) {
      const icon = severityIcon(finding.severity);
      lines.push(`${icon} **[${finding.stage}]** ${finding.message}`);
      if (finding.recommendation) {
        lines.push(`  → ${finding.recommendation}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getVerticalConfig(
  vertical: VerticalType,
  qualifiedLeadActionType?: string
): {
  funnel: FunnelSchema;
  benchmarks: VerticalBenchmarks;
  advisors: FindingAdvisor[];
} {
  switch (vertical) {
    case "commerce":
      return {
        funnel: commerceFunnel,
        benchmarks: commerceBenchmarks,
        advisors: commerceAdvisors,
      };
    case "leadgen":
      // Use custom action type if provided, otherwise use defaults
      if (qualifiedLeadActionType) {
        return {
          funnel: createLeadgenFunnel(qualifiedLeadActionType),
          benchmarks: createLeadgenBenchmarks(qualifiedLeadActionType),
          advisors: leadgenAdvisors,
        };
      }
      return {
        funnel: leadgenFunnel,
        benchmarks: leadgenBenchmarks,
        advisors: leadgenAdvisors,
      };
    case "brand":
      throw new Error(
        `Vertical "brand" is not yet implemented. Currently supported: commerce, leadgen.`
      );
  }
}

function getYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function severityIcon(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "[CRITICAL]";
    case "warning":
      return "[WARNING]";
    case "info":
      return "[INFO]";
    case "healthy":
      return "[OK]";
  }
}
