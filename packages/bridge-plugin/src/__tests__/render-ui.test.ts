// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { pillStateFor, pillTextFor, formatElapsed, type AppState } from "../ui/render-ui.js";
import { renderUI } from "../ui/render-ui.js";

describe("pillStateFor", () => {
  it("returns kind for non-connected variants", () => {
    expect(pillStateFor({ kind: "disconnected" })).toBe("disconnected");
    expect(pillStateFor({ kind: "connecting", lastKnownPort: 9500 })).toBe("connecting");
    expect(
      pillStateFor({
        kind: "mismatch",
        reason: "x",
        serverVersion: "0.4.3",
        pluginVersion: "0.4.2",
      })
    ).toBe("mismatch");
  });

  it("returns 'running' when connected with a running op", () => {
    expect(
      pillStateFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: { name: "execute_figma", paramsPreview: "", startedAt: 0 },
      })
    ).toBe("running");
  });

  it("returns 'connected' when connected and idle", () => {
    expect(
      pillStateFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: null,
      })
    ).toBe("connected");
  });
});

describe("pillTextFor", () => {
  it("returns user-facing strings per state", () => {
    expect(pillTextFor({ kind: "disconnected" })).toBe("Not connected");
    expect(pillTextFor({ kind: "connecting", lastKnownPort: null })).toBe("Connecting…");
    expect(
      pillTextFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: null,
      })
    ).toBe("Connected");
  });

  it("includes the op name when running", () => {
    expect(
      pillTextFor({
        kind: "connected",
        file: { name: "F", key: "k" },
        port: 9500,
        running: { name: "lint_styles", paramsPreview: "", startedAt: 0 },
      })
    ).toBe("Running lint_styles");
  });

  it("returns 'Update needed' for mismatch", () => {
    expect(
      pillTextFor({
        kind: "mismatch",
        reason: "x",
        serverVersion: "0.4.3",
        pluginVersion: "0.4.2",
      })
    ).toBe("Update needed");
  });
});

describe("formatElapsed", () => {
  it("shows seconds with one decimal under a minute", () => {
    expect(formatElapsed(500)).toBe("0.5s elapsed");
    expect(formatElapsed(12_345)).toBe("12.3s elapsed");
  });

  it("shows minutes + seconds at or above one minute", () => {
    expect(formatElapsed(60_000)).toBe("1m 0s elapsed");
    expect(formatElapsed(125_000)).toBe("2m 5s elapsed");
  });

  it("handles zero correctly", () => {
    expect(formatElapsed(0)).toBe("0.0s elapsed");
  });
});

function setupDom(): void {
  document.body.innerHTML = `
    <div id="status-pill"><span id="status-text">—</span></div>
    <button id="btn-setup" hidden>⚙ Setup</button>
    <section id="view-disconnected">
      <button id="btn-check">Check for server</button>
    </section>
    <section id="view-connected" hidden>
      <span id="file-name">—</span>
      <span id="port-url">—</span>
      <span id="ops-count">—</span>
      <div id="running-block" hidden>
        <span id="run-op">—</span>
        <span id="run-params">—</span>
        <span id="run-elapsed">—</span>
      </div>
      <div id="idle-block"></div>
    </section>
    <section id="view-mismatch" hidden>
      <span id="mismatch-text">—</span>
    </section>
  `;
}

describe("renderUI", () => {
  beforeEach(() => setupDom());

  it("shows disconnected view + pill on disconnected state", () => {
    renderUI({ kind: "disconnected" });
    expect(document.getElementById("view-disconnected")!.hidden).toBe(false);
    expect(document.getElementById("view-connected")!.hidden).toBe(true);
    expect(document.getElementById("view-mismatch")!.hidden).toBe(true);
    expect(document.getElementById("status-pill")!.dataset.state).toBe("disconnected");
    expect(document.getElementById("status-text")!.textContent).toBe("Not connected");
  });

  it("shows disconnected view + 'Connecting…' pill on connecting state", () => {
    renderUI({ kind: "connecting", lastKnownPort: 9500 });
    expect(document.getElementById("view-disconnected")!.hidden).toBe(false);
    expect(document.getElementById("status-pill")!.dataset.state).toBe("connecting");
    expect(document.getElementById("status-text")!.textContent).toBe("Connecting…");
  });

  it("disables btn-check and shows 'Scanning…' while connecting", () => {
    renderUI({ kind: "connecting", lastKnownPort: null });
    const btn = document.getElementById("btn-check") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("Scanning…");
  });

  it("re-enables btn-check with original label when disconnected", () => {
    renderUI({ kind: "connecting", lastKnownPort: null });
    renderUI({ kind: "disconnected" });
    const btn = document.getElementById("btn-check") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Check for server");
  });

  it("renders the operations count when provided", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
      opsCount: 37,
    });
    expect(document.getElementById("ops-count")!.textContent).toBe("37");
  });

  it("renders an em dash when the operations count is unknown", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
    });
    expect(document.getElementById("ops-count")!.textContent).toBe("—");
  });

  it("shows the setup toggle only when connected, labeled '⚙ Setup'", () => {
    renderUI({ kind: "disconnected" });
    expect(document.getElementById("btn-setup")!.hidden).toBe(true);

    renderUI({ kind: "connected", file: { name: "F", key: "k" }, port: 9500, running: null });
    const btn = document.getElementById("btn-setup")!;
    expect(btn.hidden).toBe(false);
    expect(btn.textContent).toBe("⚙ Setup");
  });

  it("setupOpen shows the setup panel over the connected view and flips the label", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
      setupOpen: true,
    });
    expect(document.getElementById("view-disconnected")!.hidden).toBe(false);
    expect(document.getElementById("view-connected")!.hidden).toBe(true);
    expect(document.getElementById("btn-setup")!.textContent).toBe("◀ Done");
    const check = document.getElementById("btn-check") as HTMLButtonElement;
    expect(check.hidden).toBe(true);
  });

  it("closing setup restores the connected view", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
      setupOpen: true,
    });
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
      setupOpen: false,
    });
    expect(document.getElementById("view-connected")!.hidden).toBe(false);
    expect(document.getElementById("view-disconnected")!.hidden).toBe(true);
    expect(document.getElementById("btn-setup")!.textContent).toBe("⚙ Setup");
  });

  it("shows connected view with idle-block when running is null", () => {
    renderUI({
      kind: "connected",
      file: { name: "MyFile", key: "abc" },
      port: 9500,
      running: null,
    });
    expect(document.getElementById("view-connected")!.hidden).toBe(false);
    expect(document.getElementById("idle-block")!.hidden).toBe(false);
    expect(document.getElementById("running-block")!.hidden).toBe(true);
    expect(document.getElementById("file-name")!.textContent).toBe("MyFile");
    expect(document.getElementById("port-url")!.textContent).toBe("localhost:9500");
  });

  it("shows connected view with running-block when running is set", () => {
    const startedAt = Date.now() - 2500;
    renderUI({
      kind: "connected",
      file: { name: "MyFile", key: "abc" },
      port: 9500,
      running: { name: "execute_figma", paramsPreview: "{ code: ... }", startedAt },
    });
    expect(document.getElementById("running-block")!.hidden).toBe(false);
    expect(document.getElementById("idle-block")!.hidden).toBe(true);
    expect(document.getElementById("run-op")!.textContent).toBe("execute_figma");
    expect(document.getElementById("run-params")!.textContent).toBe("{ code: ... }");
    expect(document.getElementById("run-elapsed")!.textContent).toMatch(/elapsed/);
    expect(document.getElementById("status-text")!.textContent).toBe("Running execute_figma");
  });

  it("shows mismatch view with formatted text", () => {
    renderUI({
      kind: "mismatch",
      reason: "Reinstall the plugin.",
      serverVersion: "0.4.4",
      pluginVersion: "0.4.2",
    });
    expect(document.getElementById("view-mismatch")!.hidden).toBe(false);
    expect(document.getElementById("mismatch-text")!.textContent).toContain("0.4.4");
    expect(document.getElementById("mismatch-text")!.textContent).toContain("0.4.2");
    expect(document.getElementById("mismatch-text")!.textContent).toContain(
      "Reinstall the plugin."
    );
  });

  it("hides running-block defensively when not connected", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: { name: "op", paramsPreview: "", startedAt: Date.now() },
    });
    expect(document.getElementById("running-block")!.hidden).toBe(false);

    renderUI({ kind: "disconnected" });
    expect(document.getElementById("running-block")!.hidden).toBe(true);
  });

  it("regression: disconnect→reconnect cycle does not leak running-block visibility", () => {
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: { name: "op", paramsPreview: "", startedAt: Date.now() },
    });
    renderUI({ kind: "disconnected" });
    renderUI({
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
    });
    expect(document.getElementById("running-block")!.hidden).toBe(true);
    expect(document.getElementById("idle-block")!.hidden).toBe(false);
  });

  it("is idempotent — calling with same state twice yields the same DOM", () => {
    const state: AppState = {
      kind: "connected",
      file: { name: "F", key: "k" },
      port: 9500,
      running: null,
    };
    renderUI(state);
    const firstHtml = document.body.innerHTML;
    renderUI(state);
    expect(document.body.innerHTML).toBe(firstHtml);
  });
});
