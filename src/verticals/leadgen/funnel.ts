import type { FunnelSchema } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Lead Generation Funnel Schema
// ---------------------------------------------------------------------------
// Primary path: Meta Instant Forms (on-platform lead capture)
//
// Impression → Click (form open) → Lead (form submit) → Qualified Lead
//
// The "qualified_lead" stage uses an offline/CAPI event that advertisers
// send back when a lead passes their qualification criteria. The action_type
// for this event varies by advertiser setup:
//
//   - "offsite_conversion.fb_pixel_lead"  (default — website pixel lead via CAPI)
//   - "offsite_conversion.custom.qualified_lead"  (custom conversion event)
//   - "offsite_conversion.custom.<anything>"  (advertiser-specific naming)
//
// Use createLeadgenFunnel() to configure the qualified lead action type.
//
// Future extensions: website form leads, Messenger/WhatsApp/IG Direct
// chat-based leads would be additional funnel schemas under this vertical.
// ---------------------------------------------------------------------------

export const DEFAULT_QUALIFIED_LEAD_ACTION = "offsite_conversion.fb_pixel_lead";

/**
 * Create a leadgen funnel schema with a configurable qualified lead action type.
 *
 * @param qualifiedLeadAction - The Meta actions[] action_type for qualified leads.
 *   This is the event the advertiser sends back via Conversions API when a lead
 *   passes their qualification criteria. Defaults to "offsite_conversion.fb_pixel_lead".
 */
export function createLeadgenFunnel(
  qualifiedLeadAction: string = DEFAULT_QUALIFIED_LEAD_ACTION
): FunnelSchema {
  return {
    vertical: "leadgen",
    stages: [
      {
        name: "awareness",
        metric: "impressions",
        metricSource: "top_level",
        costMetric: "cpm",
        costMetricSource: "top_level",
      },
      {
        name: "click",
        metric: "inline_link_clicks",
        metricSource: "top_level",
        costMetric: "cpc",
        costMetricSource: "top_level",
      },
      {
        name: "lead",
        metric: "lead",
        metricSource: "actions",
        costMetric: "lead",
        costMetricSource: "cost_per_action_type",
      },
      {
        name: "qualified_lead",
        metric: qualifiedLeadAction,
        metricSource: "actions",
        costMetric: qualifiedLeadAction,
        costMetricSource: "cost_per_action_type",
      },
    ],
    primaryKPI: "lead",
    roasMetric: null,
  };
}

/** Default leadgen funnel (qualified lead = offsite_conversion.fb_pixel_lead) */
export const leadgenFunnel: FunnelSchema = createLeadgenFunnel();
