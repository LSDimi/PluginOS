export interface OperationHandler {
  manifest: {
    name: string;
    description: string;
    category: string;
    params: Record<string, { type: string; required: boolean; description: string }>;
    returns: string;
  };
  execute: (params: Record<string, any>) => Promise<any>;
}

// Registry of all built-in operations
const operations = new Map<string, OperationHandler>();

export function registerOperation(handler: OperationHandler): void {
  operations.set(handler.manifest.name, handler);
}

export function getOperation(name: string): OperationHandler | undefined {
  return operations.get(name);
}

export function listOperations(category?: string): OperationHandler["manifest"][] {
  const all = Array.from(operations.values()).map((op) => op.manifest);
  if (category) return all.filter((op) => op.category === category);
  return all;
}
