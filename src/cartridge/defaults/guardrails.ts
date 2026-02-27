// ---------------------------------------------------------------------------
// Default Guardrails
// ---------------------------------------------------------------------------
// Rate limits, cooldowns, and protected entities for the media-diagnostics
// cartridge. Since all actions are read-only, the main concern is API
// rate-limit exhaustion.
// ---------------------------------------------------------------------------

import type { GuardrailConfig } from "../types.js";

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  rateLimits: {
    meta: {
      maxRequests: 4,
      windowSeconds: 1,
      scope: "platform",
    },
    google: {
      maxRequests: 10,
      windowSeconds: 1,
      scope: "platform",
    },
    tiktok: {
      maxRequests: 10,
      windowSeconds: 1,
      scope: "platform",
    },
    global: {
      maxRequests: 30,
      windowSeconds: 60,
      scope: "global",
    },
  },
  cooldowns: [
    {
      actionType: "media-diagnostics.funnel.diagnose",
      durationSeconds: 30,
      keyScope: "entityId",
    },
    {
      actionType: "media-diagnostics.structure.analyze",
      durationSeconds: 30,
      keyScope: "entityId",
    },
  ],
  protectedEntities: [],
};

/** Default cooldown in milliseconds for funnel.diagnose per entityId */
export const DIAGNOSE_COOLDOWN_MS = 30_000;
