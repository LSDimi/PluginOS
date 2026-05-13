// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { getPreferredAgent, setPreferredAgent, getLastPort, setLastPort } from "../../ui/storage";

describe("storage wrapper", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when no preferred agent set", () => {
    expect(getPreferredAgent()).toBeNull();
  });

  it("persists preferred agent", () => {
    setPreferredAgent("claude-code");
    expect(getPreferredAgent()).toBe("claude-code");
  });

  it("rejects invalid agent values", () => {
    window.localStorage.setItem("pluginos.preferredAgent", "garbage");
    expect(getPreferredAgent()).toBeNull();
  });

  it("persists last port", () => {
    setLastPort(9503);
    expect(getLastPort()).toBe(9503);
  });

  it("returns null when last port is non-numeric", () => {
    window.localStorage.setItem("pluginos.lastConnectedPort", "abc");
    expect(getLastPort()).toBeNull();
  });
});
