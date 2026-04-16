import type { RGB } from "@pluginos/shared";
import { hexToRgb } from "@pluginos/shared";

export const MAX_RESULTS = 200;

export interface OperationContext {
  /** Scope-resolved nodes — already computed by the dispatcher */
  readonly nodes: readonly SceneNode[];
  /** Raw params from the MCP call */
  readonly params: Record<string, unknown>;
  /** Parse "#RRGGBB" to {r,g,b} in 0-1 range */
  hexToRgb(hex: string): RGB;
  /** Maximum items to return in result arrays */
  readonly MAX_RESULTS: number;
  /** Typed Figma plugin API */
  readonly figma: PluginAPI;
}

export function createOperationContext(
  params: Record<string, unknown>,
  figmaApi: PluginAPI,
  defaultScope: "page" | "selection" = "page"
): OperationContext {
  const scope = (params.scope as string) || defaultScope;

  // Lazy getter: nodes are only resolved when an operation actually reads ctx.nodes.
  // Operations that need filtered subsets (e.g. TEXT-only) should call
  // figma.currentPage.findAll(predicate) directly for better performance.
  let _nodes: readonly SceneNode[] | null = null;

  return {
    get nodes(): readonly SceneNode[] {
      if (_nodes === null) {
        _nodes =
          scope === "selection" ? figmaApi.currentPage.selection : figmaApi.currentPage.findAll();
      }
      return _nodes;
    },
    params,
    hexToRgb,
    MAX_RESULTS,
    figma: figmaApi,
  };
}
