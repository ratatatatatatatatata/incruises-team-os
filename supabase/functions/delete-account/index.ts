import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { createDeleteAccountHandler } from './handler.mjs';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createDeleteAccountHandler({
  getUser: token => admin.auth.getUser(token),
  deleteUser: id => admin.auth.admin.deleteUser(id),
}));
