export type BindingState = "style" | "variable" | "raw";

/**
 * Resolve whether a paint/style-bearing property is backed by a shared style,
 * a bound variable, or a raw value. Modern variables-based DS work binds fills
 * to variables (per-paint `boundVariables.color`) — those must NOT be flagged
 * as drift. `property` is one of "fill" | "stroke" | "text" | "effect".
 */
export function resolveBindingState(
  node: SceneNode,
  property: "fill" | "stroke" | "text" | "effect"
): BindingState {
  const anyNode = node as any;

  const styleIdField =
    property === "fill"
      ? "fillStyleId"
      : property === "stroke"
        ? "strokeStyleId"
        : property === "text"
          ? "textStyleId"
          : "effectStyleId";
  const styleId = anyNode[styleIdField];
  // figma.mixed is a Symbol → typeof !== "string" → correctly not a style.
  if (typeof styleId === "string" && styleId !== "") return "style";

  if (property === "text") {
    // Text style variable binding is not a paint; without a style it is raw.
    return "raw";
  }

  if (property === "effect") {
    const effects = anyNode.effects;
    // Match the fill/stroke rule: only "variable" when EVERY effect is bound,
    // so a raw effect alongside a bound one is still surfaced as drift.
    if (
      Array.isArray(effects) &&
      effects.length > 0 &&
      effects.every((e: any) => e && e.boundVariables)
    )
      return "variable";
    return "raw";
  }

  // fill / stroke — variable binding is per-paint via boundVariables.color.
  const paintsField = property === "fill" ? "fills" : "strokes";
  const paints = anyNode[paintsField];
  if (Array.isArray(paints)) {
    const solids = paints.filter((p: any) => p && p.type === "SOLID" && p.visible !== false);
    if (solids.length > 0 && solids.every((p: any) => p.boundVariables && p.boundVariables.color)) {
      return "variable";
    }
  }
  return "raw";
}
