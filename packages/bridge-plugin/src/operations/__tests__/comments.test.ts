import { describe, it, expect, vi, afterEach } from "vitest";
import { getOperation } from "../registry";
import "../comments";

const NOW = "2026-07-13T00:00:00Z";

function mockFigma(opts?: { pat?: string; rootName?: string; verifiedKey?: string }) {
  const pluginData: Record<string, string> = {};
  if (opts?.verifiedKey) pluginData["pluginos_verified_file_key"] = opts.verifiedKey;
  const clientStore: Record<string, unknown> = {};
  if (opts?.pat) clientStore["pluginos_pat"] = opts.pat;
  return {
    root: {
      name: opts?.rootName ?? "Design System",
      getPluginData: (k: string) => pluginData[k] ?? "",
      setPluginData: (k: string, v: string) => {
        pluginData[k] = v;
      },
    },
    clientStorage: {
      getAsync: async (k: string) => clientStore[k],
      setAsync: async (k: string, v: unknown) => {
        clientStore[k] = v;
      },
      deleteAsync: async (k: string) => {
        delete clientStore[k];
      },
    },
    getNodeByIdAsync: vi.fn(async (id: string) =>
      id === "1:2"
        ? { id, name: "Login Button", parent: { name: "Auth Frame", parent: null } }
        : null
    ),
    currentPage: { name: "P", selection: [], findAll: vi.fn(() => []) },
    _pluginData: pluginData,
  } as any;
}

const ctx = (figma: any, params: Record<string, unknown>) =>
  ({ nodes: [], figma, params, MAX_RESULTS: 200 }) as any;

const COMMENTS_BODY = {
  comments: [
    {
      id: "c1",
      parent_id: "",
      message: "Fix this spacing",
      resolved_at: null,
      user: { handle: "maria" },
      created_at: NOW,
      client_meta: { node_id: "1:2", node_offset: { x: 0, y: 0 } },
    },
    {
      id: "c2",
      parent_id: "c1",
      message: "agreed",
      resolved_at: null,
      user: { handle: "dimi" },
      created_at: NOW,
      client_meta: null,
    },
    {
      id: "c3",
      parent_id: "",
      message: "old one",
      resolved_at: NOW,
      user: { handle: "maria" },
      created_at: NOW,
      client_meta: { node_id: "9:9", node_offset: { x: 0, y: 0 } },
    },
  ],
};

function stubFetchRoutes(routes: Record<string, { status: number; body: unknown }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const match = Object.entries(routes).find(([frag]) => String(url).includes(frag));
      const { status, body } = match ? match[1] : { status: 404, body: {} };
      return { ok: status < 300, status, json: async () => body };
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("list_comments", () => {
  it("returns setup hint when no PAT is stored", async () => {
    const r: any = await getOperation("list_comments")!.execute(ctx(mockFigma(), {}));
    expect(r.error).toContain("No Figma personal access token");
    expect(r._hint).toContain("Setup");
  });

  it("requires file_key on first use", async () => {
    const r: any = await getOperation("list_comments")!.execute(ctx(mockFigma({ pat: "t" }), {}));
    expect(r.error).toContain("file_key");
  });

  it("validates + persists the key, joins nodes, threads replies, filters resolved", async () => {
    const figma = mockFigma({ pat: "t" });
    stubFetchRoutes({
      "/v1/files/KEY123/meta": { status: 200, body: { file: { name: "Design System" } } },
      "/v1/files/KEY123/comments": { status: 200, body: COMMENTS_BODY },
    });
    const r: any = await getOperation("list_comments")!.execute(
      ctx(figma, { file_key: "https://www.figma.com/design/KEY123/Design-System?node-id=1-2" })
    );
    expect(figma._pluginData["pluginos_verified_file_key"]).toBe("KEY123");
    expect(r.comments).toHaveLength(1); // only_unresolved defaults true, c3 filtered
    expect(r.comments[0]).toMatchObject({
      id: "c1",
      author: "maria",
      node_id: "1:2",
      node_name: "Login Button",
      node_path: "Auth Frame / Login Button",
    });
    expect(r.comments[0].replies).toEqual([
      { id: "c2", author: "dimi", created_at: NOW, text: "agreed" },
    ]);
    expect(r._hint).toContain("third-party content");
    expect(r._next_hints).toEqual(["reply_comment"]);
  });

  it("errors on file-name mismatch and does not persist", async () => {
    const figma = mockFigma({ pat: "t", rootName: "Different File" });
    stubFetchRoutes({ "/meta": { status: 200, body: { file: { name: "Design System" } } } });
    const r: any = await getOperation("list_comments")!.execute(ctx(figma, { file_key: "KEY123" }));
    expect(r.error).toContain("Different File");
    expect(r.error).toContain("Design System");
    expect(r._hint).toContain("THIS file");
    expect(figma._pluginData["pluginos_verified_file_key"]).toBeUndefined();
  });

  it("returns node_name null for deleted nodes", async () => {
    const figma = mockFigma({ pat: "t", verifiedKey: "KEY123" });
    stubFetchRoutes({ "/comments": { status: 200, body: COMMENTS_BODY } });
    const r: any = await getOperation("list_comments")!.execute(
      ctx(figma, { only_unresolved: false })
    );
    const deleted = r.comments.find((c: any) => c.id === "c3");
    expect(deleted.node_name).toBeNull();
  });

  it("falls back to 'unknown' author when the comment's user is null", async () => {
    const figma = mockFigma({ pat: "t", verifiedKey: "KEY123" });
    stubFetchRoutes({
      "/comments": {
        status: 200,
        body: {
          comments: [
            {
              id: "c4",
              parent_id: "",
              message: "left by a deleted account",
              resolved_at: null,
              user: null,
              created_at: NOW,
              client_meta: null,
            },
          ],
        },
      },
    });
    const r: any = await getOperation("list_comments")!.execute(ctx(figma, {}));
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0]).toMatchObject({ id: "c4", author: "unknown" });
  });
});

describe("reply_comment", () => {
  it("gates on confirm with a preview", async () => {
    const figma = mockFigma({ pat: "t", verifiedKey: "KEY123" });
    const r: any = await getOperation("reply_comment")!.execute(
      ctx(figma, { comment_id: "c1", message: "Done ✓ — please resolve" })
    );
    expect(r.requires_confirm).toBe(true);
    expect(r.preview).toMatchObject({ comment_id: "c1", message: "Done ✓ — please resolve" });
  });

  it("posts the reply when confirmed", async () => {
    const figma = mockFigma({ pat: "t", verifiedKey: "KEY123" });
    stubFetchRoutes({ "/comments": { status: 200, body: { id: "c9" } } });
    const r: any = await getOperation("reply_comment")!.execute(
      ctx(figma, { comment_id: "c1", message: "Done", confirm: true })
    );
    expect(r.posted).toBe(true);
    const call = vi.mocked(fetch).mock.calls[0] as any[];
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ message: "Done", comment_id: "c1" });
  });
});
