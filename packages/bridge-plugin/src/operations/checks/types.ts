export type CheckKind = "style" | "detached" | "naming" | "contrast" | "spacing";

export type Severity = "P0" | "P1" | "P2" | "P3";

export interface CheckFinding {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  check: CheckKind;
  detail: string;
  meta?: Record<string, unknown>;
}
