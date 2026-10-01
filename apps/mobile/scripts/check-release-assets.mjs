import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const asset of new Set([expo.icon, expo.ios?.icon, expo.android?.icon])) {
  assert.equal(typeof asset, 'string', 'Every platform must name a release icon');
  const data = fs.readFileSync(path.join(root, asset));
  assert.ok(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${asset}: invalid PNG signature`);
  assert.equal(data.toString('ascii', 12, 16), 'IHDR');
  assert.equal(data.readUInt32BE(16), 1024, 'Icon width must be 1024');
  assert.equal(data.readUInt32BE(20), 1024, 'Icon height must be 1024');
  assert.equal(data[24], 8, 'Icon must use 8-bit channels');
  assert.equal(data[25], 2, 'App Store icon must be opaque RGB (no alpha)');
  console.log(`PASS ${asset}: 1024 x 1024 opaque PNG`);
}
