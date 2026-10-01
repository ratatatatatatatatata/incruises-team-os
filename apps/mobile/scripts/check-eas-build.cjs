const fs = require('node:fs');
const assert = require('node:assert/strict');
function verifiedBuildId(result, expectedSha) {
  const builds = Array.isArray(result) ? result : [result];
  assert.equal(builds.length, 1, 'Exactly one build is required');
  const build = builds[0];
  assert.equal(build.platform, 'IOS', 'Expected iOS build');
  assert.equal(build.status, 'FINISHED', 'Build must finish successfully');
  assert.equal(build.gitCommitHash, expectedSha, 'Build commit does not match checkout');
  assert.equal(build.app?.id, 'ba7265c8-1483-4b4d-bc67-ef96e0dbd427', 'Wrong Expo project');
  assert.equal(build.appIdentifier, 'com.insuccess.teamos', 'Wrong bundle identifier');
  assert.notEqual(build.isForIosSimulator, true, 'A simulator build cannot be submitted');
  assert.equal(build.appVersion, require('../app.json').expo.version, 'Wrong release version');
  assert.match(build.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.ok(build.artifacts?.applicationArchiveUrl, 'No installable artifact');
  return build.id;
}
module.exports = { verifiedBuildId };
if (require.main === module) {
  process.stdout.write(verifiedBuildId(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]));
}
