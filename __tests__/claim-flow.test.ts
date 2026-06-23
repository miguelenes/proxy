/**
 * Tests for claim-flow.ts (local-only Trestle stub)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initiateClaimFlow } from "../src/claim-flow.js";

describe("initiateClaimFlow", () => {
  let stderrOutput: string;
  let consoleWarnOutput: string;

  beforeEach(() => {
    stderrOutput = "";
    consoleWarnOutput = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    });
    vi.spyOn(console, "warn").mockImplementation((msg) => {
      consoleWarnOutput += String(msg);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints local-only message and does not throw", async () => {
    await expect(initiateClaimFlow()).resolves.toBeUndefined();
    expect(consoleWarnOutput).toContain("Cloud features are not available");
    expect(consoleWarnOutput).toContain("local-only");
  });
});
