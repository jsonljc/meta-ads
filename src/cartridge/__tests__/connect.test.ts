import { describe, it, expect } from "vitest";
import { MediaDiagnosticsCartridge } from "../index.js";
import { MockProvider } from "../providers/mock-provider.js";

describe("media-diagnostics.platform.connect", () => {
  function createCartridge() {
    const cartridge = new MediaDiagnosticsCartridge();
    const provider = new MockProvider("meta");
    cartridge.registerProvider(provider);
    cartridge.registerProvider(new MockProvider("google"));
    cartridge.registerProvider(new MockProvider("tiktok"));
    return { cartridge, provider };
  }

  it("connects successfully to a platform", async () => {
    const { cartridge } = createCartridge();
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test_token" },
        entityId: "act_123",
      },
      {}
    );

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Connected to meta");
    expect(result.summary).toContain("act_123");
    expect(result.data).toBeDefined();
    expect((result.data as any).status).toBe("connected");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.rollbackAvailable).toBe(false);
    expect(result.undoRecipe).toBeNull();
  });

  it("stores connection in session state", async () => {
    const { cartridge } = createCartridge();
    await cartridge.initialize({});

    await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test_token" },
        entityId: "act_123",
      },
      {}
    );

    const session = cartridge.getSession();
    const conn = session.connections.get("meta");
    expect(conn).toBeDefined();
    expect(conn!.status).toBe("connected");
  });

  it("returns failure when provider not registered", async () => {
    const cartridge = new MediaDiagnosticsCartridge();
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "test" },
        entityId: "act_123",
      },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("No provider");
  });

  it("handles connection failure gracefully", async () => {
    const { cartridge, provider } = createCartridge();
    provider.shouldFail = true;
    provider.failError = "Invalid access token";
    await cartridge.initialize({});

    const result = await cartridge.execute(
      "media-diagnostics.platform.connect",
      {
        platform: "meta",
        credentials: { platform: "meta", accessToken: "bad_token" },
        entityId: "act_123",
      },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain("Failed to connect");
    expect(result.partialFailures).toHaveLength(1);
    expect(result.partialFailures[0].error).toContain("Invalid access token");
  });
});
