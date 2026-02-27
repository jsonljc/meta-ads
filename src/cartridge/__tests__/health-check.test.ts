import { describe, it, expect } from "vitest";
import { MediaDiagnosticsCartridge } from "../index.js";
import { MockProvider } from "../providers/mock-provider.js";
import type { HealthCheckResult } from "../types.js";

describe("media-diagnostics.health.check", () => {
  function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    cartridge.registerProvider(new MockProvider("meta"));
    cartridge.registerProvider(new MockProvider("google"));
    cartridge.registerProvider(new MockProvider("tiktok"));
    return cartridge;
  }

  it("returns connected status when all platforms respond", async () => {
    const cartridge = createCartridge();
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.health.check",
      {
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_123",
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
    expect(result.data).toBeDefined();

    const health = result.data as HealthCheckResult;
    expect(health.overall).toBe("connected");
    expect(health.platforms).toHaveLength(2);
    expect(health.capabilities.length).toBeGreaterThan(0);
  });

  it("returns degraded status when some platforms fail", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    const failingMeta = new MockProvider("meta");
    failingMeta.shouldFail = true;
    cartridge.registerProvider(failingMeta);
    cartridge.registerProvider(new MockProvider("google"));
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.health.check",
      {
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_123",
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

    const health = result.data as HealthCheckResult;
    expect(health.overall).toBe("degraded");
    expect(result.partialFailures.length).toBeGreaterThan(0);
  });

  it("returns disconnected status when all platforms fail", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    const failingMeta = new MockProvider("meta");
    failingMeta.shouldFail = true;
    const failingGoogle = new MockProvider("google");
    failingGoogle.shouldFail = true;
    cartridge.registerProvider(failingMeta);
    cartridge.registerProvider(failingGoogle);
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.health.check",
      {
        platforms: [
          {
            platform: "meta",
            credentials: { platform: "meta", accessToken: "test" },
            entityId: "act_123",
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

    expect(result.success).toBe(false);
    const health = result.data as HealthCheckResult;
    expect(health.overall).toBe("disconnected");
  });

  it("returns error for unregistered providers", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    await cartridge.initialize({});

    const result = await cartridge.execute(
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

    const health = result.data as HealthCheckResult;
    expect(health.overall).toBe("disconnected");
    expect(health.platforms[0].error).toContain("No provider");
  });

  it("uses cartridge-level healthCheck method", async () => {
    const cartridge = createCartridge();
    await cartridge.initialize({});

    // Connect a platform first
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
  });

  it("returns correct ExecuteResult structure", async () => {
    const cartridge = createCartridge();
    await cartridge.initialize({});

    const result = await cartridge.execute(
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

    expect(result.rollbackAvailable).toBe(false);
    expect(result.undoRecipe).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
