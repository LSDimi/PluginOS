// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ActivityLog } from "../../ui/activity-log";

describe("ActivityLog", () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `<div id="activity-log"></div>`;
    host = document.getElementById("activity-log")!;
  });

  it("renders an empty state when no entries", () => {
    new ActivityLog(host).render();
    expect(host.textContent).toMatch(/no recent activity/i);
  });

  it("renders entries with success marker", () => {
    const log = new ActivityLog(host);
    log.push({ op: "list_components", status: "ok", durationMs: 120, params: {} });
    log.render();
    expect(host.querySelector(".activity-op")?.textContent).toContain("list_components");
    expect(host.querySelector(".check")?.textContent).toBe("✓");
  });

  it("renders failures with error marker and red color class", () => {
    const log = new ActivityLog(host);
    log.push({ op: "lint_styles", status: "error", durationMs: 50, params: {}, error: "boom" });
    log.render();
    expect(host.querySelector(".activity-op")?.classList.contains("err")).toBe(true);
  });

  it("caps visible entries to 5 but keeps up to 50 in memory", () => {
    const log = new ActivityLog(host);
    for (let i = 0; i < 60; i++) log.push({ op: `op_${i}`, status: "ok", durationMs: 10, params: {} });
    log.render();
    expect(host.querySelectorAll(".activity-row").length).toBe(5);
    expect(log.size()).toBe(50);
  });

  it("copies op name to clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const log = new ActivityLog(host);
    log.push({ op: "audit_spacing", status: "ok", durationMs: 10, params: {} });
    log.render();
    (host.querySelector(".activity-row") as HTMLElement).click();
    expect(writeText).toHaveBeenCalledWith("audit_spacing");
  });
});
