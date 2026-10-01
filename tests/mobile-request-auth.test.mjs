import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../lib/supabase/request-policy.ts';

function compile({ rejected = false, cookieId = 'cookie-user' } = {}) {
  const events = [];
  const code = ts.transpileModule(fs.readFileSync(new URL('../lib/supabase/request-auth.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const native = { auth: { getUser: async token => { events.push(['verify', token]); return { data: { user: rejected ? null : { id: 'verified-member' } }, error: rejected ? new Error('expired') : null }; } } };
  const cookie = { auth: { getClaims: async () => { events.push(['cookieClaims']); return { data: { claims: { sub: cookieId } }, error: null }; } } };
  const mocks = {
    '@supabase/supabase-js': { createClient: (url, key, options) => { events.push(['client', url, key, options]); return native; } },
    './server': { createClient: async () => { events.push(['cookieClient']); return cookie; } },
    './config': { getSupabaseConfig: () => ({ url: 'https://synthetic.supabase.co', publishableKey: 'synthetic-publishable-test' }) },
    './request-policy': policy,
  };
  const mod = { exports: {} };
  vm.runInNewContext(code, { exports: mod.exports, module: mod, require: name => { assert.ok(name in mocks); return mocks[name]; } });
  return { auth: mod.exports.requestAuth, events, native, cookie };
}
test('bearer identity comes from Auth verification and RLS uses exactly that JWT', async () => {
  const { auth, events, native } = compile();
  const result = await auth(new Request('https://example.test/api/workspace', { headers: { authorization: 'Bearer head.body.signature', cookie: 'malicious-or-stale-cookie' } }));
  assert.equal(result.userId, 'verified-member'); assert.equal(result.supabase, native);
  assert.equal(events[0][3].global.headers.Authorization, 'Bearer head.body.signature');
  assert.equal(events[0][3].auth.persistSession, false);
  assert.deepEqual(events[1], ['verify', 'head.body.signature']);
  assert.equal(events.length, 2);
});
test('invalid or expired bearer never falls back to valid cookie session', async () => {
  const { auth, events } = compile({ rejected: true });
  await assert.rejects(auth(new Request('https://example.test', { headers: { authorization: 'Bearer head.body.signature' } })), policy.RequestAuthError);
  assert.equal(events.some(e => e[0] === 'cookieClient'), false);
  const malformed = compile();
  await assert.rejects(malformed.auth(new Request('https://example.test', { headers: { authorization: 'Basic secret' } })), policy.RequestAuthError);
  assert.equal(malformed.events.length, 0);
});
test('existing cookie clients still use verified claims, not untrusted session payload', async () => {
  const { auth, cookie, events } = compile();
  const result = await auth(new Request('https://example.test'));
  assert.equal(result.userId, 'cookie-user'); assert.equal(result.supabase, cookie);
  assert.deepEqual(events, [['cookieClient'], ['cookieClaims']]);
});
