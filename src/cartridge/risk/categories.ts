// ---------------------------------------------------------------------------
// Risk Categories
// ---------------------------------------------------------------------------
// Computes RiskInput for each action type. Since the entire engine is
// read-only, risk is inherently low/none for all actions.
// ---------------------------------------------------------------------------

import type { ActionType, RiskInput } from "../types.js";

export function computeRiskInput(
  actionType: ActionType,
  parameters: Record<string, unknown>
): RiskInput {
  switch (actionType) {
    case "media-diagnostics.platform.connect":
      return {
        baseRisk: "none",
        exposure: {
          dollarsAtRisk: 0,
          blastRadius: "single",
        },
        reversibility: "full",
        sensitivity: {
          entityVolatile: false,
          learningPhase: false,
          recentlyModified: false,
        },
      };

    case "media-diagnostics.funnel.diagnose":
      return {
        baseRisk: "low",
        exposure: {
          dollarsAtRisk: 0,
          blastRadius: "single",
        },
        reversibility: "full",
        sensitivity: {
          entityVolatile: false,
          learningPhase: false,
          recentlyModified: false,
        },
      };

    case "media-diagnostics.portfolio.diagnose": {
      const platforms = parameters.platforms;
      const platformCount = Array.isArray(platforms) ? platforms.length : 0;
      return {
        baseRisk: "low",
        exposure: {
          dollarsAtRisk: 0,
          blastRadius: platformCount >= 3 ? "multi-account" : "single",
        },
        reversibility: "full",
        sensitivity: {
          entityVolatile: false,
          learningPhase: false,
          recentlyModified: false,
        },
      };
    }

    case "media-diagnostics.snapshot.fetch":
      return {
        baseRisk: "low",
        exposure: {
          dollarsAtRisk: 0,
          blastRadius: "single",
        },
        reversibility: "full",
        sensitivity: {
          entityVolatile: false,
          learningPhase: false,
          recentlyModified: false,
        },
      };

    case "media-diagnostics.structure.analyze":
      return {
        baseRisk: "low",
        exposure: {
          dollarsAtRisk: 0,
          blastRadius: "single",
        },
        reversibility: "full",
        sensitivity: {
          entityVolatile: false,
          learningPhase: false,
          recentlyModified: false,
        },
      };

    case "media-diagnostics.health.check":
      return {
        baseRisk: "none",
        exposure: {
          dollarsAtRisk: 0,
          blastRadius: "single",
        },
        reversibility: "full",
        sensitivity: {
          entityVolatile: false,
          learningPhase: false,
          recentlyModified: false,
        },
      };
  }
}
