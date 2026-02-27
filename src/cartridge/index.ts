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
import type { AdPlatformProvider } from "./providers/provider.js";
import { MEDIA_DIAGNOSTICS_MANIFEST } from "./manifest.js";
import { DEFAULT_GUARDRAILS } from "./defaults/guardrails.js";
import { computeRiskInput } from "./risk/categories.js";
import { createSessionState } from "./context/session.js";
import { resolveFunnel, resolveBenchmarks } from "../platforms/registry.js";

// Action handlers
import { executeConnect } from "./actions/connect.js";
import { executeDiagnoseFunnel } from "./actions/diagnose-funnel.js";
import { executeDiagnosePortfolio } from "./actions/diagnose-portfolio.js";
import { executeFetchSnapshot } from "./actions/fetch-snapshot.js";
import { executeAnalyzeStructure } from "./actions/analyze-structure.js";
import { executeHealthCheck } from "./actions/health-check.js";

export class MediaDiagnosticsCartridge implements Cartridge {
  readonly manifest: CartridgeManifest = MEDIA_DIAGNOSTICS_MANIFEST;

  private providers: Map<string, AdPlatformProvider> = new Map();
  private session: SessionState = createSessionState();

  /** Register a provider for a platform */
  registerProvider(provider: AdPlatformProvider): void {
    this.providers.set(provider.platform, provider);
  }

  async initialize(context: CartridgeContext): Promise<void> {
    this.session = createSessionState();

    // Auto-connect any pre-configured credentials
    if (context.credentials) {
      for (const [platformStr, creds] of Object.entries(context.credentials)) {
        const platform = platformStr as PlatformType;
        const provider = this.providers.get(platform);
        if (provider && creds) {
          this.session.connections.set(platform, {
            platform,
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
      case "media-diagnostics.funnel.diagnose":
      case "media-diagnostics.portfolio.diagnose": {
        // Resolve funnel schema and benchmarks, attach to context
        const platform = parameters.platform as PlatformType | undefined;
        const vertical = parameters.vertical as string | undefined;
        if (platform && vertical) {
          try {
            enriched.resolvedFunnel = resolveFunnel(
              platform,
              vertical as any
            );
            enriched.resolvedBenchmarks = resolveBenchmarks(
              platform,
              vertical as any
            );
          } catch {
            // Will fail during execution with a better error
          }
        }
        break;
      }

      case "media-diagnostics.snapshot.fetch": {
        // Validate time range
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
        // Validate credential shape
        const creds = parameters.credentials as
          | PlatformCredentials
          | undefined;
        if (creds) {
          const platform = parameters.platform as PlatformType;
          if (creds.platform !== platform) {
            enriched.validationError = `Credential platform "${creds.platform}" doesn't match requested platform "${platform}"`;
          }
        }
        break;
      }

      case "media-diagnostics.structure.analyze": {
        // Check if platform supports sub-entity breakdowns
        const platform = parameters.platform as PlatformType | undefined;
        if (platform) {
          enriched.supportsStructural = true; // All current platforms support it
        }
        break;
      }
    }

    return enriched;
  }

  async execute(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): Promise<ExecuteResult> {
    switch (actionType) {
      case "media-diagnostics.platform.connect": {
        const params = parameters as unknown as ConnectParams;
        const provider = this.providers.get(params.platform);
        if (!provider) {
          return {
            success: false,
            summary: `No provider registered for platform: ${params.platform}`,
            externalRefs: { platform: params.platform },
            rollbackAvailable: false,
            partialFailures: [
              {
                step: "resolve_provider",
                error: `Unknown platform: ${params.platform}`,
              },
            ],
            durationMs: 0,
            undoRecipe: null,
          };
        }
        return executeConnect(params, provider, this.session);
      }

      case "media-diagnostics.funnel.diagnose": {
        const params = parameters as unknown as DiagnoseFunnelParams;
        const provider = this.providers.get(params.platform);
        if (!provider) {
          return {
            success: false,
            summary: `No provider registered for platform: ${params.platform}`,
            externalRefs: { platform: params.platform },
            rollbackAvailable: false,
            partialFailures: [
              {
                step: "resolve_provider",
                error: `Unknown platform: ${params.platform}`,
              },
            ],
            durationMs: 0,
            undoRecipe: null,
          };
        }
        // Pass credentials from context if available
        const creds =
          context.credentials?.[params.platform] ??
          this.session.connections.get(params.platform)?.credentials;
        return executeDiagnoseFunnel(params, provider, this.session, creds);
      }

      case "media-diagnostics.portfolio.diagnose": {
        const params = parameters as unknown as DiagnosePortfolioParams;
        return executeDiagnosePortfolio(params, this.providers, this.session);
      }

      case "media-diagnostics.snapshot.fetch": {
        const params = parameters as unknown as FetchSnapshotParams;
        const provider = this.providers.get(params.platform);
        if (!provider) {
          return {
            success: false,
            summary: `No provider registered for platform: ${params.platform}`,
            externalRefs: { platform: params.platform },
            rollbackAvailable: false,
            partialFailures: [
              {
                step: "resolve_provider",
                error: `Unknown platform: ${params.platform}`,
              },
            ],
            durationMs: 0,
            undoRecipe: null,
          };
        }
        const creds =
          context.credentials?.[params.platform] ??
          this.session.connections.get(params.platform)?.credentials;
        return executeFetchSnapshot(params, provider, this.session, creds);
      }

      case "media-diagnostics.structure.analyze": {
        const params = parameters as unknown as AnalyzeStructureParams;
        const provider = this.providers.get(params.platform);
        if (!provider) {
          return {
            success: false,
            summary: `No provider registered for platform: ${params.platform}`,
            externalRefs: { platform: params.platform },
            rollbackAvailable: false,
            partialFailures: [
              {
                step: "resolve_provider",
                error: `Unknown platform: ${params.platform}`,
              },
            ],
            durationMs: 0,
            undoRecipe: null,
          };
        }
        const creds =
          context.credentials?.[params.platform] ??
          this.session.connections.get(params.platform)?.credentials;
        return executeAnalyzeStructure(params, provider, this.session, creds);
      }

      case "media-diagnostics.health.check": {
        const params = parameters as unknown as HealthCheckParams;
        return executeHealthCheck(params, this.providers);
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
        entityId: "", // Health check doesn't need a specific entity
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
    return result.data as HealthCheckResult;
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

  /** Expose session for testing */
  getSession(): SessionState {
    return this.session;
  }
}
