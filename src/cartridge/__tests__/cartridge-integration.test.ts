// ---------------------------------------------------------------------------
// Integration tests for MediaDiagnosticsCartridge
// ---------------------------------------------------------------------------
// Covers: bootstrap factory, enrichContext validation, captureSnapshot,
// getRiskInput, cooldown enforcement, healthCheck edge cases, and
// cross-platform flows.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from "vitest";
import { MediaDiagnosticsCartridge } from "../index.js";
import { createMediaDiagnosticsCartridge } from "../bootstrap.js";
import { MockProvider } from "../providers/mock-provider.js";
import { DEFAULT_GUARDRAILS, DIAGNOSE_COOLDOWN_MS } from "../defaults/guardrails.js";
import type { DiagnosticResult } from "../../core/types.js";
import type { HealthCheckResult } from "../types.js";

// ---------------------------------------------------------------------------
// Bootstrap factory
// ---------------------------------------------------------------------------

describe("createMediaDiagnosticsCartridge", () => {
  it("creates cartridge with mock providers", async () => {
    const cartridge = await createMediaDiagnosticsCartridge({ useMocks: true });
    expect(cartridge).toBeInstanceOf(MediaDiagnosticsCartridge);

    // Should be able to connect to all platforms
    const result = await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );
    expect(result.success).toBe(true);
  });

  it("creates cartridge with real providers by default", async () => {
    const cartridge = await createMediaDiagnosticsCartridge();
    expect(cartridge).toBeInstanceOf(MediaDiagnosticsCartridge);
    expect(cartridge.manifest.id).toBe("media-diagnostics");
  });

  it("auto-connects credentials from context", async () => {
    const cartridge = await createMediaDiagnosticsCartridge({
      useMocks: true,
      context: {
        credentials: {
          meta: { platform: "meta", accessToken: "pre_configured" },
        },
      },
    });

    const session = cartridge.getSession();
    const conn = session.connections.get("meta");
    expect(conn).toBeDefined();
    expect(conn!.status).toBe("connected");
  });

  it("passes custom mock snapshots to providers", async () => {
    const cartridge = await createMediaDiagnosticsCartridge({
      useMocks: true,
      mockSnapshots: {
        meta: { spend: 5000 },
      },
    });

    // Connect and run diagnostic to verify snapshot data flows through
    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {
        credentials: {
          meta: { platform: "meta", accessToken: "test" },
        },
      }
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// enrichContext validation
// ---------------------------------------------------------------------------

describe("enrichContext", () => {
  async function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
    cartridge.registerProvider(new MockProvider("tiktok"));
    await cartridge.initialize({});
    return cartridge;
  }

  it("blocks execution when timeRange.since is after timeRange.until", async () => {
    const cartridge = await createCartridge();

    // Pre-connect
    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );

    const result = await cartridge.execute(
      "media-diagnostics.snapshot.fetch",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        timeRange: { since: "2024-01-14", until: "2024-01-08" },
      },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("Validation failed");
    expect(result.partialFailures[0].step).toBe("validation");
  });

  it("blocks execution when timeRange is missing since or until", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );

    const result = await cartridge.execute(
      "media-diagnostics.snapshot.fetch",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        timeRange: { since: "2024-01-08" },
      },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("Validation failed");
  });

  it("blocks execution when credential platform mismatches", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "google", clientId: "c", clientSecret: "s", refreshToken: "r", developerToken: "d" },
        entityId: "act_123",
      },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("Validation failed");
    expect(result.summary).toContain("doesn't match");
  });

  it("resolves funnel and benchmarks for funnel.diagnose", async () => {
    const cartridge = await createCartridge();
    const enriched = await cartridge.enrichContext(
      "media-diagnostics.funnel.diagnose",
      { platform: "meta", vertical: "commerce" },
      {}
    );

    expect(enriched.resolvedFunnel).toBeDefined();
    expect(enriched.resolvedBenchmarks).toBeDefined();
  });

  it("resolves platform configs for portfolio.diagnose", async () => {
    const cartridge = await createCartridge();
    const enriched = await cartridge.enrichContext(
      "media-diagnostics.portfolio.diagnose",
      {
        vertical: "commerce",
        platforms: [
          { platform: "meta", entityId: "act_1" },
          { platform: "google", entityId: "g_1" },
        ],
      },
      {}
    );

    const resolved = enriched.resolvedPlatforms as Array<{ platform: string }>;
    expect(resolved).toBeDefined();
    expect(resolved.length).toBe(2);
    expect(resolved[0].platform).toBe("meta");
    expect(resolved[1].platform).toBe("google");
  });
});

// ---------------------------------------------------------------------------
// captureSnapshot
// ---------------------------------------------------------------------------

describe("captureSnapshot", () => {
  async function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});
    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );
    return cartridge;
  }

  it("auto-captures snapshot on successful funnel.diagnose", async () => {
    const cartridge = await createCartridge();

    expect(cartridge.getCapturedSnapshots()).toHaveLength(0);

    await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    const snapshots = cartridge.getCapturedSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].actionType).toBe("media-diagnostics.funnel.diagnose");
    expect(snapshots[0].data).toBeDefined();
    expect(snapshots[0].timestamp).toBeGreaterThan(0);
    expect(snapshots[0].parameters.entityId).toBe("act_123");
  });

  it("auto-captures snapshot on successful snapshot.fetch", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.snapshot.fetch",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        timeRange: { since: "2024-01-08", until: "2024-01-14" },
      },
      {}
    );

    const snapshots = cartridge.getCapturedSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].actionType).toBe("media-diagnostics.snapshot.fetch");
  });

  it("does NOT capture snapshot on failed actions", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    // No credentials = failure
    await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    expect(cartridge.getCapturedSnapshots()).toHaveLength(0);
  });

  it("does NOT capture snapshot for connect or health.check", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.health.check",
      {
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_123",
          },
        ],
      },
      {}
    );

    // Only the connect from setup, no health check snapshot
    // Connect doesn't capture either, so should be 0
    expect(cartridge.getCapturedSnapshots()).toHaveLength(0);
  });

  it("accumulates multiple snapshots", async () => {
    const cartridge = await createCartridge();

    // First diagnostic
    await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    // A snapshot fetch (won't be blocked by cooldown since different action)
    await cartridge.execute(
      "media-diagnostics.snapshot.fetch",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        timeRange: { since: "2024-01-08", until: "2024-01-14" },
      },
      {}
    );

    expect(cartridge.getCapturedSnapshots()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getRiskInput
// ---------------------------------------------------------------------------

describe("getRiskInput", () => {
  const cartridge = new MediaDiagnosticsCartridge();

  it("returns none risk for platform.connect", () => {
    const risk = cartridge.getRiskInput(
      "media-diagnostics.platform.connect",
      { platform: "meta" },
      {}
    );
    expect(risk.baseRisk).toBe("none");
    expect(risk.exposure.dollarsAtRisk).toBe(0);
    expect(risk.reversibility).toBe("full");
  });

  it("returns low risk for funnel.diagnose", () => {
    const risk = cartridge.getRiskInput(
      "media-diagnostics.funnel.diagnose",
      { platform: "meta", entityId: "act_123" },
      {}
    );
    expect(risk.baseRisk).toBe("low");
    expect(risk.exposure.blastRadius).toBe("single");
  });

  it("returns none risk for health.check", () => {
    const risk = cartridge.getRiskInput(
      "media-diagnostics.health.check",
      {},
      {}
    );
    expect(risk.baseRisk).toBe("none");
  });

  it("returns multi-account blast radius for 3+ platform portfolio", () => {
    const risk = cartridge.getRiskInput(
      "media-diagnostics.portfolio.diagnose",
      {
        platforms: [
          { platform: "meta" },
          { platform: "google" },
          { platform: "tiktok" },
        ],
      },
      {}
    );
    expect(risk.exposure.blastRadius).toBe("multi-account");
  });

  it("returns single blast radius for 2 platform portfolio", () => {
    const risk = cartridge.getRiskInput(
      "media-diagnostics.portfolio.diagnose",
      {
        platforms: [{ platform: "meta" }, { platform: "google" }],
      },
      {}
    );
    expect(risk.exposure.blastRadius).toBe("single");
  });

  it("all actions have 0 dollarsAtRisk (read-only)", () => {
    const actions = [
      "media-diagnostics.platform.connect",
      "media-diagnostics.funnel.diagnose",
      "media-diagnostics.portfolio.diagnose",
      "media-diagnostics.snapshot.fetch",
      "media-diagnostics.structure.analyze",
      "media-diagnostics.health.check",
    ] as const;

    for (const action of actions) {
      const risk = cartridge.getRiskInput(action, {}, {});
      expect(risk.exposure.dollarsAtRisk).toBe(0);
      expect(risk.sensitivity.entityVolatile).toBe(false);
      expect(risk.sensitivity.learningPhase).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Cooldown enforcement
// ---------------------------------------------------------------------------

describe("cooldown enforcement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks funnel.diagnose when entity is in cooldown", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const creds = { platform: "meta" as const, accessToken: "test" };

    // Pre-connect
    await cartridge.execute(
      "media-diagnostics.platform.connect",
      { platform: "meta", credentials: creds, entityId: "act_123" },
      {}
    );

    // First diagnostic — succeeds
    const first = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      { platform: "meta", entityId: "act_123", vertical: "commerce" },
      {}
    );
    expect(first.success).toBe(true);

    // Immediate re-run — should be blocked by cooldown
    const second = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      { platform: "meta", entityId: "act_123", vertical: "commerce" },
      {}
    );
    expect(second.success).toBe(false);
    expect(second.summary).toContain("cooldown");
    expect(second.partialFailures[0].step).toBe("cooldown");
  });

  it("blocks structure.analyze when entity is in cooldown", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const creds = { platform: "meta" as const, accessToken: "test" };

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      { platform: "meta", credentials: creds, entityId: "act_123" },
      {}
    );

    // Run structure.analyze
    const first = await cartridge.execute(
      "media-diagnostics.structure.analyze",
      { platform: "meta", entityId: "act_123", vertical: "commerce" },
      {}
    );
    expect(first.success).toBe(true);

    // Immediate re-run — should be blocked
    const second = await cartridge.execute(
      "media-diagnostics.structure.analyze",
      { platform: "meta", entityId: "act_123", vertical: "commerce" },
      {}
    );
    expect(second.success).toBe(false);
    expect(second.summary).toContain("cooldown");
  });

  it("allows different entities to be diagnosed concurrently", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const creds = { platform: "meta" as const, accessToken: "test" };

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      { platform: "meta", credentials: creds, entityId: "act_123" },
      {}
    );

    // Diagnose entity A
    await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      { platform: "meta", entityId: "act_123", vertical: "commerce" },
      {}
    );

    // Diagnose entity B — different entity, not in cooldown
    const resultB = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      { platform: "meta", entityId: "act_456", vertical: "commerce" },
      {}
    );
    expect(resultB.success).toBe(true);
  });

  it("does not apply cooldown to snapshot.fetch", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );

    // Two snapshot fetches back-to-back should both succeed
    const first = await cartridge.execute(
      "media-diagnostics.snapshot.fetch",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        timeRange: { since: "2024-01-08", until: "2024-01-14" },
      },
      {}
    );
    const second = await cartridge.execute(
      "media-diagnostics.snapshot.fetch",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        timeRange: { since: "2024-01-08", until: "2024-01-14" },
      },
      {}
    );
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getGuardrails
// ---------------------------------------------------------------------------

describe("getGuardrails", () => {
  it("returns default guardrails configuration", () => {
    const cartridge = new MediaDiagnosticsCartridge();
    const guardrails = cartridge.getGuardrails();

    expect(guardrails).toEqual(DEFAULT_GUARDRAILS);
    expect(guardrails.rateLimits.meta.maxRequests).toBe(4);
    expect(guardrails.rateLimits.google.maxRequests).toBe(10);
    expect(guardrails.rateLimits.tiktok.maxRequests).toBe(10);
    expect(guardrails.rateLimits.global.maxRequests).toBe(30);
    expect(guardrails.cooldowns).toHaveLength(2);
    expect(guardrails.protectedEntities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// healthCheck (cartridge-level)
// ---------------------------------------------------------------------------

describe("cartridge.healthCheck()", () => {
  it("returns disconnected when no platforms are connected", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const health = await cartridge.healthCheck();
    expect(health.overall).toBe("disconnected");
    expect(health.platforms).toHaveLength(0);
    expect(health.capabilities).toHaveLength(0);
  });

  it("returns connected status for connected platforms", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
    await cartridge.initialize({});

    // Connect meta
    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );

    const health = await cartridge.healthCheck();
    expect(health.overall).toBeDefined();
    expect(["connected", "degraded"].includes(health.overall)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Google and TikTok platform flows
// ---------------------------------------------------------------------------

describe("cross-platform flows", () => {
  async function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
    cartridge.registerProvider(new MockProvider("tiktok"));
    await cartridge.initialize({});
    return cartridge;
  }

  it("runs funnel diagnostic on Google platform", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "google",
        credentials: {
          platform: "google",
          clientId: "c",
          clientSecret: "s",
          refreshToken: "r",
          developerToken: "d",
        },
        entityId: "google_123",
      },
      {}
    );

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "google",
        entityId: "google_123",
        vertical: "commerce",
      },
      {}
    );

    expect(result.success).toBe(true);
    const diag = result.data as DiagnosticResult;
    expect(diag.platform).toBe("google");
  });

  it("runs funnel diagnostic on TikTok platform", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "tiktok",
        credentials: {
          platform: "tiktok",
          accessToken: "tok",
          appId: "app",
        },
        entityId: "tt_123",
      },
      {}
    );

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "tiktok",
        entityId: "tt_123",
        vertical: "commerce",
      },
      {}
    );

    expect(result.success).toBe(true);
    const diag = result.data as DiagnosticResult;
    expect(diag.platform).toBe("tiktok");
  });

  it("runs 3-platform portfolio diagnostic", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.portfolio.diagnose",
      {
        name: "Full Portfolio",
        vertical: "commerce",
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_meta",
          },
          {
            platform: "google",
            credentials: {
              platform: "google",
              clientId: "c",
              clientSecret: "s",
              refreshToken: "r",
              developerToken: "d",
            },
            entityId: "google_1",
          },
          {
            platform: "tiktok",
            credentials: {
              platform: "tiktok",
              accessToken: "tok",
              appId: "app",
            },
            entityId: "tt_1",
          },
        ],
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.summary).toContain("3 platforms succeeded");
  });
});

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

describe("initialize", () => {
  it("resets session state on re-initialization", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));

    // First init + connect
    await cartridge.initialize({});
    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );
    expect(cartridge.getSession().connections.size).toBe(1);

    // Re-initialize — session should be reset
    await cartridge.initialize({});
    expect(cartridge.getSession().connections.size).toBe(0);
  });

  it("skips invalid platform types from context credentials", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({
      credentials: {
        invalid_platform: { platform: "meta", accessToken: "test" },
        meta: { platform: "meta", accessToken: "test" },
      } as any,
    });

    const session = cartridge.getSession();
    // Only meta should be connected, not "invalid_platform"
    expect(session.connections.has("meta")).toBe(true);
    expect(session.connections.size).toBe(1);
  });
});
