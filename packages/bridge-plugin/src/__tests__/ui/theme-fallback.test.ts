// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKENS_PATH = resolve(__dirname, "../../ui/tokens.cjs");
const TOKENS_SOURCE = readFileSync(TOKENS_PATH, "utf-8");
// tokens.cjs exports a string literal via module.exports = `...`;
// extract the literal between the backticks for inspection.
const TOKENS_CSS: string = TOKENS_SOURCE.match(/module\.exports\s*=\s*`([\s\S]*?)`;/)?.[1] ?? "";

function injectStylesheet(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

function clearHead(): void {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
}

describe("theme fallback chain", () => {
  beforeEach(() => {
    clearHead();
  });

  it("--po-bg references --figma-color-bg with a hardcoded fallback", () => {
    injectStylesheet(TOKENS_CSS);
    expect(TOKENS_CSS).toContain("--po-bg: var(--figma-color-bg");
  });

  it("every primary token uses var(--figma-color-*) with a fallback", () => {
    const expected = [
      "--po-bg: var(--figma-color-bg",
      "--po-text: var(--figma-color-text",
      "--po-border: var(--figma-color-border",
    ];
    for (const fragment of expected) {
      expect(TOKENS_CSS).toContain(fragment);
    }
  });

  it('[data-theme="dark"] block still exists with non-empty values', () => {
    expect(TOKENS_CSS).toContain('[data-theme="dark"]');
    expect(TOKENS_CSS).toContain("#1e1e1e");
  });

  it("hardcoded fallbacks are still readable when Figma vars are absent", () => {
    injectStylesheet(TOKENS_CSS);
    document.documentElement.setAttribute("data-theme", "dark");
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--po-bg").trim();
    expect(bg.length).toBeGreaterThan(0);
  });
});
