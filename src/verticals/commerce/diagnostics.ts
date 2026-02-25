import type {
  StageDiagnostic,
  FunnelDropoff,
  MetricSnapshot,
  Finding,
} from "../../core/types.js";
import type { FindingAdvisor } from "../../core/analysis/funnel-walker.js";

// ---------------------------------------------------------------------------
// Commerce-Specific Diagnostic Advisors
// ---------------------------------------------------------------------------
// These generate actionable, commerce-specific findings on top of the
// generic funnel analysis. Each advisor focuses on one diagnostic pattern.
// ---------------------------------------------------------------------------

/**
 * Creative fatigue detection.
 * When CTR drops significantly but CPM is stable or increasing,
 * the audience is seeing the ads but not engaging — creative is stale.
 */
export const creativeFatigueAdvisor: FindingAdvisor = (
  stageAnalysis,
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

  const ctrChange = ((currentCTR - previousCTR) / previousCTR) * 100;
  const cpmChange =
    previousCPM > 0 ? ((currentCPM - previousCPM) / previousCPM) * 100 : 0;

  // CTR dropped > 15% while CPM didn't decrease
  if (ctrChange < -15 && cpmChange >= -5) {
    findings.push({
      severity: ctrChange < -30 ? "critical" : "warning",
      stage: "click",
      message: `CTR dropped ${ctrChange.toFixed(1)}% while CPMs held steady (${cpmChange > 0 ? "+" : ""}${cpmChange.toFixed(1)}%). This pattern indicates creative fatigue — the audience is being reached but not engaging.`,
      recommendation:
        "Introduce new creative variations. Test different hooks in the first 3 seconds of video, or swap primary images. Avoid changing targeting at the same time so you can isolate the variable.",
    });
  }

  return findings;
};

/**
 * Landing page drop-off detection.
 * When click→LPV conversion rate drops, the page isn't loading fast enough
 * or there's a redirect/tracking issue.
 */
export const landingPageAdvisor: FindingAdvisor = (
  _stageAnalysis,
  dropoffs,
  _current,
  _previous
) => {
  const findings: Finding[] = [];
  const clickToLPV = dropoffs.find(
    (d) => d.fromStage === "click" && d.toStage === "landing_page"
  );

  if (clickToLPV && clickToLPV.deltaPercent < -15) {
    findings.push({
      severity: clickToLPV.deltaPercent < -30 ? "critical" : "warning",
      stage: "click → landing_page",
      message: `Click-to-landing-page rate dropped ${clickToLPV.deltaPercent.toFixed(1)}% (${(clickToLPV.previousRate * 100).toFixed(1)}% → ${(clickToLPV.currentRate * 100).toFixed(1)}%). Visitors are clicking but not reaching the page.`,
      recommendation:
        "Check mobile page load speed (target < 3s). Verify no broken redirects were introduced. Check if a new cookie consent banner is blocking page load. Review server response times.",
    });
  }

  // Absolute check — if less than 60% of clicks become LPVs, flag it regardless of WoW
  if (clickToLPV && clickToLPV.currentRate < 0.6 && clickToLPV.currentRate > 0) {
    findings.push({
      severity: "warning",
      stage: "click → landing_page",
      message: `Only ${(clickToLPV.currentRate * 100).toFixed(1)}% of clicks are resulting in landing page views. Industry baseline is 70-90%.`,
      recommendation:
        "This suggests significant page load issues or redirect chain problems. Test the landing page URL directly on mobile with throttled connection speeds.",
    });
  }

  return findings;
};

/**
 * Product page engagement detection.
 * When view_content→ATC drops, the product page isn't converting browsers
 * into shoppers.
 */
export const productPageAdvisor: FindingAdvisor = (
  _stageAnalysis,
  dropoffs,
  _current,
  _previous
) => {
  const findings: Finding[] = [];
  const vcToATC = dropoffs.find(
    (d) => d.fromStage === "view_content" && d.toStage === "add_to_cart"
  );

  if (vcToATC && vcToATC.deltaPercent < -20) {
    findings.push({
      severity: vcToATC.deltaPercent < -40 ? "critical" : "warning",
      stage: "view_content → add_to_cart",
      message: `View-content-to-ATC rate dropped ${vcToATC.deltaPercent.toFixed(1)}% (${(vcToATC.previousRate * 100).toFixed(2)}% → ${(vcToATC.currentRate * 100).toFixed(2)}%). Visitors are viewing products but not adding to cart.`,
      recommendation:
        "Check if pricing, shipping costs, or stock availability changed. Review if product page layout was modified. Consider adding urgency elements (limited stock, time-limited offers) or social proof (reviews, purchase counts).",
    });
  }

  return findings;
};

/**
 * Checkout friction detection.
 * When ATC→Purchase drops, there's friction at checkout.
 */
export const checkoutAdvisor: FindingAdvisor = (
  _stageAnalysis,
  dropoffs,
  current,
  _previous
) => {
  const findings: Finding[] = [];
  const atcToPurchase = dropoffs.find(
    (d) => d.fromStage === "add_to_cart" && d.toStage === "purchase"
  );

  if (atcToPurchase && atcToPurchase.deltaPercent < -20) {
    findings.push({
      severity: atcToPurchase.deltaPercent < -35 ? "critical" : "warning",
      stage: "add_to_cart → purchase",
      message: `ATC-to-purchase rate dropped ${atcToPurchase.deltaPercent.toFixed(1)}% (${(atcToPurchase.previousRate * 100).toFixed(1)}% → ${(atcToPurchase.currentRate * 100).toFixed(1)}%). Shoppers are adding to cart but abandoning at checkout.`,
      recommendation:
        "Verify the purchase pixel event is firing correctly. Check if a payment gateway issue occurred. Review if shipping costs or delivery times changed. Look at checkout page for new friction (mandatory account creation, extra form fields).",
    });
  }

  // Absolute check — if ATC→Purchase rate is below 15%, flag it
  if (atcToPurchase && atcToPurchase.currentRate < 0.15 && atcToPurchase.currentRate > 0) {
    findings.push({
      severity: "info",
      stage: "add_to_cart → purchase",
      message: `Only ${(atcToPurchase.currentRate * 100).toFixed(1)}% of add-to-carts are converting to purchases. This is below the typical 20-50% range.`,
      recommendation:
        "Consider cart abandonment email/SMS sequences, simplifying checkout to fewer steps, or offering guest checkout if not already available.",
    });
  }

  return findings;
};

/**
 * Auction competition detection.
 * When CPM rises significantly, it's an auction-level issue —
 * more advertisers competing for the same audience.
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

  const cpmChange = ((currentCPM - previousCPM) / previousCPM) * 100;

  if (cpmChange > 25) {
    findings.push({
      severity: cpmChange > 50 ? "critical" : "warning",
      stage: "awareness",
      message: `CPMs increased ${cpmChange.toFixed(1)}% ($${previousCPM.toFixed(2)} → $${currentCPM.toFixed(2)}). This inflates costs at every downstream stage even if conversion rates hold.`,
      recommendation:
        "Check if this coincides with a seasonal competition spike (BFCM, Q4, etc). Consider broadening audience targeting to access cheaper inventory. Test Advantage+ audience expansion. If using interest-based targeting, the audience may be oversaturated.",
    });
  }

  return findings;
};

/** All commerce advisors bundled for convenience */
export const commerceAdvisors: FindingAdvisor[] = [
  creativeFatigueAdvisor,
  landingPageAdvisor,
  productPageAdvisor,
  checkoutAdvisor,
  auctionAdvisor,
];
