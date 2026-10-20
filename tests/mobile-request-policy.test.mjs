import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, isSameOrigin, RequestAuthError } from '../lib/supabase/request-policy.ts';

test('native bearer parsing fails closed and never falls back to cookies', () => {
  assert.equal(bearerToken(null), null);
  assert.equal(bearerToken('Bearer header.payload.signature'), 'header.payload.signature');
  for (const invalid of ['', 'Basic x', 'Bearer', 'Bearer bad', 'Bearer a.b.c extra', 'Bearer a.b.c\n']) {
    assert.throws(() => bearerToken(invalid), RequestAuthError);
  }
});
test('browser origin guard remains enforced; malformed and spoofed headers fail closed', () => {
  const request = (headers) => new Request('https://www.insuccess.net/api/workspace', { headers });
  assert.equal(isSameOrigin(request({})), true);
  assert.equal(isSameOrigin(request({ origin: 'https://www.insuccess.net' })), true);
  for (const origin of ['null', 'bad', 'https://evil.example', 'http://www.insuccess.net']) {
    assert.equal(isSameOrigin(request({ origin, 'x-forwarded-host': 'evil.example' })), false);
  }
});
