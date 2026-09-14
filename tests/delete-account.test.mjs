import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeleteAccountHandler } from '../supabase/functions/delete-account/handler.mjs';

const request = (body, authorization = 'Bearer valid-token') => new Request('https://example.com/delete-account', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body),
});

test('deletion rejects unauthenticated requests before calling the admin API', async () => {
  let deleted = false;
  const handler = createDeleteAccountHandler({ getUser: async () => ({ data: { user: null }, error: 'invalid' }), deleteUser: async () => { deleted = true; return { error: null }; } });
  assert.equal((await handler(request({ confirmation: 'DELETE MY ACCOUNT' }, null))).status, 401);
  assert.equal((await handler(request({ confirmation: 'DELETE MY ACCOUNT' }))).status, 401);
  assert.equal(deleted, false);
});

test('deletion requires confirmation and cannot target another account', async () => {
  const ids = [];
  const handler = createDeleteAccountHandler({ getUser: async () => ({ data: { user: { id: 'authenticated-user' } }, error: null }), deleteUser: async id => { ids.push(id); return { error: null }; } });
  assert.equal((await handler(request({ user_id: 'victim' }))).status, 400);
  assert.deepEqual(ids, []);
  const result = await handler(request({ confirmation: 'DELETE MY ACCOUNT', user_id: 'victim' }));
  assert.equal(result.status, 200);
  assert.deepEqual(ids, ['authenticated-user']);
});

test('backend failure never reports successful deletion', async () => {
  const handler = createDeleteAccountHandler({ getUser: async () => ({ data: { user: { id: 'test' } }, error: null }), deleteUser: async () => ({ error: 'database error' }) });
  const response = await handler(request({ confirmation: 'DELETE MY ACCOUNT' }));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).deleted, undefined);
});
