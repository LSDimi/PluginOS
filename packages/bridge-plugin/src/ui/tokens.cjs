/**
 * Shared design tokens for bootloader.html and ui.html.
 * Injected into both at webpack build time via HtmlWebpackPlugin.templateParameters.
 * Single source of truth for v4 palette, typography, and spacing.
 */
module.exports = `
:root {
  --po-bg: #ffffff;
  --po-surface: #ffffff;
  --po-step-bg: #fafafa;
  --po-border: #ececec;
  --po-text: #1a1a1a;
  --po-text-sub: #6b7280;
  --po-text-muted: #9ca3af;
  --po-code-bg: #ffffff;
  --po-btn-primary-bg: #18181b;
  --po-btn-primary-fg: #ffffff;
  --po-btn-secondary-bg: #f4f4f5;
  --po-btn-secondary-fg: #18181b;
  --po-accent: #6366f1;
  --po-accent-soft: #f5f7fc;
  --po-success: #10b981;
  --po-success-soft: #ecfdf5;
  --po-success-text: #047857;
  --po-warn-soft: #fef3c7;
  --po-warn-text: #92400e;
  --po-error: #ef4444;
  --po-error-soft: #fef2f2;
  --po-error-text: #b91c1c;
  --po-running-soft: #eff6ff;
  --po-running-text: #1d4ed8;
  --po-radius: 8px;
  --po-radius-lg: 12px;
  --po-shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08);
  --po-focus: #0d99ff;
  --po-font: 'Inter', -apple-system, system-ui, -apple-system, "Helvetica Neue", sans-serif;
  --po-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}

[data-theme="dark"] {
  --po-bg: #1e1e1e;
  --po-surface: #2c2c2c;
  --po-step-bg: #222222;
  --po-border: #383838;
  --po-text: #f5f5f5;
  --po-text-sub: rgba(255,255,255,.55);
  --po-text-muted: rgba(255,255,255,.4);
  --po-code-bg: #1e1e1e;
  --po-btn-primary-bg: #ffffff;
  --po-btn-primary-fg: #18181b;
  --po-btn-secondary-bg: #383838;
  --po-btn-secondary-fg: #f5f5f5;
  --po-accent: #818cf8;
  --po-accent-soft: #2a2d3d;
  --po-success: #34d399;
  --po-success-soft: #053b2d;
  --po-success-text: #6ee7b7;
  --po-warn-soft: #3a2a05;
  --po-warn-text: #fde68a;
  --po-error: #f87171;
  --po-error-soft: #3a1414;
  --po-error-text: #fca5a5;
  --po-running-soft: #1e2a4a;
  --po-running-text: #93c5fd;
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
