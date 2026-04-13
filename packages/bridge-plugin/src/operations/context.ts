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
  figmaApi: PluginAPI
): OperationContext {
  const scope = (params.scope as string) || "page";
  const nodes: readonly SceneNode[] =
    scope === "selection" ? figmaApi.currentPage.selection : figmaApi.currentPage.findAll();

  return {
    nodes,
    params,
    hexToRgb,
    MAX_RESULTS,
    figma: figmaApi,
  };
}
