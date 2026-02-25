import type { AccountConfig } from "../config/types.js";
import type { MultiPlatformResult } from "../orchestrator/types.js";
import { runMultiPlatformDiagnostic } from "../orchestrator/runner.js";
import { formatDiagnostic } from "./funnel-diagnostic.js";

// ---------------------------------------------------------------------------
// Skill: Multi-Platform Diagnostic
// ---------------------------------------------------------------------------
// Entry point for the multi-platform orchestrator. Takes an AccountConfig
// and runs diagnostics across all enabled platforms, then correlates results.
// ---------------------------------------------------------------------------

export { runMultiPlatformDiagnostic } from "../orchestrator/runner.js";

/**
 * Format a MultiPlatformResult into a human-readable string for agent output.
 */
export function formatMultiPlatformDiagnostic(
  result: MultiPlatformResult
): string {
  const lines: string[] = [];

  // Executive summary first
  lines.push(result.executiveSummary);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Detailed per-platform reports
  for (const pr of result.platforms) {
    if (pr.status === "error") {
      lines.push(`## ${pr.platform.toUpperCase()} — Error`);
      lines.push(pr.error ?? "Unknown error");
      lines.push("");
      continue;
    }

    if (pr.result) {
      lines.push(formatDiagnostic(pr.result));
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}
