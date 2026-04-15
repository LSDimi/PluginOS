export type OperationCategory =
  | "lint"
  | "accessibility"
  | "components"
  | "tokens"
  | "layout"
  | "content"
  | "export"
  | "assets"
  | "annotations"
  | "colors"
  | "typography"
  | "cleanup"
  | "data"
  | "custom";

export interface ParamDef {
  type: "string" | "number" | "boolean" | "string[]";
  required: boolean;
  description: string;
  default?: string | number | boolean | string[];
}

export interface OperationManifest {
  name: string;
  description: string;
  category: OperationCategory;
  params: Record<string, ParamDef>;
  returns: string;
}

export interface OperationExecutor<TContext = unknown> {
  manifest: OperationManifest;
  execute: (ctx: TContext) => Promise<unknown>;
}

export interface OperationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration_ms?: number;
}
