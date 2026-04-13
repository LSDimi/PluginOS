import type { OperationManifest, OperationExecutor } from "@pluginos/shared";
import type { OperationContext } from "./context";

// Concrete executor type for this plugin
export type PluginOperationHandler = OperationExecutor<OperationContext>;

// Backward compat alias during migration
export type OperationHandler = PluginOperationHandler;

// Registry of all built-in operations
const operations = new Map<string, PluginOperationHandler>();

export function registerOperation(handler: PluginOperationHandler): void {
  operations.set(handler.manifest.name, handler);
}

export function getOperation(name: string): PluginOperationHandler | undefined {
  return operations.get(name);
}

export function listOperations(category?: string): OperationManifest[] {
  const all = Array.from(operations.values()).map((op) => op.manifest);
  if (category) return all.filter((op) => op.category === category);
  return all;
}
