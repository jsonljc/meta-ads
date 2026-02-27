// ---------------------------------------------------------------------------
// Default Policies
// ---------------------------------------------------------------------------
// The read-only-analytics policy allows all media-diagnostics actions since
// none of them modify campaigns, budgets, or bids.
// ---------------------------------------------------------------------------

import type { PolicyConfig } from "../types.js";

export const READ_ONLY_ANALYTICS_POLICY: PolicyConfig = {
  id: "read-only-analytics",
  name: "Read-Only Analytics",
  description:
    "Allows all read-only diagnostic actions. No campaign modifications permitted.",
  allowedActions: [
    "media-diagnostics.platform.connect",
    "media-diagnostics.funnel.diagnose",
    "media-diagnostics.portfolio.diagnose",
    "media-diagnostics.snapshot.fetch",
    "media-diagnostics.structure.analyze",
    "media-diagnostics.health.check",
  ],
  deniedActions: [],
  maxRiskLevel: "low",
};
