export { registerOperation, getOperation, listOperations } from "./registry";
export type { OperationHandler } from "./registry";

// Import and register all operation modules
import "./lint";
import "./accessibility";
import "./components";
import "./cleanup";
import "./tokens";
import "./layout";
import "./write";
import "./colors";
import "./typography";
import "./content";
import "./export";
