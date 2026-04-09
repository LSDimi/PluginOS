// Safe serialization that handles Figma node circular references,
// symbols (figma.mixed), and oversized results
export function safeSerialize(value: unknown, maxDepth = 5): unknown {
  const seen = new WeakSet();

  function walk(val: unknown, depth: number): unknown {
    if (depth > maxDepth) return "[max depth]";
    if (val === null || val === undefined) return val;
    if (typeof val === "symbol") return val.toString();
    if (typeof val === "function") return "[function]";
    if (typeof val !== "object") return val;

    if (seen.has(val as object)) return "[circular]";
    seen.add(val as object);

    if (Array.isArray(val)) {
      const capped = val.slice(0, 200);
      const result: unknown[] = capped.map((item) => walk(item, depth + 1));
      if (val.length > 200) {
        result.push(`[...${val.length - 200} more items]`);
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(val as Record<string, unknown>)) {
      result[key] = walk((val as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }

  return walk(value, 0);
}
