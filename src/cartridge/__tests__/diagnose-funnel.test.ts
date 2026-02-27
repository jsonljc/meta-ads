import { describe, it, expect } from "vitest";
import { MediaDiagnosticsCartridge } from "../index.js";
import { MockProvider } from "../providers/mock-provider.js";
import type { DiagnosticResult } from "../../core/types.js";

describe("media-diagnostics.funnel.diagnose", () => {
  async function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
    cartridge.registerProvider(new MockProvider("tiktok"));
    await cartridge.initialize({});
    // Pre-connect meta
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

  it("runs a complete funnel diagnostic", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Diagnosed meta commerce account act_123");
    expect(result.data).toBeDefined();

    const diagnostic = result.data as DiagnosticResult;
    expect(diagnostic.vertical).toBe("commerce");
    expect(diagnostic.entityId).toBe("act_123");
    expect(diagnostic.platform).toBe("meta");
    expect(diagnostic.stageAnalysis.length).toBeGreaterThan(0);
    expect(diagnostic.findings.length).toBeGreaterThanOrEqual(0);
  });

  it("returns ExecuteResult with correct structure", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        periodDays: 7,
      },
      {}
    );

    expect(result.rollbackAvailable).toBe(false);
    expect(result.undoRecipe).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.externalRefs.platform).toBe("meta");
    expect(result.externalRefs.entityId).toBe("act_123");
    expect(result.externalRefs.vertical).toBe("commerce");
    expect(result.partialFailures).toHaveLength(0);
  });

  it("works with credentials from context instead of session", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_456",
        vertical: "commerce",
      },
      {
        credentials: {
          meta: { platform: "meta", accessToken: "ctx_token" },
        },
      }
    );

    expect(result.success).toBe(true);
  });

  it("fails when no credentials are available", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("No credentials");
  });

  it("records diagnostic run for cooldown tracking", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    const session = cartridge.getSession();
    expect(session.lastDiagnosticTimestamps.has("act_123")).toBe(true);
  });

  it("supports leadgen vertical", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "leadgen",
      },
      {}
    );

    expect(result.success).toBe(true);
    const diagnostic = result.data as DiagnosticResult;
    expect(diagnostic.vertical).toBe("leadgen");
  });

  it("supports brand vertical", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.funnel.diagnose",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "brand",
      },
      {}
    );

    expect(result.success).toBe(true);
    const diagnostic = result.data as DiagnosticResult;
    expect(diagnostic.vertical).toBe("brand");
  });
});
