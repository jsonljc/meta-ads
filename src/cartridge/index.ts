// ---------------------------------------------------------------------------
// MediaDiagnosticsCartridge — implements Cartridge
// ---------------------------------------------------------------------------
// The main cartridge class that routes actions to handlers, manages session
// state, and provides risk/guardrail information.
// ---------------------------------------------------------------------------

import type {
  ActionType,
  Cartridge,
  CartridgeContext,
  CartridgeManifest,
  CapturedSnapshot,
  ExecuteResult,
  GuardrailConfig,
  HealthCheckResult,
  RiskInput,
  SessionState,
  ConnectParams,
  DiagnoseFunnelParams,
  DiagnosePortfolioParams,
  FetchSnapshotParams,
  AnalyzeStructureParams,
  HealthCheckParams,
} from "./types.js";
import type { PlatformType, PlatformCredentials } from "../platforms/types.js";
import type { VerticalType } from "../core/types.js";
import type { AdPlatformProvider } from "./providers/provider.js";
import { MEDIA_DIAGNOSTICS_MANIFEST } from "./manifest.js";
import { DEFAULT_GUARDRAILS, DIAGNOSE_COOLDOWN_MS } from "./defaults/guardrails.js";
import { computeRiskInput } from "./risk/categories.js";
import { createSessionState, isInCooldown } from "./context/session.js";
import { resolveFunnel, resolveBenchmarks } from "../platforms/registry.js";

// Action handlers
import { executeConnect } from "./actions/connect.js";
import { executeDiagnoseFunnel } from "./actions/diagnose-funnel.js";
import { executeDiagnosePortfolio } from "./actions/diagnose-portfolio.js";
import { executeFetchSnapshot } from "./actions/fetch-snapshot.js";
import { executeAnalyzeStructure } from "./actions/analyze-structure.js";
import { executeHealthCheck } from "./actions/health-check.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PLATFORMS = new Set<string>(["meta", "google", "tiktok"]);
const VALID_VERTICALS = new Set<string>(["commerce", "leadgen", "brand"]);

function isPlatformType(v: unknown): v is PlatformType {
  return typeof v === "string" && VALID_PLATFORMS.has(v);
}

function isVerticalType(v: unknown): v is VerticalType {
  return typeof v === "string" && VALID_VERTICALS.has(v);
}

function failResult(summary: string, step: string, error: string): ExecuteResult {
  return {
    success: false,
    summary,
    externalRefs: {},
    rollbackAvailable: false,
    partialFailures: [{ step, error }],
    durationMs: 0,
    undoRecipe: null,
  };
}

// ---------------------------------------------------------------------------
// Cartridge
// ---------------------------------------------------------------------------

export class MediaDiagnosticsCartridge implements Cartridge {
  readonly manifest: CartridgeManifest = MEDIA_DIAGNOSTICS_MANIFEST;

  private providers = new Map<PlatformType, AdPlatformProvider>();
  private session: SessionState = createSessionState();
  private snapshots: CapturedSnapshot[] = [];

  /** Register a provider for a platform */
  registerProvider(provider: AdPlatformProvider): void {
    this.providers.set(provider.platform, provider);
  }

  async initialize(context: CartridgeContext): Promise<void> {
    this.session = createSessionState();
    this.snapshots = [];

    // Auto-connect any pre-configured credentials
    if (context.credentials) {
      for (const [platformStr, creds] of Object.entries(context.credentials)) {
        if (!isPlatformType(platformStr)) continue;
        const provider = this.providers.get(platformStr);
        if (provider && creds) {
          this.session.connections.set(platformStr, {
            platform: platformStr,
            credentials: creds,
            status: "connected",
            connectedAt: Date.now(),
          });
        }
      }
    }
  }

  async enrichContext(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): Promise<CartridgeContext> {
    const enriched = { ...context };

    switch (actionType) {
      case "media-diagnostics.funnel.diagnose": {
        const platform = parameters.platform;
        const vertical = parameters.vertical;
        if (isPlatformType(platform) && isVerticalType(vertical)) {
          try {
            enriched.resolvedFunnel = resolveFunnel(platform, vertical);
            enriched.resolvedBenchmarks = resolveBenchmarks(platform, vertical);
          } catch {
            // Will fail during execution with a better error
          }
        }
        break;
      }

      case "media-diagnostics.portfolio.diagnose": {
        // Portfolio has an array of platforms, not a single platform
        const platforms = parameters.platforms;
        if (Array.isArray(platforms)) {
          const resolved: Array<{ platform: string; funnel: unknown; benchmarks: unknown }> = [];
          for (const p of platforms) {
            if (isPlatformType(p?.platform) && isVerticalType(parameters.vertical)) {
              try {
                resolved.push({
                  platform: p.platform,
                  funnel: resolveFunnel(p.platform, parameters.vertical as VerticalType),
                  benchmarks: resolveBenchmarks(p.platform, parameters.vertical as VerticalType),
                });
              } catch {
                // Individual platform resolution failure — will fail during execution
              }
            }
          }
          enriched.resolvedPlatforms = resolved;
        }
        break;
      }

      case "media-diagnostics.snapshot.fetch": {
        const timeRange = parameters.timeRange as
          | { since?: string; until?: string }
          | undefined;
        if (timeRange) {
          if (!timeRange.since || !timeRange.until) {
            enriched.validationError =
              "timeRange requires both 'since' and 'until' dates";
          } else {
            const since = new Date(timeRange.since);
            const until = new Date(timeRange.until);
            if (since > until) {
              enriched.validationError =
                "timeRange.since must be before timeRange.until";
            }
            enriched.periodDays =
              Math.ceil(
                (until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24)
              ) + 1;
          }
        }
        break;
      }

      case "media-diagnostics.platform.connect": {
        const creds = parameters.credentials as PlatformCredentials | undefined;
        if (creds && isPlatformType(parameters.platform)) {
          if (creds.platform !== parameters.platform) {
            enriched.validationError = `Credential platform "${creds.platform}" doesn't match requested platform "${parameters.platform}"`;
          }
        }
        break;
      }

      case "media-diagnostics.structure.analyze":
      case "media-diagnostics.health.check":
        break;
    }

    return enriched;
  }

  async execute(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): Promise<ExecuteResult> {
    // Run enrichContext to perform validation
    const enriched = await this.enrichContext(actionType, parameters, context);

    // Check for validation errors from enrichContext
    if (typeof enriched.validationError === "string") {
      return failResult(
        `Validation failed: ${enriched.validationError}`,
        "validation",
        enriched.validationError
      );
    }

    // Enforce cooldowns for diagnostic actions
    const entityId = parameters.entityId as string | undefined;
    if (
      entityId &&
      (actionType === "media-diagnostics.funnel.diagnose" ||
        actionType === "media-diagnostics.structure.analyze") &&
      isInCooldown(this.session, entityId, DIAGNOSE_COOLDOWN_MS)
    ) {
      return failResult(
        `Entity ${entityId} is in cooldown. Wait before re-diagnosing.`,
        "cooldown",
        `Cooldown active for ${entityId} (${DIAGNOSE_COOLDOWN_MS / 1000}s)`
      );
    }

    const result = await this.dispatchAction(actionType, parameters, enriched);

    // Auto-capture snapshot on successful diagnostic actions
    if (
      result.success &&
      (actionType === "media-diagnostics.funnel.diagnose" ||
        actionType === "media-diagnostics.portfolio.diagnose" ||
        actionType === "media-diagnostics.snapshot.fetch")
    ) {
      this.snapshots.push(this.captureSnapshot(actionType, parameters, result));
    }

    return result;
  }

  private async dispatchAction(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): Promise<ExecuteResult> {
    switch (actionType) {
      case "media-diagnostics.platform.connect": {
        const params = parameters as unknown as ConnectParams;
        const provider = this.resolveProvider(params.platform);
        if (!provider) return this.noProviderResult(params.platform);
        return executeConnect(params, provider, this.session);
      }

      case "media-diagnostics.funnel.diagnose": {
        const params = parameters as unknown as DiagnoseFunnelParams;
        const provider = this.resolveProvider(params.platform);
        if (!provider) return this.noProviderResult(params.platform);
        const creds = this.resolveCredentials(params.platform, context);
        return executeDiagnoseFunnel(params, provider, this.session, creds);
      }

      case "media-diagnostics.portfolio.diagnose": {
        const params = parameters as unknown as DiagnosePortfolioParams;
        return executeDiagnosePortfolio(params, this.providers, this.session);
      }

      case "media-diagnostics.snapshot.fetch": {
        const params = parameters as unknown as FetchSnapshotParams;
        const provider = this.resolveProvider(params.platform);
        if (!provider) return this.noProviderResult(params.platform);
        const creds = this.resolveCredentials(params.platform, context);
        return executeFetchSnapshot(params, provider, this.session, creds);
      }

      case "media-diagnostics.structure.analyze": {
        const params = parameters as unknown as AnalyzeStructureParams;
        const provider = this.resolveProvider(params.platform);
        if (!provider) return this.noProviderResult(params.platform);
        const creds = this.resolveCredentials(params.platform, context);
        return executeAnalyzeStructure(params, provider, this.session, creds);
      }

      case "media-diagnostics.health.check": {
        const params = parameters as unknown as HealthCheckParams;
        return executeHealthCheck(params, this.providers);
      }

      default: {
        const _exhaustive: never = actionType;
        return failResult(
          `Unknown action type: ${_exhaustive}`,
          "dispatch",
          `Unknown action type`
        );
      }
    }
  }

  getRiskInput(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    _context: CartridgeContext
  ): RiskInput {
    return computeRiskInput(actionType, parameters);
  }

  getGuardrails(): GuardrailConfig {
    return DEFAULT_GUARDRAILS;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const platforms = Array.from(this.session.connections.entries()).map(
      ([platform, conn]) => ({
        platform,
        credentials: conn.credentials,
        entityId: conn.accountName ?? "",
      })
    );

    if (platforms.length === 0) {
      return {
        overall: "disconnected",
        platforms: [],
        capabilities: [],
      };
    }

    const result = await executeHealthCheck({ platforms }, this.providers);
    return (result.data as HealthCheckResult | undefined) ?? {
      overall: "disconnected",
      platforms: [],
      capabilities: [],
    };
  }

  captureSnapshot(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    result: ExecuteResult
  ): CapturedSnapshot {
    return {
      actionType,
      timestamp: Date.now(),
      parameters,
      data: result.data,
    };
  }

  /** Get all captured snapshots */
  getCapturedSnapshots(): readonly CapturedSnapshot[] {
    return this.snapshots;
  }

  /** Expose session for testing */
  getSession(): SessionState {
    return this.session;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private resolveProvider(platform: PlatformType): AdPlatformProvider | undefined {
    return this.providers.get(platform);
  }

  private resolveCredentials(
    platform: PlatformType,
    context: CartridgeContext
  ): PlatformCredentials | undefined {
    return (
      context.credentials?.[platform] ??
      this.session.connections.get(platform)?.credentials
    );
  }

  private noProviderResult(platform: string): ExecuteResult {
    return failResult(
      `No provider registered for platform: ${platform}`,
      "resolve_provider",
      `Unknown platform: ${platform}`
    );
  }
}
