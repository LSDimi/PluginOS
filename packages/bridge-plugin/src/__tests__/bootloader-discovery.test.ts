import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tripwire for the bootloader's server-selection policy.
 *
 * The bootloader fetches ui.html over HTTP from the first responding port.
 * Legacy (pre-0.5.0) servers serve /ui.html but NOT /state.json, so a blind
 * first-200-wins scan loads a month-old UI from a zombie server squatting on
 * port 9500. The bootloader must probe /state.json first and prefer ports
 * that answer it. These are source-level assertions because the bootloader
 * script is inline ES5 with no module surface to unit-test.
 */
describe("bootloader discovery policy", () => {
  const source = readFileSync(join(__dirname, "..", "bootloader.html"), "utf8");

  it("probes /state.json as part of server selection", () => {
    expect(source).toContain("+ '/state.json'");
  });

  it("ranks discovery-capable ports before the ui.html fetch", () => {
    const stateFetchIdx = source.indexOf("+ '/state.json'");
    const uiFetchIdx = source.indexOf("+ '/ui.html'");
    expect(stateFetchIdx).toBeGreaterThan(-1);
    expect(uiFetchIdx).toBeGreaterThan(-1);
    expect(stateFetchIdx).toBeLessThan(uiFetchIdx);
  });

  it("never falls back to fetching ui.html from non-discovery (legacy) servers", () => {
    // A legacy server would happily serve its stale ui.html, and that stale
    // UI then "connects" to the legacy server — the user sees a month-old
    // interface. If no discovery-capable server is up, the bootloader must
    // keep its own setup screen (which has instructions and a Retry button).
    expect(source).toContain("if (!ranked.length) return;");
  });
});
