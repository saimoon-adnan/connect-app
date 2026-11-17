export function describeError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [o.message, o.code && `code ${o.code}`, o.details, o.hint].filter(Boolean);
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(e); } catch {}
  }
  return String(e);
}