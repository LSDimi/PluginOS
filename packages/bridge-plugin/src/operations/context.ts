import type { RGB } from "@pluginos/shared";
import { hexToRgb } from "@pluginos/shared";

export const MAX_RESULTS = 200;

export const PAGE_SCAN_CONFIRM_THRESHOLD = 500;

export const GUARDED_OPS = new Set<string>([
  "lint_styles",
  "lint_detached",
  "lint_naming",
  "check_contrast",
  "check_touch_targets",
  "audit_spacing",
  "audit_text_styles",
  "find_non_style_colors",
  "analyze_overrides",
]);

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
   * to "selection" and nothing is selected, or page scan exceeds the node
   * threshold). Dispatcher short-circuits and returns this to the caller
   * without running the operation.
   */
  readonly guard?:
    | { error: string; _hint: string }
    | { requires_confirm: true; estimated_nodes: number; _hint: string };
}

export interface CreateOperationContextOptions {
  /** Optional operation name for diagnostic use (reserved for Task 5+). */
  opName?: string;
}

export function createOperationContext(
  params: Record<string, unknown>,
  defaultScope: "page" | "selection" = "page",
  options?: CreateOperationContextOptions
): OperationContext {
  const figmaApi = (globalThis as any).figma as PluginAPI | undefined;
  if (!figmaApi) {
    throw new Error("[PluginOS] figma global is not available in this runtime");
  }
  const explicitScope = typeof params.scope === "string";
  const scope = (params.scope as string) || defaultScope;

  // Cache for pre-resolved nodes (used both by guard check and lazy getter).
  let _nodes: readonly SceneNode[] | null = null;

  let guard: OperationContext["guard"];

  if (!explicitScope && scope === "selection" && figmaApi.currentPage.selection.length === 0) {
    // Guard: no_selection fires when the resolved scope is "selection" (from the
    // defaultScope, not an explicit caller param) and nothing is selected.
    guard = {
      error: "no_selection",
      _hint:
        "Nothing is selected. Pass scope: 'page' with confirm: true to scan the full page, or select nodes in Figma first.",
    };
  } else if (
    scope === "page" &&
    options?.opName &&
    GUARDED_OPS.has(options.opName) &&
    params.confirm !== true
  ) {
    // Guard: massive-scan fires when a guarded op would scan the full page and
    // the node count exceeds PAGE_SCAN_CONFIRM_THRESHOLD.
    const allNodes = figmaApi.currentPage.findAll();
    if (allNodes.length > PAGE_SCAN_CONFIRM_THRESHOLD) {
      // Cache the resolved nodes so ctx.nodes doesn't re-fetch.
      _nodes = allNodes as readonly SceneNode[];
      guard = {
        requires_confirm: true,
        estimated_nodes: allNodes.length,
        _hint: `Page has ${allNodes.length} nodes. Re-call with confirm: true to proceed, or narrow with scope: 'selection' or node_id.`,
      };
    }
  }

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
    guard,
  };
}
