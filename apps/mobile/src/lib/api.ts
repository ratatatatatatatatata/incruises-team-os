import { supabase } from './supabase';
export type { WorkspacePayload } from '../../../../app/team-os-data';
export type { StarterAnswers, StoredSuccessMap } from '../../../../lib/success-map/contracts';
export { plainMongolianText, actionSteps } from '../../../../lib/success-map/presentation';

const configuredOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://www.insuccess.net';
const origin = new URL(configuredOrigin);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
  throw new Error('EXPO_PUBLIC_WEB_ORIGIN must be an HTTPS origin');
}
export const webOrigin = origin.origin;
export class ApiError extends Error {
  constructor(message: string, public status: number, public detail: Record<string, unknown> = {}) { super(message); }
}

// No automatic mutation retries: an interrupted response may already be saved.
export async function api<T>(path: '/api/workspace' | '/api/success-map', body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new ApiError('Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү.', 401);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${webOrigin}${path}`, {
      method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(typeof result.error === 'string' ? result.error : 'Мэдээллийг авч чадсангүй. Дахин ачаална уу.', response.status, result);
    return result as T;
  } finally { clearTimeout(timeout); }
}
