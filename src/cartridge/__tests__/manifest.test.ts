import { describe, it, expect } from "vitest";
import { MEDIA_DIAGNOSTICS_MANIFEST } from "../manifest.js";
import { validateManifest } from "../types.js";

describe("CartridgeManifest", () => {
  it("passes validation", () => {
    const errors = validateManifest(MEDIA_DIAGNOSTICS_MANIFEST);
    expect(errors).toHaveLength(0);
  });

  it("has the correct id and version", () => {
    expect(MEDIA_DIAGNOSTICS_MANIFEST.id).toBe("media-diagnostics");
    expect(MEDIA_DIAGNOSTICS_MANIFEST.version).toBe("1.0.0");
  });

  it("declares 3 required connections", () => {
    expect(MEDIA_DIAGNOSTICS_MANIFEST.requiredConnections).toEqual([
      "meta-ads-api",
      "google-ads-api",
      "tiktok-ads-api",
    ]);
  });

  it("declares read-only-analytics as default policy", () => {
    expect(MEDIA_DIAGNOSTICS_MANIFEST.defaultPolicies).toEqual([
      "read-only-analytics",
    ]);
  });

  it("defines exactly 6 actions", () => {
    expect(MEDIA_DIAGNOSTICS_MANIFEST.actions).toHaveLength(6);
  });

  it("has correct action IDs", () => {
    const actionIds = MEDIA_DIAGNOSTICS_MANIFEST.actions.map((a) => a.id);
    expect(actionIds).toContain("media-diagnostics.platform.connect");
    expect(actionIds).toContain("media-diagnostics.funnel.diagnose");
    expect(actionIds).toContain("media-diagnostics.portfolio.diagnose");
    expect(actionIds).toContain("media-diagnostics.snapshot.fetch");
    expect(actionIds).toContain("media-diagnostics.structure.analyze");
    expect(actionIds).toContain("media-diagnostics.health.check");
  });

  it("has no duplicate action IDs", () => {
    const ids = MEDIA_DIAGNOSTICS_MANIFEST.actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks connect and health.check as none risk", () => {
    const connect = MEDIA_DIAGNOSTICS_MANIFEST.actions.find(
      (a) => a.id === "media-diagnostics.platform.connect"
    );
    const health = MEDIA_DIAGNOSTICS_MANIFEST.actions.find(
      (a) => a.id === "media-diagnostics.health.check"
    );
    expect(connect?.baseRiskCategory).toBe("none");
    expect(health?.baseRiskCategory).toBe("none");
  });

  it("marks diagnostic actions as low risk", () => {
    const diagnosticActions = MEDIA_DIAGNOSTICS_MANIFEST.actions.filter(
      (a) =>
        a.id !== "media-diagnostics.platform.connect" &&
        a.id !== "media-diagnostics.health.check"
    );
    for (const action of diagnosticActions) {
      expect(action.baseRiskCategory).toBe("low");
    }
  });

  it("marks all actions as reversible", () => {
    for (const action of MEDIA_DIAGNOSTICS_MANIFEST.actions) {
      expect(action.reversible).toBe(true);
    }
  });

  it("rejects manifest with missing id", () => {
    const bad = { ...MEDIA_DIAGNOSTICS_MANIFEST, id: "" };
    const errors = validateManifest(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("id");
  });

  it("rejects manifest with duplicate action IDs", () => {
    const bad = {
      ...MEDIA_DIAGNOSTICS_MANIFEST,
      actions: [
        MEDIA_DIAGNOSTICS_MANIFEST.actions[0],
        MEDIA_DIAGNOSTICS_MANIFEST.actions[0],
      ],
    };
    const errors = validateManifest(bad);
    expect(errors.some((e) => e.message.includes("duplicate"))).toBe(true);
  });
});
