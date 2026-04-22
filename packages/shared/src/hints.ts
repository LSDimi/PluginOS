/**
 * Attach optional `_hint` / `_next_hints` metadata to an operation result.
 *
 * `_hint`: human-readable guidance for the agent about interpreting this
 * particular response (e.g. "Nothing is selected — pass scope: 'page'...").
 *
 * `_next_hints`: suggested next operations to chain after this one
 * (e.g. ["lint_detached", "check_contrast"] after lint_styles).
 *
 * Both fields are omitted when not provided so they don't pollute responses.
 */
export function withHint<T extends object>(
  payload: T,
  hint?: string,
  nextHints?: string[]
): T & { _hint?: string; _next_hints?: string[] } {
  const out: T & { _hint?: string; _next_hints?: string[] } = { ...payload };
  if (hint) out._hint = hint;
  if (nextHints && nextHints.length > 0) out._next_hints = nextHints;
  return out;
}
