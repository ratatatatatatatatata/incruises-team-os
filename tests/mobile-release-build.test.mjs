import test from 'node:test';
import assert from 'node:assert/strict';
import buildCheck from '../apps/mobile/scripts/check-eas-build.cjs';
const build = {
  id: '11111111-1111-4111-8111-111111111111', platform: 'IOS', status: 'FINISHED',
  gitCommitHash: 'synthetic-test-commit', app: { id: 'ba7265c8-1483-4b4d-bc67-ef96e0dbd427' },
  appIdentifier: 'com.insuccess.teamos', appVersion: '1.0.1', isForIosSimulator: false,
  artifacts: { applicationArchiveUrl: 'https://example.test/synthetic-build.ipa' },
};
test('release gate permits only the exact successful iOS app build', () => {
  assert.equal(buildCheck.verifiedBuildId([build], build.gitCommitHash), build.id);
  for (const patch of [{ status: 'ERRORED' }, { gitCommitHash: 'old' }, { platform: 'ANDROID' }, { app: { id: 'another-project' } }, { appVersion: '1.0.0' }, { appIdentifier: 'wrong' }, { isForIosSimulator: true }, { artifacts: {} }]) {
    assert.throws(() => buildCheck.verifiedBuildId([{ ...build, ...patch }], build.gitCommitHash));
  }
  assert.throws(() => buildCheck.verifiedBuildId([build, build], build.gitCommitHash));
});
