// ---------------------------------------------------------------------------
// Switchboard Cartridge — Contract Types
// ---------------------------------------------------------------------------
// Defines the interfaces that any Switchboard cartridge must implement.
// These types are framework-level — the media-diagnostics cartridge
// implements them in index.ts.
// ---------------------------------------------------------------------------

import type { PlatformType, PlatformCredentials } from "../platforms/types.js";
import type { VerticalType, EntityLevel, TimeRange } from "../core/types.js";

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

export interface ActionDefinition {
  /** Fully qualified action ID (e.g. "media-diagnostics.funnel.diagnose") */
  id: string;
  /** Human-readable description of what this action does */
  description: string;
  /** JSON Schema for the action's parameters */
  parameters: Record<string, unknown>;
  /** Base risk category for this action */
  baseRiskCategory: "none" | "low" | "medium" | "high" | "critical";
  /** Whether the action is reversible */
  reversible: boolean;
}

export interface CartridgeManifest {
  id: string;
  version: string;
  description: string;
  requiredConnections: string[];
  defaultPolicies: string[];
  actions: ActionDefinition[];
}

// ---------------------------------------------------------------------------
// Cartridge context
// ---------------------------------------------------------------------------

export interface CartridgeContext {
  /** Pre-configured credentials from server-side config */
  credentials?: Record<string, PlatformCredentials>;
  /** Session-level state (connections, cached data) */
  session?: SessionState;
  /** Any additional context provided by the orchestrator */
  [key: string]: unknown;
}

export interface SessionState {
  /** Established platform connections */
  connections: Map<PlatformType, ConnectionState>;
  /** Last diagnostic timestamps per entity (for cooldown enforcement) */
  lastDiagnosticTimestamps: Map<string, number>;
}

export interface ConnectionState {
  platform: PlatformType;
  credentials: PlatformCredentials;
  status: "connected" | "disconnected" | "error";
  accountName?: string;
  entityLevels?: EntityLevel[];
  connectedAt: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Execution types
// ---------------------------------------------------------------------------

export interface PartialFailure {
  step: string;
  error: string;
}

export interface ExecuteResult {
  success: boolean;
  /** Human-readable summary of what happened */
  summary: string;
  /** External references for audit/tracking */
  externalRefs: Record<string, string>;
  /** Whether rollback is available (always false for read-only) */
  rollbackAvailable: boolean;
  /** Partial failures if some steps failed */
  partialFailures: PartialFailure[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Undo recipe (null for read-only actions) */
  undoRecipe: null;
  /** The actual result data */
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Risk types
// ---------------------------------------------------------------------------

export interface RiskExposure {
  dollarsAtRisk: number;
  blastRadius: "single" | "multi-account" | "organization";
}

export interface RiskSensitivity {
  entityVolatile: boolean;
  learningPhase: boolean;
  recentlyModified: boolean;
}

export interface RiskInput {
  baseRisk: "none" | "low" | "medium" | "high" | "critical";
  exposure: RiskExposure;
  reversibility: "full" | "partial" | "none";
  sensitivity: RiskSensitivity;
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum requests in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Scope: per-platform, per-entity, or global */
  scope: "platform" | "entity" | "global";
}

export interface CooldownConfig {
  /** Action type this cooldown applies to */
  actionType: string;
  /** Cooldown duration in seconds */
  durationSeconds: number;
  /** Key function — what to scope the cooldown by (e.g. entityId) */
  keyScope: "entityId" | "platform" | "global";
}

export interface GuardrailConfig {
  rateLimits: Record<string, RateLimitConfig>;
  cooldowns: CooldownConfig[];
  protectedEntities: string[];
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface ConnectionHealth {
  platform: PlatformType;
  status: "connected" | "degraded" | "disconnected";
  latencyMs: number;
  error?: string;
  capabilities: string[];
}

export interface HealthCheckResult {
  overall: "connected" | "degraded" | "disconnected";
  platforms: ConnectionHealth[];
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface PolicyConfig {
  id: string;
  name: string;
  description: string;
  allowedActions: string[];
  deniedActions: string[];
  maxRiskLevel: "none" | "low" | "medium" | "high" | "critical";
}

// ---------------------------------------------------------------------------
// Snapshot capture
// ---------------------------------------------------------------------------

export interface CapturedSnapshot {
  actionType: string;
  timestamp: number;
  parameters: Record<string, unknown>;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Action parameter types
// ---------------------------------------------------------------------------

export interface ConnectParams {
  platform: PlatformType;
  credentials: PlatformCredentials;
  entityId: string;
}

export interface DiagnoseFunnelParams {
  platform: PlatformType;
  entityId: string;
  entityLevel?: EntityLevel;
  vertical: VerticalType;
  periodDays?: number;
  referenceDate?: string;
  enableStructuralAnalysis?: boolean;
  enableHistoricalTrends?: boolean;
  targetROAS?: number;
}

export interface DiagnosePortfolioParams {
  name: string;
  vertical: VerticalType;
  platforms: Array<{
    platform: PlatformType;
    credentials: PlatformCredentials;
    entityId: string;
    entityLevel?: EntityLevel;
    enableStructuralAnalysis?: boolean;
    enableHistoricalTrends?: boolean;
    qualifiedLeadActionType?: string;
    targetROAS?: number;
  }>;
  periodDays?: number;
  referenceDate?: string;
}

export interface FetchSnapshotParams {
  platform: PlatformType;
  entityId: string;
  entityLevel?: EntityLevel;
  vertical: VerticalType;
  timeRange: TimeRange;
}

export interface AnalyzeStructureParams {
  platform: PlatformType;
  entityId: string;
  vertical: VerticalType;
  periodDays?: number;
}

export interface HealthCheckParams {
  platforms: Array<{
    platform: PlatformType;
    credentials: PlatformCredentials;
    entityId: string;
  }>;
}

// ---------------------------------------------------------------------------
// Cartridge interface
// ---------------------------------------------------------------------------

export type ActionType =
  | "media-diagnostics.platform.connect"
  | "media-diagnostics.funnel.diagnose"
  | "media-diagnostics.portfolio.diagnose"
  | "media-diagnostics.snapshot.fetch"
  | "media-diagnostics.structure.analyze"
  | "media-diagnostics.health.check";

export interface Cartridge {
  readonly manifest: CartridgeManifest;

  /** Initialize the cartridge with context (credentials, config) */
  initialize(context: CartridgeContext): Promise<void>;

  /** Enrich context before execution (resolve funnels, benchmarks, etc.) */
  enrichContext(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): Promise<CartridgeContext>;

  /** Execute an action */
  execute(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): Promise<ExecuteResult>;

  /** Get risk input for an action */
  getRiskInput(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    context: CartridgeContext
  ): RiskInput;

  /** Get guardrail configuration */
  getGuardrails(): GuardrailConfig;

  /** Check health of all configured platforms */
  healthCheck(): Promise<HealthCheckResult>;

  /** Capture a snapshot for audit/comparison (optional) */
  captureSnapshot?(
    actionType: ActionType,
    parameters: Record<string, unknown>,
    result: ExecuteResult
  ): CapturedSnapshot;
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

export interface ManifestValidationError {
  field: string;
  message: string;
}

export function validateManifest(
  manifest: CartridgeManifest
): ManifestValidationError[] {
  const errors: ManifestValidationError[] = [];

  if (!manifest.id || typeof manifest.id !== "string") {
    errors.push({ field: "id", message: "id is required and must be a string" });
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push({ field: "version", message: "version is required and must be a string" });
  }
  if (!manifest.description || typeof manifest.description !== "string") {
    errors.push({ field: "description", message: "description is required and must be a string" });
  }
  if (!Array.isArray(manifest.requiredConnections)) {
    errors.push({ field: "requiredConnections", message: "requiredConnections must be an array" });
  }
  if (!Array.isArray(manifest.defaultPolicies)) {
    errors.push({ field: "defaultPolicies", message: "defaultPolicies must be an array" });
  }
  if (!Array.isArray(manifest.actions) || manifest.actions.length === 0) {
    errors.push({ field: "actions", message: "actions must be a non-empty array" });
  } else {
    const ids = new Set<string>();
    for (const action of manifest.actions) {
      if (!action.id) {
        errors.push({ field: "actions", message: "each action must have an id" });
      } else if (ids.has(action.id)) {
        errors.push({ field: "actions", message: `duplicate action id: ${action.id}` });
      } else {
        ids.add(action.id);
      }

      if (!action.description) {
        errors.push({
          field: `actions[${action.id}]`,
          message: "action must have a description",
        });
      }

      const validRisks = ["none", "low", "medium", "high", "critical"];
      if (!validRisks.includes(action.baseRiskCategory)) {
        errors.push({
          field: `actions[${action.id}].baseRiskCategory`,
          message: `invalid baseRiskCategory: ${action.baseRiskCategory}`,
        });
      }

      if (typeof action.reversible !== "boolean") {
        errors.push({
          field: `actions[${action.id}].reversible`,
          message: "reversible must be a boolean",
        });
      }
    }
  }

  return errors;
}
