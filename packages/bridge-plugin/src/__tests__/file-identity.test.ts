import { describe, it, expect, beforeEach } from "vitest";
import { resolveFileId, SYNTHETIC_ID_PLUGINDATA, VERIFIED_KEY_PLUGINDATA } from "../utils/file-identity";

function mockFigma(fileKey?: string) {
  const store: Record<string, string> = {};
  return {
    fileKey,
    root: {
      getPluginData: (k: string) => store[k] ?? "",
      setPluginData: (k: string, v: string) => { store[k] = v; },
    },
    _store: store,
  } as any;
}

describe("resolveFileId (F2a)", () => {
  it("prefers the real fileKey when Figma provides one", () => {
    expect(resolveFileId(mockFigma("realkey123"))).toBe("realkey123");
  });
  it("prefers a verified key from pluginData over synthetic", () => {
    const f = mockFigma(undefined);
    f.root.setPluginData(VERIFIED_KEY_PLUGINDATA, "verifiedABC");
    expect(resolveFileId(f)).toBe("verifiedABC");
  });
  it("generates a synthetic id once and persists it", () => {
    const f = mockFigma(undefined);
    const first = resolveFileId(f);
    expect(first).toMatch(/^syn_[a-z0-9]{8}$/);
    expect(resolveFileId(f)).toBe(first);
    expect(f._store[SYNTHETIC_ID_PLUGINDATA]).toBe(first);
  });
});
