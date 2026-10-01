import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from './server';
import { getSupabaseConfig } from './config';
import { bearerToken, RequestAuthError } from './request-policy';

/** Both clients use the member JWT and publishable key: RLS remains authoritative. */
export async function requestAuth(request: Request) {
  const token = bearerToken(request.headers.get('authorization'));
  if (token !== null) {
    const config = getSupabaseConfig();
    if (!config) throw new Error('Supabase environment is not configured');
    const supabase = createSupabaseClient(config.url, config.publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new RequestAuthError('Нэвтрэх шаардлагатай.');
    return { supabase, userId: data.user.id };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== 'string') throw new RequestAuthError('Нэвтрэх шаардлагатай.');
  return { supabase, userId };
}
