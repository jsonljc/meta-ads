// ---------------------------------------------------------------------------
// Bootstrap — createMediaDiagnosticsCartridge() factory
// ---------------------------------------------------------------------------
// Convenience factory that creates a fully-configured cartridge with
// real or mock providers.
// ---------------------------------------------------------------------------

import { MediaDiagnosticsCartridge } from "./index.js";
import { MetaProvider } from "./providers/meta-provider.js";
import { GoogleProvider } from "./providers/google-provider.js";
import { TikTokProvider } from "./providers/tiktok-provider.js";
import { MockProvider } from "./providers/mock-provider.js";
import type { CartridgeContext } from "./types.js";
import type { PlatformType } from "../platforms/types.js";
import type { MetricSnapshot } from "../core/types.js";

export interface BootstrapOptions {
  /** Use mock providers instead of real ones (for testing) */
  useMocks?: boolean;
  /** Mock snapshots per platform (only used with useMocks=true) */
  mockSnapshots?: Partial<Record<PlatformType, Partial<MetricSnapshot>>>;
  /** Initial context to initialize with */
  context?: CartridgeContext;
}

/**
 * Create a fully-configured MediaDiagnosticsCartridge.
 *
 * Usage:
 * ```ts
 * const cartridge = await createMediaDiagnosticsCartridge();
 * const result = await cartridge.execute(
 *   "media-diagnostics.funnel.diagnose",
 *   { platform: "meta", entityId: "act_123", vertical: "commerce" },
 *   {}
 * );
 * ```
 */
export async function createMediaDiagnosticsCartridge(
  options: BootstrapOptions = {}
): Promise<MediaDiagnosticsCartridge> {
  const cartridge = new MediaDiagnosticsCartridge();

  if (options.useMocks) {
    // Register mock providers
    const platforms: PlatformType[] = ["meta", "google", "tiktok"];
    for (const platform of platforms) {
      const snapshot = options.mockSnapshots?.[platform];
      cartridge.registerProvider(new MockProvider(platform, snapshot));
    }
  } else {
    // Register real providers
    cartridge.registerProvider(new MetaProvider());
    cartridge.registerProvider(new GoogleProvider());
    cartridge.registerProvider(new TikTokProvider());
  }

  // Initialize with context
  await cartridge.initialize(options.context ?? {});

  return cartridge;
}
