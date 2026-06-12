// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { ActivityLog } from "../ui/activity-log.js";

function setupHost(): HTMLElement {
  document.body.innerHTML = `<div id="activity-log"></div>`;
  return document.getElementById("activity-log")!;
}

describe("ActivityLog integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the new empty-state copy when no entries", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    log.render();
    expect(host.textContent).toContain("No operations yet");
  });

  it("renders up to 10 entries (MAX_VISIBLE)", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    for (let i = 0; i < 12; i++) {
      log.push({
        op: `op_${i}`,
        status: "ok",
        durationMs: 100,
        params: {},
        at: Date.now() - i * 1000,
      });
    }
    log.render();
    const rows = host.querySelectorAll(".activity-row");
    expect(rows.length).toBe(10);
  });

  it("renders 5 entries when only 5 exist", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    for (let i = 0; i < 5; i++) {
      log.push({
        op: `op_${i}`,
        status: "ok",
        durationMs: 100,
        params: {},
        at: Date.now() - i * 1000,
      });
    }
    log.render();
    const rows = host.querySelectorAll(".activity-row");
    expect(rows.length).toBe(5);
  });

  it("error entries get the .err class", () => {
    const host = setupHost();
    const log = new ActivityLog(host);
    log.push({
      op: "bad_op",
      status: "error",
      durationMs: 50,
      params: {},
      error: "boom",
      at: Date.now(),
    });
    log.render();
    expect(host.querySelector(".activity-op.err")).not.toBeNull();
  });
});
