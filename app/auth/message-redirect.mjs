const REDIRECT_BASE = "https://auth-redirect.invalid";

/**
 * Build a same-origin relative redirect whose query string is safe to place in
 * an HTTP Location header. URLSearchParams percent-encodes Mongolian text.
 */
export function authMessageRedirectPath(path, kind, message) {
  if (kind !== "error" && kind !== "message") {
    throw new TypeError("Unsupported auth redirect message kind");
  }

  const target = new URL(path, REDIRECT_BASE);
  if (target.origin !== REDIRECT_BASE || !path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("Auth redirect must stay on the current origin");
  }

  target.searchParams.set(kind, message);
  return `${target.pathname}${target.search}${target.hash}`;
}
