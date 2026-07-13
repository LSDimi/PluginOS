import type { CheckFinding } from "./types";

export interface SpacingResult {
  entries: Array<{ property: string; value: number }>;
  violations: CheckFinding[];
}

/**
 * Inspect one auto-layout frame's spacing. Off-grid = not a multiple of
 * baseUnit. baseUnit <= 0 disables grid violations (values still collected).
 * Non-auto-layout nodes yield empty results.
 */
export function checkSpacing(node: SceneNode, baseUnit: number): SpacingResult {
  const entries: Array<{ property: string; value: number }> = [];
  const violations: CheckFinding[] = [];
  if (!("layoutMode" in node)) return { entries, violations };
  const frame = node as FrameNode;
  if (frame.layoutMode === "NONE") return { entries, violations };

  const props: Array<[string, number]> = [
    ["itemSpacing", frame.itemSpacing],
    ["paddingLeft", frame.paddingLeft],
    ["paddingRight", frame.paddingRight],
    ["paddingTop", frame.paddingTop],
    ["paddingBottom", frame.paddingBottom],
  ];
  if (frame.counterAxisSpacing !== null && frame.counterAxisSpacing !== undefined) {
    props.push(["counterAxisSpacing", frame.counterAxisSpacing]);
  }

  for (const [property, value] of props) {
    entries.push({ property, value });
    if (baseUnit > 0 && value % baseUnit !== 0) {
      violations.push({
        nodeId: frame.id,
        nodeName: frame.name,
        nodeType: frame.type,
        check: "spacing",
        detail: `${property}=${value} is not a multiple of ${baseUnit}`,
        meta: { property, value, base_unit: baseUnit },
      });
    }
  }
  return { entries, violations };
}
