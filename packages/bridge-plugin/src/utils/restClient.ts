const BASE = "https://api.figma.com";

const ERROR_BY_STATUS: Record<number, string> = {
  401: "PAT invalid or expired — regenerate and update it in the Setup tab",
  403: "PAT lacks a required scope (file_comments / file_metadata)",
  404: "File not found, or the PAT's account lacks access to it",
  429: "Rate limited by the Figma API — wait a moment and retry",
};

export async function figmaRest(
  path: string,
  token: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  let res: { ok: boolean; status: number; json: () => Promise<any> };
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "X-Figma-Token": token,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    return { ok: false, error: "Network request to api.figma.com failed — check connectivity" };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: ERROR_BY_STATUS[res.status] ?? `Figma API error (HTTP ${res.status})`,
    };
  }
  return { ok: true, data: await res.json() };
}
