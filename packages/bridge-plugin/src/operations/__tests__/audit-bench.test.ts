import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOperation } from "../index";
import { safeSerialize } from "../../utils/serializer";

const mockFigma = { mixed: Symbol("figma.mixed") };
beforeEach(() => { (globalThis as any).figma = mockFigma; });

// Deterministic synthetic node set (mix of raw fill, default name, off-grid
// spacing, failing contrast) repeated to a realistic page size.
function buildNodes(n: number) {
  const nodes: any[] = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 4;
    if (kind === 0) {
      nodes.push({ id: `r${i}`, name: "raw", type: "RECTANGLE", fillStyleId: "", fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 } }] });
    } else if (kind === 1) {
      nodes.push({ id: `f${i}`, name: "Frame 1", type: "FRAME", layoutMode: "NONE" });
    } else if (kind === 2) {
      nodes.push({ id: `a${i}`, name: "Row", type: "FRAME", layoutMode: "HORIZONTAL", itemSpacing: 9, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, counterAxisSpacing: null });
    } else {
      nodes.push({ id: `t${i}`, name: "T", type: "TEXT", characters: "Hi", opacity: 1, fontSize: 12, fontWeight: 400, fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }], parent: { fills: [{ type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0 } }], parent: null } });
    }
  }
  return nodes;
}

function bytesOf(result: unknown): number {
  return JSON.stringify(safeSerialize(result)).length;
}

async function runOp(name: string, nodes: any[]) {
  const start = Date.now();
  const result = await getOperation(name)!.execute({ nodes, params: {}, MAX_RESULTS: 200, figma: mockFigma } as any);
  return { bytes: bytesOf(result), ms: Date.now() - start };
}

describe("audit benchmark: composite vs five separate", () => {
  it("composite payload is smaller than the sum of five separate calls", async () => {
    const nodes = buildNodes(400);

    const separate = ["lint_styles", "lint_detached", "lint_naming", "check_contrast", "audit_spacing"];
    let sepBytes = 0;
    let sepMs = 0;
    const perOp: Record<string, { bytes: number; ms: number }> = {};
    for (const name of separate) {
      const r = await runOp(name, nodes);
      perOp[name] = r;
      sepBytes += r.bytes;
      sepMs += r.ms;
    }

    const composite = await runOp("validate_ds_compliance", nodes);

    const report = {
      node_count: nodes.length,
      separate_calls: perOp,
      separate_total: { bytes: sepBytes, approx_tokens: Math.round(sepBytes / 4), ms: sepMs },
      composite: { bytes: composite.bytes, approx_tokens: Math.round(composite.bytes / 4), ms: composite.ms },
      byte_reduction_pct: Math.round((1 - composite.bytes / sepBytes) * 100),
    };

    // eslint-disable-next-line no-console
    console.log("\n=== PluginOS audit benchmark ===\n" + JSON.stringify(report, null, 2) + "\n");
    writeFileSync(resolve(__dirname, "../../../bench-results.json"), JSON.stringify(report, null, 2));

    expect(composite.bytes).toBeLessThan(sepBytes);
  });
});
