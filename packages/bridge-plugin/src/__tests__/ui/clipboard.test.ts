// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { copyText } from "../../ui/clipboard.js";

/**
 * Figma plugin iframes run on a null origin where navigator.clipboard is
 * permission-denied — the async Clipboard API rejects even in a click
 * handler. copyText must fall back to the textarea + execCommand path.
 */
describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses navigator.clipboard when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ok = await copyText("hello");
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;

    const ok = await copyText("fallback me");
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    // The temporary textarea must not linger in the DOM.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to execCommand when navigator.clipboard is missing", async () => {
    vi.stubGlobal("navigator", {});
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;

    const ok = await copyText("no api");
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns false when both paths fail", async () => {
    vi.stubGlobal("navigator", {});
    const exec = vi.fn().mockReturnValue(false);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;

    const ok = await copyText("nope");
    expect(ok).toBe(false);
  });
});
