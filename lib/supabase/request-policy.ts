export class RequestAuthError extends Error {
  readonly status = 401;
}

/** A supplied but malformed credential must never fall back to browser cookies. */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match || match[0] !== header || header.length > 16384) throw new RequestAuthError('Нэвтрэх шаардлагатай.');
  return match[1];
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Native clients do not send browser cookies or Origin.
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
