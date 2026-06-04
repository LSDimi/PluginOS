import { describe, it, expect } from "vitest";
import {
  pillStateFor,
  pillTextFor,
  formatElapsed,
  type AppState,
} from "../ui/render-ui.js";

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
