/**
 * Shared design tokens for bootloader.html and ui.html.
 * Injected into both at webpack build time via HtmlWebpackPlugin.templateParameters.
 * Single source of truth for v4 palette, typography, and spacing.
 *
 * Theme resolution (three-tier fallback chain):
 *   1. Figma's injected --figma-color-* vars (when running inside Figma with themeColors: true)
 *   2. Hardcoded literals (the fallback after the comma in each var() call)
 *   3. data-theme="dark" overrides the fallback literals for non-Figma contexts
 *      (happy-dom tests, future force-toggle UI, etc.)
 *
 * Inside Figma: tier 1 wins, auto-tracks editor theme. theme.ts is dormant.
 * Outside Figma: tier 1 is undefined, fallback literals apply. data-theme can override.
 */
module.exports = `
:root {
  --po-bg: var(--figma-color-bg, #ffffff);
  --po-surface: var(--figma-color-bg-secondary, #ffffff);
  --po-step-bg: var(--figma-color-bg-tertiary, #fafafa);
  --po-border: var(--figma-color-border, #ececec);
  --po-text: var(--figma-color-text, #1a1a1a);
  --po-text-sub: var(--figma-color-text-secondary, #6b7280);
  --po-text-muted: var(--figma-color-text-tertiary, #9ca3af);
  --po-code-bg: var(--figma-color-bg, #ffffff);
  --po-btn-primary-bg: var(--figma-color-bg-brand, #18181b);
  --po-btn-primary-fg: var(--figma-color-text-onbrand, #ffffff);
  --po-btn-secondary-bg: var(--figma-color-bg-secondary, #f4f4f5);
  --po-btn-secondary-fg: var(--figma-color-text, #18181b);
  --po-accent: var(--figma-color-bg-brand, #6366f1);
  --po-accent-soft: #f5f7fc;
  --po-success: var(--figma-color-bg-success, #10b981);
  --po-success-soft: var(--figma-color-bg-success-secondary, #ecfdf5);
  --po-success-text: var(--figma-color-text-success, #047857);
  --po-warn-soft: var(--figma-color-bg-warning-secondary, #fef3c7);
  --po-warn-text: var(--figma-color-text-warning, #92400e);
  --po-error: var(--figma-color-bg-danger, #ef4444);
  --po-error-soft: var(--figma-color-bg-danger-secondary, #fef2f2);
  --po-error-text: var(--figma-color-text-danger, #b91c1c);
  --po-running-soft: #eff6ff;
  --po-running-text: var(--figma-color-text-component, #1d4ed8);
  --po-radius: 8px;
  --po-radius-lg: 12px;
  --po-shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08);
  --po-focus: var(--figma-color-border-brand, #0d99ff);
  --po-font: 'Inter', -apple-system, system-ui, -apple-system, "Helvetica Neue", sans-serif;
  --po-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}

[data-theme="dark"] {
  --po-bg: var(--figma-color-bg, #1e1e1e);
  --po-surface: var(--figma-color-bg-secondary, #2c2c2c);
  --po-step-bg: var(--figma-color-bg-tertiary, #222222);
  --po-border: var(--figma-color-border, #383838);
  --po-text: var(--figma-color-text, #f5f5f5);
  --po-text-sub: var(--figma-color-text-secondary, rgba(255,255,255,.55));
  --po-text-muted: var(--figma-color-text-tertiary, rgba(255,255,255,.4));
  --po-code-bg: var(--figma-color-bg, #1e1e1e);
  --po-btn-primary-bg: var(--figma-color-bg-brand, #ffffff);
  --po-btn-primary-fg: var(--figma-color-text-onbrand, #18181b);
  --po-btn-secondary-bg: var(--figma-color-bg-secondary, #383838);
  --po-btn-secondary-fg: var(--figma-color-text, #f5f5f5);
  --po-accent: var(--figma-color-bg-brand, #818cf8);
  --po-accent-soft: #2a2d3d;
  --po-success: var(--figma-color-bg-success, #34d399);
  --po-success-soft: var(--figma-color-bg-success-secondary, #053b2d);
  --po-success-text: var(--figma-color-text-success, #6ee7b7);
  --po-warn-soft: var(--figma-color-bg-warning-secondary, #3a2a05);
  --po-warn-text: var(--figma-color-text-warning, #fde68a);
  --po-error: var(--figma-color-bg-danger, #f87171);
  --po-error-soft: var(--figma-color-bg-danger-secondary, #3a1414);
  --po-error-text: var(--figma-color-text-danger, #fca5a5);
  --po-running-soft: #1e2a4a;
  --po-running-text: var(--figma-color-text-component, #93c5fd);
  --po-shadow: 0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.5);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--po-font);
  font-size: 13px;
  background: var(--po-bg);
  color: var(--po-text);
  -webkit-font-smoothing: antialiased;
}
button { font-family: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--po-focus); outline-offset: 2px; }
[role="button"]:focus-visible, .agent:focus-visible { outline: 2px solid var(--po-focus); outline-offset: 2px; }
.hidden { display: none !important; }
`;
