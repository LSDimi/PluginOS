import { getPreferredAgent, setPreferredAgent, type PreferredAgent } from "./storage";

const DEFAULT_AGENT: PreferredAgent = "claude-desktop";

let current: PreferredAgent = DEFAULT_AGENT;

export function getCurrentAgent(): PreferredAgent {
  return current;
}

export function initAgentPicker(): void {
  current = getPreferredAgent() ?? DEFAULT_AGENT;
  renderSelection(current);
  document.querySelectorAll<HTMLElement>(".agent[data-agent]").forEach((el) => {
    el.addEventListener("click", () => {
      const agent = el.dataset.agent as PreferredAgent;
      select(agent);
    });
  });
}

function select(agent: PreferredAgent): void {
  current = agent;
  setPreferredAgent(agent);
  renderSelection(agent);
}

function renderSelection(agent: PreferredAgent): void {
  document.querySelectorAll<HTMLElement>(".agent[data-agent]").forEach((el) => {
    el.classList.toggle("on", el.dataset.agent === agent);
  });
  document.querySelectorAll<HTMLElement>(".agent-action[data-action-for]").forEach((el) => {
    el.hidden = el.dataset.actionFor !== agent;
  });
}
