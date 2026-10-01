import test from 'node:test';
import assert from 'node:assert/strict';
import { secureSessionStorage } from '../apps/mobile/src/lib/secure-session.ts';

function store() {
  const values = new Map();
  return { values, getItemAsync: async key => values.get(key) ?? null, setItemAsync: async (key, value) => { assert.ok(Buffer.byteLength(value) <= 2048); values.set(key, Buffer.from(value).toString('utf8')); }, deleteItemAsync: async key => { values.delete(key); } };
}
test('large Unicode sessions roundtrip; replacement and signout clear previous parts', async () => {
  const native = store(); const auth = secureSessionStorage(native);
  assert.equal(await auth.getItem('test'), null);
  const value = 'Монгол😀'.repeat(800);
  await auth.setItem('test', value); assert.equal(await auth.getItem('test'), value);
  await auth.setItem('test', 'replacement'); assert.equal(await auth.getItem('test'), 'replacement');
  assert.equal(native.values.size, 2);
  await auth.removeItem('test'); assert.equal(native.values.size, 0); assert.equal(await auth.getItem('test'), null);
});
test('failed writes preserve previously committed session', async () => {
  const native = store(); const auth = secureSessionStorage(native);
  await auth.setItem('test', 'previous');
  native.setItemAsync = async () => { throw new Error('Device locked'); };
  await assert.rejects(auth.setItem('test', 'next'), /Device locked/);
  assert.equal(await auth.getItem('test'), 'previous');
});
test('missing chunks and malformed manifests fail closed', async () => {
  const native = store(); const auth = secureSessionStorage(native);
  native.values.set('test.manifest', JSON.stringify({ version: 'missing', count: 1 }));
  await assert.rejects(auth.getItem('test'), /incomplete/);
  native.values.set('test.manifest', JSON.stringify({ version: 'a', count: 9999999 }));
  await assert.rejects(auth.getItem('test'), /manifest/);
});
