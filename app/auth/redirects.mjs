/**
 * Accept only same-origin relative paths from auth links.
 * Backslashes are rejected because some clients normalize them into host separators.
 */
export function safeNextPath(value, origin) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (/\\|%5c/i.test(value)) return "/";

  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    if (target.origin !== base.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
