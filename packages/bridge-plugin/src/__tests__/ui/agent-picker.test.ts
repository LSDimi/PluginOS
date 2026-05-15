// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { initAgentPicker, getCurrentAgent } from "../../ui/agent-picker";

function setupDom(selected: string | null = null) {
  document.body.innerHTML = `
    <div class="agents">
      <div class="agent" data-agent="claude-desktop">Desktop</div>
      <div class="agent" data-agent="claude-code">Code</div>
      <div class="agent" data-agent="other">Other</div>
    </div>
    <div class="agent-action" data-action-for="claude-desktop">CD action</div>
    <div class="agent-action" data-action-for="claude-code">CC action</div>
    <div class="agent-action" data-action-for="other">Other action</div>
  `;
  window.localStorage.clear();
  if (selected) {
    window.localStorage.setItem("pluginos.preferredAgent", selected);
  }
}

describe("agent picker", () => {
  beforeEach(() => setupDom());

  it("defaults to claude-desktop on first ever open", () => {
    initAgentPicker();
    expect(getCurrentAgent()).toBe("claude-desktop");
    expect(
      document.querySelector('.agent[data-agent="claude-desktop"]')?.classList.contains("on")
    ).toBe(true);
  });

  it("restores previously selected agent from storage", () => {
    setupDom("claude-code");
    initAgentPicker();
    expect(getCurrentAgent()).toBe("claude-code");
    expect(
      document.querySelector('.agent[data-agent="claude-code"]')?.classList.contains("on")
    ).toBe(true);
  });

  it("switches selection on click and persists", () => {
    initAgentPicker();
    const other = document.querySelector('.agent[data-agent="other"]') as HTMLElement;
    other.click();
    expect(getCurrentAgent()).toBe("other");
    expect(window.localStorage.getItem("pluginos.preferredAgent")).toBe("other");
  });

  it("toggles action visibility — only selected agent's action is shown", () => {
    initAgentPicker();
    const cc = document.querySelector('.agent[data-agent="claude-code"]') as HTMLElement;
    cc.click();
    expect((document.querySelector('[data-action-for="claude-code"]') as HTMLElement).hidden).toBe(
      false
    );
    expect(
      (document.querySelector('[data-action-for="claude-desktop"]') as HTMLElement).hidden
    ).toBe(true);
  });

  it("sets aria-checked on the selected card and clears it on others", () => {
    initAgentPicker();
    const cc = document.querySelector('.agent[data-agent="claude-code"]') as HTMLElement;
    cc.click();
    expect(cc.getAttribute("aria-checked")).toBe("true");
    expect(
      document.querySelector('.agent[data-agent="claude-desktop"]')?.getAttribute("aria-checked")
    ).toBe("false");
    expect(document.querySelector('.agent[data-agent="other"]')?.getAttribute("aria-checked")).toBe(
      "false"
    );
  });

  it("activates a card on Enter and Space keypress", () => {
    initAgentPicker();
    const other = document.querySelector('.agent[data-agent="other"]') as HTMLElement;
    other.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(getCurrentAgent()).toBe("other");

    const cc = document.querySelector('.agent[data-agent="claude-code"]') as HTMLElement;
    cc.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(getCurrentAgent()).toBe("claude-code");
  });
});
