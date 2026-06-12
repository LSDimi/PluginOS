/**
 * Clipboard write that works inside Figma's plugin iframe.
 *
 * The iframe runs on a null origin, where the async Clipboard API
 * (navigator.clipboard.writeText) is permission-denied even inside a user
 * gesture. The legacy textarea + document.execCommand("copy") path still
 * works there, so it serves as the fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  // Keep it out of view without display:none (which breaks selection).
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok: boolean;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
