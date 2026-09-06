const INTERNAL_AUTH_ORIGIN = "https://auth-redirect.invalid";

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

/**
 * Build an internal auth redirect without placing Unicode directly in a response
 * header. URLSearchParams performs the required percent-encoding consistently.
 */
export function authMessagePath(path, kind, message) {
  if (kind !== "error" && kind !== "message") {
    throw new TypeError("Unsupported auth message kind");
  }

  const target = new URL(path, INTERNAL_AUTH_ORIGIN);
  if (
    target.origin !== INTERNAL_AUTH_ORIGIN ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /\\|%5c/i.test(path)
  ) {
    throw new TypeError("Auth message path must be internal");
  }

  target.searchParams.set(kind, String(message));
  return `${target.pathname}${target.search}${target.hash}`;
}
