import { describe, it, expect, beforeEach } from "vitest";
import { getPat, setPat, clearPat, PAT_STORAGE_KEY } from "../utils/pat";

function mockFigma() {
  const store: Record<string, unknown> = {};
  return {
    clientStorage: {
      getAsync: async (k: string) => store[k],
      setAsync: async (k: string, v: unknown) => {
        store[k] = v;
      },
      deleteAsync: async (k: string) => {
        delete store[k];
      },
    },
    _store: store,
  } as any;
}

describe("PAT storage", () => {
  let f: any;
  beforeEach(() => {
    f = mockFigma();
  });

  it("round-trips set → get → clear", async () => {
    expect(await getPat(f)).toBeNull();
    await setPat(f, "figd_secret");
    expect(await getPat(f)).toBe("figd_secret");
    expect(f._store[PAT_STORAGE_KEY]).toBe("figd_secret");
    await clearPat(f);
    expect(await getPat(f)).toBeNull();
  });

  it("treats empty/whitespace tokens as not configured", async () => {
    await setPat(f, "   ");
    expect(await getPat(f)).toBeNull();
  });
});
