import { describe, it, expect } from "vitest";
import { MediaDiagnosticsCartridge } from "../index.js";
import { MockProvider } from "../providers/mock-provider.js";

describe("media-diagnostics.structure.analyze", () => {
  async function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
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

  it("analyzes account structure with sub-entity breakdowns", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.structure.analyze",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Structural analysis");
    expect(result.summary).toContain("act_123");
    expect(result.data).toBeDefined();

    const data = result.data as {
      subEntities: any[];
      findings: any[];
    };
    expect(data.subEntities.length).toBeGreaterThan(0);
    expect(Array.isArray(data.findings)).toBe(true);
  });

  it("records diagnostic run for cooldown", async () => {
    const cartridge = await createCartridge();

    await cartridge.execute(
      "media-diagnostics.structure.analyze",
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

  it("fails when no credentials available", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.structure.analyze",
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

  it("returns correct ExecuteResult structure", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.structure.analyze",
      {
        platform: "meta",
        entityId: "act_123",
        vertical: "commerce",
        periodDays: 14,
      },
      {}
    );

    expect(result.rollbackAvailable).toBe(false);
    expect(result.undoRecipe).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.externalRefs.platform).toBe("meta");
    expect(result.partialFailures).toHaveLength(0);
  });
});
