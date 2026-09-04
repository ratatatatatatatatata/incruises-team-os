const LOCAL_APP_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const url = new URL(candidate);
    const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

    if (url.protocol !== "https:" && !isLocalHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve only operator-controlled deployment values. Request Host headers are
 * intentionally excluded so a forged request cannot choose the email link host.
 */
export function passwordRecoveryOrigin(env = process.env) {
  const explicitOrigin = normalizeOrigin(env.PASSWORD_RESET_ORIGIN);
  if (explicitOrigin) return explicitOrigin;

  const deploymentOrigin = normalizeOrigin(env.VERCEL_URL);
  if (deploymentOrigin) return deploymentOrigin;

  const productionOrigin = normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (productionOrigin) return productionOrigin;

  if (env.NODE_ENV !== "production") return LOCAL_APP_ORIGIN;
  return null;
}

export function passwordRecoveryRedirectUrl(env = process.env) {
  const origin = passwordRecoveryOrigin(env);
  if (!origin) return null;

  const callback = new URL("/auth/confirm", origin);
  callback.searchParams.set("next", "/auth/set-password?flow=recovery");
  return callback.toString();
}
