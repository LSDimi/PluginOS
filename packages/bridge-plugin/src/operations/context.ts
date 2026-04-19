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
  /**
   * Set when a guard condition fires (e.g. no selection when scope defaults
   * to "selection" and nothing is selected). Dispatcher short-circuits and
   * returns this error to the caller without running the operation.
   */
  guard?: { error: string; _hint: string };
}

export interface CreateOperationContextOptions {
  /** Optional operation name for diagnostic use (reserved for Task 5+). */
  opName?: string;
}

export function createOperationContext(
  params: Record<string, unknown>,
  defaultScope: "page" | "selection" = "page",
  _options?: CreateOperationContextOptions
): OperationContext {
  const figmaApi = (globalThis as any).figma as PluginAPI;
  const explicitScope = typeof params.scope === "string";
  const scope = (params.scope as string) || defaultScope;

  // Lazy getter: nodes are only resolved when an operation actually reads ctx.nodes.
  // Operations that need filtered subsets (e.g. TEXT-only) should call
  // figma.currentPage.findAll(predicate) directly for better performance.
  let _nodes: readonly SceneNode[] | null = null;

  const ctx: OperationContext = {
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

  // Guard: no_selection fires when the resolved scope is "selection" (from the
  // defaultScope, not an explicit caller param) and nothing is selected.
  if (
    !explicitScope &&
    defaultScope === "selection" &&
    figmaApi.currentPage.selection.length === 0
  ) {
    ctx.guard = {
      error: "no_selection",
      _hint:
        "Nothing is selected. Pass scope: 'page' with confirm: true to scan the full page, or select nodes in Figma first.",
    };
  }

  return ctx;
}
