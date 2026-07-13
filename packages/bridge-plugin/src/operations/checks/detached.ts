import type { CheckFinding } from "./types";

export function collectInstanceComponentNames(nodes: readonly SceneNode[]): Set<string> {
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.type === "INSTANCE") names.add(node.name);
  }
  return names;
}

/** Heuristic: a FRAME named like a live instance component is likely detached. */
export function checkDetached(node: SceneNode, instanceNames: Set<string>): CheckFinding[] {
  if (node.type !== "FRAME") return [];
  if (!instanceNames.has(node.name)) return [];
  return [
    {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      check: "detached",
      detail: `Frame named like instance component "${node.name}"`,
      meta: { parentName: (node.parent && node.parent.name) || "root" },
    },
  ];
}
