import { describe, it, expect } from "vitest";
import {
  createRunOperationMessage,
  createExecuteMessage,
  createResultMessage,
  createStatusMessage,
  parseMessage,
} from "../protocol.js";

describe("protocol", () => {
  it("creates a run_operation message with unique id", () => {
    const msg = createRunOperationMessage("lint_styles", { scope: "page" });
    expect(msg.id).toMatch(/^req_/);
    expect(msg.type).toBe("run_operation");
    expect(msg.operation).toBe("lint_styles");
    expect(msg.params).toEqual({ scope: "page" });
  });

  it("creates an execute message", () => {
    const msg = createExecuteMessage("return 42", 5000);
    expect(msg.type).toBe("execute");
    expect(msg.code).toBe("return 42");
    expect(msg.timeout).toBe(5000);
  });

  it("creates a success result message", () => {
    const msg = createResultMessage("req_123", true, { count: 5 });
    expect(msg.id).toBe("req_123");
    expect(msg.type).toBe("result");
    expect(msg.success).toBe(true);
    expect(msg.result).toEqual({ count: 5 });
  });

  it("creates an error result message", () => {
    const msg = createResultMessage("req_123", false, undefined, "Font not loaded");
    expect(msg.success).toBe(false);
    expect(msg.error).toBe("Font not loaded");
  });

  it("creates a status message", () => {
    const msg = createStatusMessage("abc123", "My File", "Page 1");
    expect(msg.type).toBe("status");
    expect(msg.fileKey).toBe("abc123");
  });

  it("parses a valid JSON message", () => {
    const raw = JSON.stringify({ id: "req_1", type: "result", success: true, result: {} });
    const parsed = parseMessage(raw);
    expect(parsed!.type).toBe("result");
  });

  it("returns null for invalid JSON", () => {
    expect(parseMessage("not json")).toBeNull();
  });
});
