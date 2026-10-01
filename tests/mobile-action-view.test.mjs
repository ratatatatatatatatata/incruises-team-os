import test from 'node:test';
import assert from 'node:assert/strict';
import { actionView, localSchedule } from '../apps/mobile/src/lib/action-view.ts';
test('mentor reason is never rendered as the first task; older actions keep their first step', () => {
  const detail = 'Таны явцад тулгуурласан. Нэг мөр бич. Нэг удаа турш.';
  assert.equal(actionView(detail, 12).reason, 'Таны явцад тулгуурласан.');
  assert.equal(actionView(detail, 12).steps[0], 'Нэг мөр бич.');
  assert.equal(actionView(detail, null).steps[0], 'Таны явцад тулгуурласан.');
  assert.match(actionView('Зөвхөн шалтгаан.', 12).steps[0], /дутуу/);
});
test('local scheduling rejects invalid calendar dates, hours and past times', () => {
  assert.equal(localSchedule('2027-02-30', '18:30', 0), null);
  assert.equal(localSchedule('2027-10-01', '25:30', 0), null);
  assert.equal(localSchedule('bad', '18:30', 0), null);
  assert.equal(localSchedule('2000-01-01', '18:30'), null);
  assert.ok(localSchedule('2027-10-01', '18:30', 0)?.endsWith('Z'));
});
