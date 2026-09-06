import { safeNextPath } from "./redirects.mjs";

const LOGIN_ORIGIN = "https://login.insuccess.invalid";

/**
 * Preserve a private route through sign-in without allowing an external redirect.
 */
export function loginPath(nextPath) {
  const safePath = safeNextPath(nextPath, LOGIN_ORIGIN);
  return safePath === "/" ? "/login" : `/login?next=${encodeURIComponent(safePath)}`;
}
