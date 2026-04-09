import type { OperationCategory } from "./types.js";

export const CATEGORY_DESCRIPTIONS: Record<OperationCategory, string> = {
  lint: "Linting & quality — style consistency, naming conventions, detached instances",
  accessibility: "Accessibility — contrast ratios, touch targets, WCAG compliance, color blindness",
  components: "Component management — find instances, swap, detach, override analysis",
  tokens: "Design tokens & styles — variable export, style audit, token usage",
  layout: "Layout & spacing — auto-layout audit, spacing consistency, fixed values",
  content: "Content population — lorem ipsum, data population, copy management",
  export: "Export & code — CSS extraction, SVG optimization, HTML structure",
  assets: "Asset insertion — icons, placeholder images, illustrations",
  annotations: "Annotations & docs — measurements, redlines, spacing annotations",
  colors: "Color management — palette extraction, generation, non-style color detection",
  typography: "Typography — text style audit, missing fonts, type scale generation",
  cleanup: "Cleanup & organization — remove hidden, rename, round values, dedup",
  data: "Data visualization — charts, tables, JSON population",
  custom: "Custom operations — user-defined via execute_figma fallback",
};
