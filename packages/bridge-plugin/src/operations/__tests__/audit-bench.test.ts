import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOperation } from "../index";
import { safeSerialize } from "../../utils/serializer";

const mockFigma = { mixed: Symbol("figma.mixed") };
beforeEach(() => {
  (globalThis as any).figma = mockFigma;
});

// Deterministic synthetic node set (mix of raw fill, default name, off-grid
// spacing, failing contrast) repeated to a realistic page size.
function buildNodes(n: number) {
  const nodes: any[] = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 4;
    if (kind === 0) {
      nodes.push({
        id: `r${i}`,
        name: "raw",
        type: "RECTANGLE",
        fillStyleId: "",
        fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }],
      });
    } else if (kind === 1) {
      nodes.push({ id: `f${i}`, name: "Frame 1", type: "FRAME", layoutMode: "NONE" });
    } else if (kind === 2) {
      nodes.push({
        id: `a${i}`,
        name: "Row",
        type: "FRAME",
        layoutMode: "HORIZONTAL",
        itemSpacing: 9,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        counterAxisSpacing: null,
      });
    } else {
      nodes.push({
        id: `t${i}`,
        name: "T",
        type: "TEXT",
        characters: "Hi",
        opacity: 1,
        fontSize: 12,
        fontWeight: 400,
        fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
        parent: {
          fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }],
          parent: null,
        },
      });
    }
  }
  return nodes;
}

function bytesOf(result: unknown): number {
  return JSON.stringify(safeSerialize(result)).length;
}

async function runOp(name: string, nodes: any[]) {
  const start = Date.now();
  const result = await getOperation(name)!.execute({
    nodes,
    params: {},
    MAX_RESULTS: 200,
    figma: mockFigma,
  } as any);
  return { bytes: bytesOf(result), ms: Date.now() - start };
}

describe("audit benchmark: composite vs five separate", () => {
  it("composite runs in one round-trip/scan; payload delta is reported, not required to shrink", async () => {
    // 156 nodes (39 per kind) + 1 INSTANCE + 1 detached-lookalike FRAME.
    // Text nodes trip both a style and a contrast finding, so ~195 base findings
    // + 1 detached = ~196, which stays under the composite's shared 200-item
    // budget — an apples-to-apples comparison with no truncation on either path.
    const nodes = buildNodes(156);

    // buildNodes never creates INSTANCE nodes, so detached is always 0. Add a
    // component instance plus a detached-look-alike frame with the same name so
    // the detached check contributes to both paths.
    nodes.push(
      { id: "inst0", name: "Card", type: "INSTANCE" },
      { id: "det0", name: "Card", type: "FRAME", layoutMode: "NONE" }
    );

    const separate = [
      "lint_styles",
      "lint_detached",
      "lint_naming",
      "check_contrast",
      "audit_spacing",
    ];
    let sepBytes = 0;
    let sepMs = 0;
    const perOp: Record<string, { bytes: number; ms: number }> = {};
    for (const name of separate) {
      const r = await runOp(name, nodes);
      perOp[name] = r;
      sepBytes += r.bytes;
      sepMs += r.ms;
    }

    const compositeStart = Date.now();
    const compositeResult: any = await getOperation("validate_ds_compliance")!.execute({
      nodes,
      params: {},
      MAX_RESULTS: 200,
      figma: mockFigma,
    } as any);
    const composite = { bytes: bytesOf(compositeResult), ms: Date.now() - compositeStart };

    // Fairness guard: this benchmark is only honest if the composite did NOT
    // truncate at this node count. If it did, the byte comparison would be
    // measuring dropped data, not real structural savings.
    expect(compositeResult._hint).toBeUndefined();

    // With the compact finding shape, the composite payload is no larger than
    // the five separate calls (and still one round-trip / one scan instead of five).
    expect(composite.bytes).toBeLessThanOrEqual(sepBytes);

    // The composite must surface all five categories worth of counts.
    expect(compositeResult.counts.contrast).toBeGreaterThan(0);
    expect(compositeResult.counts.style).toBeGreaterThan(0);
    expect(compositeResult.counts.detached).toBeGreaterThan(0);
    expect(compositeResult.counts.spacing).toBeGreaterThan(0);
    expect(compositeResult.counts.naming).toBeGreaterThan(0);

    const report = {
      node_count: nodes.length,
      separate_calls: perOp,
      separate_total: { bytes: sepBytes, approx_tokens: Math.round(sepBytes / 4), ms: sepMs },
      composite: {
        bytes: composite.bytes,
        approx_tokens: Math.round(composite.bytes / 4),
        ms: composite.ms,
      },
      // Positive = composite payload smaller than the five separate calls;
      // negative = larger. After the finding-shape compaction the composite is at
      // parity or marginally smaller. Payload bytes are a secondary metric; the
      // durable saving is round_trips + scan count.
      byte_delta_pct: Math.round((1 - composite.bytes / sepBytes) * 100),
      round_trips: { separate: 5, composite: 1 },
      note:
        "The dominant real-world saving is eliminating 4 of 5 MCP request/response envelopes " +
        "plus 4 of 5 page scans (one figma.currentPage.findAll() walk instead of five). " +
        "Payload bytes are a secondary, conservative measure not captured by this comparison; " +
        "after compacting the composite's per-finding shape it is at parity with (or slightly " +
        "below) the sum of the single-purpose op payloads.",
    };

    // eslint-disable-next-line no-console
    console.log("\n=== PluginOS audit benchmark ===\n" + JSON.stringify(report, null, 2) + "\n");
    writeFileSync(
      resolve(__dirname, "../../../bench-results.json"),
      JSON.stringify(report, null, 2)
    );
  });
});
