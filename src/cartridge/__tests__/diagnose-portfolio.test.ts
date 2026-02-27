import { describe, it, expect } from "vitest";
import { MediaDiagnosticsCartridge } from "../index.js";
import { MockProvider } from "../providers/mock-provider.js";
import type { MultiPlatformResult } from "../../orchestrator/types.js";

describe("media-diagnostics.portfolio.diagnose", () => {
  async function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
    cartridge.registerProvider(new MockProvider("tiktok"));
    await cartridge.initialize({});
    return cartridge;
  }

  it("runs a multi-platform portfolio diagnostic", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.portfolio.diagnose",
      {
        name: "Test Portfolio",
        vertical: "commerce",
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_meta_1",
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
            entityId: "google_123",
          },
        ],
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Test Portfolio");
    expect(result.summary).toContain("2 platforms succeeded");
    expect(result.data).toBeDefined();

    const portfolio = result.data as MultiPlatformResult;
    expect(portfolio.platforms).toHaveLength(2);
    expect(portfolio.executiveSummary).toBeDefined();
  });

  it("handles partial platform failures", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    const metaProvider = new MockProvider("meta");
    metaProvider.shouldFail = true;
    metaProvider.failError = "Token expired";
    cartridge.registerProvider(metaProvider);
    cartridge.registerProvider(new MockProvider("google"));
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.portfolio.diagnose",
      {
        name: "Partial Portfolio",
        vertical: "commerce",
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "expired" },
            entityId: "act_meta_1",
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
            entityId: "google_123",
          },
        ],
      },
      {}
    );

    // Should still succeed since at least one platform worked
    expect(result.success).toBe(true);
    expect(result.summary).toContain("1 platforms succeeded");
    expect(result.summary).toContain("1 failed");
    expect(result.partialFailures.length).toBeGreaterThan(0);
  });

  it("returns correct ExecuteResult structure", async () => {
    const cartridge = await createCartridge();

    const result = await cartridge.execute(
      "media-diagnostics.portfolio.diagnose",
      {
        name: "Structure Test",
        vertical: "commerce",
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_1",
          },
        ],
      },
      {}
    );

    expect(result.rollbackAvailable).toBe(false);
    expect(result.undoRecipe).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.externalRefs.name).toBe("Structure Test");
    expect(result.externalRefs.vertical).toBe("commerce");
  });
});
