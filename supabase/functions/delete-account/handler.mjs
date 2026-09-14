/** @param {{ getUser: (token: string) => Promise<{data: {user: {id: string} | null}, error: unknown}>, deleteUser: (id: string) => Promise<{error: unknown}> }} deps */
export function createDeleteAccountHandler(deps) {
  /** @param {Request} request */
  return async (request) => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://insuccess.net',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };
    /** @param {number} status @param {object} value */
    const reply = (status, value) => new Response(JSON.stringify(value), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    const match = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i);
    if (!match) return reply(401, { error: 'Authentication required' });
    try {
      const { data, error } = await deps.getUser(match[1]);
      if (error || !data.user) return reply(401, { error: 'Authentication required' });
      const body = await request.json().catch(() => null);
      if (body?.confirmation !== 'DELETE MY ACCOUNT') return reply(400, { error: 'Explicit confirmation required' });
      // The authenticated identity is the only deletion target. Ignore all client-supplied IDs.
      const result = await deps.deleteUser(data.user.id);
      if (result.error) return reply(500, { error: 'Unable to delete account. Please try again.' });
      return reply(200, { deleted: true });
    } catch {
      return reply(500, { error: 'Unable to delete account. Please try again.' });
    }
  };
}
