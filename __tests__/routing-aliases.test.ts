import { describe, it, expect } from "vitest";
import {
  TRESTLE_ALIASES,
  LEGACY_ALIASES,
  RELAYPLANE_ALIASES,
  SMART_ALIASES,
  resolveModelAlias,
  getAvailableModelNames,
  MODEL_MAPPING,
} from "../src/standalone-proxy.js";

describe("TRESTLE_ALIASES", () => {
  it("should map trestle:auto to tr:balanced", () => {
    expect(TRESTLE_ALIASES["trestle:auto"]).toBe("tr:balanced");
  });

  it("should map tr:auto to tr:balanced", () => {
    expect(TRESTLE_ALIASES["tr:auto"]).toBe("tr:balanced");
  });
});

describe("LEGACY_ALIASES", () => {
  it("should map relayplane:auto to tr:balanced", () => {
    expect(LEGACY_ALIASES["relayplane:auto"]).toBe("tr:balanced");
  });

  it("should map rp:auto to tr:balanced", () => {
    expect(LEGACY_ALIASES["rp:auto"]).toBe("tr:balanced");
  });

  it("exports deprecated RELAYPLANE_ALIASES merge", () => {
    expect(RELAYPLANE_ALIASES["trestle:auto"]).toBe("tr:balanced");
    expect(RELAYPLANE_ALIASES["rp:auto"]).toBe("tr:balanced");
  });
});

describe("SMART_ALIASES", () => {
  it("should have tr:best pointing to a valid model", () => {
    expect(SMART_ALIASES["tr:best"]).toBeDefined();
    expect(SMART_ALIASES["tr:best"].provider).toBe("anthropic");
    expect(SMART_ALIASES["tr:best"].model).toContain("claude");
  });

  it("should have tr:fast pointing to a fast model", () => {
    expect(SMART_ALIASES["tr:fast"]).toBeDefined();
    expect(SMART_ALIASES["tr:fast"].model).toContain("sonnet");
  });

  it("should have tr:cheap pointing to a cheap model", () => {
    expect(SMART_ALIASES["tr:cheap"]).toBeDefined();
    expect(SMART_ALIASES["tr:cheap"].model).toContain("claude");
  });

  it("should have tr:balanced pointing to a balanced model", () => {
    expect(SMART_ALIASES["tr:balanced"]).toBeDefined();
  });

  it("should point to Anthropic models by default (Max plan passthrough)", () => {
    expect(SMART_ALIASES["tr:best"].provider).toBe("anthropic");
    expect(SMART_ALIASES["tr:fast"].provider).toBe("anthropic");
    expect(SMART_ALIASES["tr:balanced"].provider).toBe("anthropic");
  });
});

describe("resolveModelAlias", () => {
  it("should resolve trestle:auto to tr:balanced", () => {
    expect(resolveModelAlias("trestle:auto")).toBe("tr:balanced");
  });

  it("should resolve legacy relayplane:auto to tr:balanced", () => {
    expect(resolveModelAlias("relayplane:auto")).toBe("tr:balanced");
  });

  it("should resolve legacy rp:auto to tr:balanced", () => {
    expect(resolveModelAlias("rp:auto")).toBe("tr:balanced");
  });

  it("should resolve legacy rp:best to tr:best", () => {
    expect(resolveModelAlias("rp:best")).toBe("tr:best");
  });

  it("should return unchanged for non-alias models", () => {
    expect(resolveModelAlias("claude-sonnet-4")).toBe("claude-sonnet-4");
    expect(resolveModelAlias("gpt-4o")).toBe("gpt-4o");
    expect(resolveModelAlias("tr:best")).toBe("tr:best");
  });

  it("should return unchanged for unknown models", () => {
    expect(resolveModelAlias("unknown-model")).toBe("unknown-model");
  });
});

describe("getAvailableModelNames", () => {
  it("should include MODEL_MAPPING keys", () => {
    const available = getAvailableModelNames();
    expect(available).toContain("claude-sonnet-4");
    expect(available).toContain("gpt-4o");
  });

  it("should include SMART_ALIASES keys", () => {
    const available = getAvailableModelNames();
    expect(available).toContain("tr:best");
    expect(available).toContain("tr:fast");
  });

  it("should include trestle long aliases", () => {
    const available = getAvailableModelNames();
    expect(available).toContain("trestle:auto");
    expect(available).toContain("trestle:cost");
  });
});

describe("MODEL_MAPPING", () => {
  it("should map common model names", () => {
    expect(MODEL_MAPPING["claude-sonnet-4"]).toBeDefined();
  });
});
