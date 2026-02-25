import type {
  StageDiagnostic,
  FunnelDropoff,
  MetricSnapshot,
  Finding,
} from "../../core/types.js";
import type { FindingAdvisor } from "../../core/analysis/funnel-walker.js";
import { percentChange } from "../../core/analysis/significance.js";

// ---------------------------------------------------------------------------
// Lead Generation Diagnostic Advisors
// ---------------------------------------------------------------------------
// Focused on the core leadgen tension: volume vs. quality.
// Instant forms are easy to submit (pre-filled fields, no page load),
// which means high volume but often low quality. The advisors here
// detect when quantity and quality are diverging.
// ---------------------------------------------------------------------------

/**
 * Lead quality degradation detector.
 * The signature pattern: lead volume goes UP (or holds) while qualified
 * lead volume goes DOWN. This means the form is capturing junk.
 *
 * This is the single most important leadgen diagnostic — it catches
 * the classic instant form problem where CPL looks great but the
 * leads are worthless.
 */
export const leadQualityAdvisor: FindingAdvisor = (
  stageAnalysis,
  dropoffs,
  current,
  previous
) => {
  const findings: Finding[] = [];

  const leadStage = stageAnalysis.find((s) => s.stageName === "lead");
  const qualifiedStage = stageAnalysis.find(
    (s) => s.stageName === "qualified_lead"
  );

  if (!leadStage || !qualifiedStage) return findings;

  // Can't assess quality if there's no qualified lead data
  if (qualifiedStage.currentValue === 0 && qualifiedStage.previousValue === 0) {
    return findings;
  }

  const leadDelta = leadStage.deltaPercent;
  const qualifiedDelta = qualifiedStage.deltaPercent;

  // Quality ratio: qualified / total leads
  const currentQualRate =
    leadStage.currentValue > 0
      ? qualifiedStage.currentValue / leadStage.currentValue
      : 0;
  const previousQualRate =
    leadStage.previousValue > 0
      ? qualifiedStage.previousValue / leadStage.previousValue
      : 0;
  const qualRateChange = percentChange(currentQualRate, previousQualRate);

  // Pattern 1: Volume up + quality down = junk leads
  if (leadDelta > 5 && qualifiedDelta < -15) {
    findings.push({
      severity: qualifiedDelta < -30 ? "critical" : "warning",
      stage: "lead → qualified_lead",
      message: `Lead volume increased ${leadDelta.toFixed(1)}% but qualified leads dropped ${qualifiedDelta.toFixed(1)}%. Quality rate fell from ${(previousQualRate * 100).toFixed(1)}% to ${(currentQualRate * 100).toFixed(1)}%. The form is generating unqualified leads.`,
      recommendation:
        "Switch instant forms from 'More Volume' to 'Higher Intent' optimization (adds a review screen before submit). Add qualifying questions to the form to filter out low-intent users. Consider conditional logic to disqualify early. If using Advantage+ audience, try narrowing with original audience controls.",
    });
  }

  // Pattern 2: Both volume and quality are dropping — different problem
  if (leadDelta < -15 && qualifiedDelta < -15 && qualRateChange > -10) {
    findings.push({
      severity: "warning",
      stage: "lead",
      message: `Both total leads (${leadDelta.toFixed(1)}%) and qualified leads (${qualifiedDelta.toFixed(1)}%) dropped while quality rate held (${qualRateChange.toFixed(1)}%). This is a volume/delivery issue, not a quality issue.`,
      recommendation:
        "The lead funnel is intact but getting less traffic. Check if budget was reduced, audience is exhausted, or CPMs increased. This is distinct from a quality problem.",
    });
  }

  // Pattern 3: Quality rate is chronically low (absolute check)
  if (currentQualRate < 0.08 && qualifiedStage.currentValue > 0) {
    findings.push({
      severity: "warning",
      stage: "qualified_lead",
      message: `Only ${(currentQualRate * 100).toFixed(1)}% of leads are qualifying. For instant forms, a healthy range is 15-40% with higher-intent optimization.`,
      recommendation:
        "This low qualification rate suggests the form is too easy to submit or is attracting the wrong audience. Consider: (1) switching to Higher Intent form type, (2) adding a custom question that requires effort to answer, (3) removing pre-filled fields that let users submit without thinking, (4) reviewing audience targeting for relevance.",
    });
  }

  return findings;
};

/**
 * Form conversion rate advisor.
 * Monitors click-to-lead rate. For instant forms this is typically high
 * (10-30%) since the form is on-platform and pre-filled. A drop here
 * means form friction or audience mismatch.
 */
export const formConversionAdvisor: FindingAdvisor = (
  _stageAnalysis,
  dropoffs,
  _current,
  _previous
) => {
  const findings: Finding[] = [];
  const clickToLead = dropoffs.find(
    (d) => d.fromStage === "click" && d.toStage === "lead"
  );

  if (!clickToLead) return findings;

  if (clickToLead.deltaPercent < -20) {
    findings.push({
      severity: clickToLead.deltaPercent < -40 ? "critical" : "warning",
      stage: "click → lead",
      message: `Click-to-lead conversion rate dropped ${clickToLead.deltaPercent.toFixed(1)}% (${(clickToLead.previousRate * 100).toFixed(1)}% → ${(clickToLead.currentRate * 100).toFixed(1)}%). Users are opening the form but not completing it.`,
      recommendation:
        "Check if the form was recently modified (added questions, changed fields). For instant forms, keep it to 3-5 fields max. Verify the form preview/context card matches what the ad promises. If using custom questions, check if any are confusing or causing drop-off.",
    });
  }

  // Absolute check — instant forms should have high conversion rates
  if (clickToLead.currentRate < 0.08 && clickToLead.currentRate > 0) {
    findings.push({
      severity: "info",
      stage: "click → lead",
      message: `Click-to-lead rate is ${(clickToLead.currentRate * 100).toFixed(1)}%, which is below the typical 10-30% range for instant forms.`,
      recommendation:
        "Instant forms should convert well due to pre-filled fields and on-platform experience. A low rate suggests too many form fields, confusing custom questions, or a mismatch between the ad promise and the form content.",
    });
  }

  return findings;
};

/**
 * Creative fatigue advisor (adapted for leadgen).
 * Same pattern as commerce — CTR drops while CPMs hold — but the
 * recommendation is leadgen-specific.
 */
export const creativeFatigueAdvisor: FindingAdvisor = (
  _stageAnalysis,
  _dropoffs,
  current,
  previous
) => {
  const findings: Finding[] = [];
  const currentCTR = current.topLevel.ctr ?? 0;
  const previousCTR = previous.topLevel.ctr ?? 0;
  const currentCPM = current.topLevel.cpm ?? 0;
  const previousCPM = previous.topLevel.cpm ?? 0;

  if (previousCTR === 0) return findings;

  const ctrChange = percentChange(currentCTR, previousCTR);
  const cpmChange = previousCPM > 0 ? percentChange(currentCPM, previousCPM) : 0;

  if (ctrChange < -15 && cpmChange >= -5) {
    findings.push({
      severity: ctrChange < -30 ? "critical" : "warning",
      stage: "click",
      message: `CTR dropped ${ctrChange.toFixed(1)}% while CPMs held (${cpmChange > 0 ? "+" : ""}${cpmChange.toFixed(1)}%). Creative is fatiguing — the audience is seeing the ads but not engaging.`,
      recommendation:
        "Refresh creative with new angles. For leadgen, test different value propositions in the hook (free consultation, downloadable resource, limited spots). Lead magnets fatigue faster than product ads because the perceived value diminishes after repeated exposure.",
    });
  }

  return findings;
};

/**
 * Auction competition advisor (adapted for leadgen).
 * Rising CPMs inflate CPL mechanically even if form conversion holds.
 */
export const auctionAdvisor: FindingAdvisor = (
  _stageAnalysis,
  _dropoffs,
  current,
  previous
) => {
  const findings: Finding[] = [];
  const currentCPM = current.topLevel.cpm ?? 0;
  const previousCPM = previous.topLevel.cpm ?? 0;

  if (previousCPM === 0) return findings;

  const cpmChange = percentChange(currentCPM, previousCPM);

  if (cpmChange > 25) {
    findings.push({
      severity: cpmChange > 50 ? "critical" : "warning",
      stage: "awareness",
      message: `CPMs increased ${cpmChange.toFixed(1)}% ($${previousCPM.toFixed(2)} → $${currentCPM.toFixed(2)}). This inflates CPL even if form conversion rates hold steady.`,
      recommendation:
        "Leadgen audiences (especially B2B) tend to be narrow, making them sensitive to auction pressure. Consider broadening your audience, testing Advantage+ audience, or shifting budget to lower-competition placements (Reels, Stories). Check if the spike coincides with seasonal advertiser surges.",
    });
  }

  return findings;
};

/**
 * Cost-per-qualified-lead advisor.
 * CPL can look fine while cost-per-QUALIFIED-lead is spiking.
 * This is the metric that actually matters for the business.
 */
export const qualifiedCostAdvisor: FindingAdvisor = (
  stageAnalysis,
  _dropoffs,
  current,
  previous
) => {
  const findings: Finding[] = [];

  const qualifiedStage = stageAnalysis.find(
    (s) => s.stageName === "qualified_lead"
  );
  if (!qualifiedStage) return findings;

  const currentCPQL =
    qualifiedStage.currentValue > 0
      ? current.spend / qualifiedStage.currentValue
      : 0;
  const previousCPQL =
    qualifiedStage.previousValue > 0
      ? previous.spend / qualifiedStage.previousValue
      : 0;

  if (currentCPQL === 0 || previousCPQL === 0) return findings;

  const cpqlChange = percentChange(currentCPQL, previousCPQL);

  // Also check how CPL moved for comparison
  const leadStage = stageAnalysis.find((s) => s.stageName === "lead");
  const currentCPL =
    leadStage && leadStage.currentValue > 0
      ? current.spend / leadStage.currentValue
      : 0;
  const previousCPL =
    leadStage && leadStage.previousValue > 0
      ? previous.spend / leadStage.previousValue
      : 0;
  const cplChange = previousCPL > 0 ? percentChange(currentCPL, previousCPL) : 0;

  // Flag when CPQL is rising significantly faster than CPL
  // This means quality is degrading even if volume metrics look fine
  if (cpqlChange > 20 && cpqlChange > cplChange + 15) {
    findings.push({
      severity: cpqlChange > 50 ? "critical" : "warning",
      stage: "qualified_lead",
      message: `Cost per qualified lead increased ${cpqlChange.toFixed(1)}% ($${previousCPQL.toFixed(2)} → $${currentCPQL.toFixed(2)}) while CPL only moved ${cplChange.toFixed(1)}%. The gap means you're paying for volume but not getting quality.`,
      recommendation:
        "This is the clearest signal that lead quality has degraded. Consider switching your campaign optimization to 'Conversion Leads' (optimize for qualified events via CAPI) instead of optimizing for lead volume. This tells Meta's algorithm to find people who actually convert downstream, not just people who fill out forms.",
    });
  }

  return findings;
};

/** All leadgen advisors bundled */
export const leadgenAdvisors: FindingAdvisor[] = [
  leadQualityAdvisor,
  formConversionAdvisor,
  creativeFatigueAdvisor,
  auctionAdvisor,
  qualifiedCostAdvisor,
];
