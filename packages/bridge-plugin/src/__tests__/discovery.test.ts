import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fetchStateJson,
  rankCandidates,
  discoverCandidatePorts,
  type StateFile,
  SUPPORTED_VERSION,
} from "../discovery.js";

describe("fetchStateJson", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed state on 200 with a supported version", async () => {
    const state: StateFile = {
      version: 1,
      pid: 1234,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 100,
      parentPid: 99,
      parentAlive: true,
      socketPath: null,
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => state,
    });
    const result = await fetchStateJson(9500);
    expect(result).toEqual(state);
  });

  it("returns null on a non-200 response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    expect(await fetchStateJson(9500)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    expect(await fetchStateJson(9500)).toBeNull();
  });

  it("returns null for a future version", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: SUPPORTED_VERSION + 1, pid: 1, port: 9500 }),
    });
    expect(await fetchStateJson(9500)).toBeNull();
  });
});

describe("rankCandidates", () => {
  function makeState(overrides: Partial<StateFile>): StateFile {
    return {
      version: 1,
      pid: 1,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 0,
      parentPid: 99,
      parentAlive: true,
      socketPath: null,
      ...overrides,
    };
  }

  it("filters out candidates with parentAlive=false", () => {
    const ranked = rankCandidates([
      { port: 9500, state: makeState({ parentAlive: false, startedAt: 100 }) },
      { port: 9501, state: makeState({ parentAlive: true, startedAt: 50 }) },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].port).toBe(9501);
  });

  it("sorts by startedAt descending (newest first)", () => {
    const ranked = rankCandidates([
      { port: 9500, state: makeState({ startedAt: 100 }) },
      { port: 9501, state: makeState({ startedAt: 200 }) },
      { port: 9502, state: makeState({ startedAt: 150 }) },
    ]);
    expect(ranked.map((c) => c.port)).toEqual([9501, 9502, 9500]);
  });
});

describe("discoverCandidatePorts (probe-and-rank end-to-end)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ranked candidates, excluding orphans", async () => {
    const orphan: StateFile = {
      version: 1,
      pid: 1,
      port: 9500,
      serverVersion: "0.4.3",
      startedAt: 100,
      parentPid: 99,
      parentAlive: false,
      socketPath: null,
    };
    const live: StateFile = {
      version: 1,
      pid: 2,
      port: 9501,
      serverVersion: "0.4.3",
      startedAt: 200,
      parentPid: 100,
      parentAlive: true,
      socketPath: null,
    };
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(":9500")) return { ok: true, json: async () => orphan };
      if (url.includes(":9501")) return { ok: true, json: async () => live };
      throw new Error("ECONNREFUSED");
    });
    const ranked = await discoverCandidatePorts([9500, 9501, 9502]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].port).toBe(9501);
  });

  it("returns empty when no servers respond", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const ranked = await discoverCandidatePorts([9500, 9501]);
    expect(ranked).toEqual([]);
  });
});
