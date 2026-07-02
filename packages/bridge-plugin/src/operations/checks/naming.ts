import type { CheckFinding } from "./types";

const DEFAULT_NAME_PATTERN =
  /^(Frame|Rectangle|Ellipse|Group|Line|Vector|Text|Polygon|Star|Section|Slice|Image|Component|Instance) \d+$/;

export function checkNaming(node: SceneNode): CheckFinding[] {
  if (!DEFAULT_NAME_PATTERN.test(node.name)) return [];
  return [
    {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      check: "naming",
      detail: `Default layer name "${node.name}"`,
    },
  ];
}
