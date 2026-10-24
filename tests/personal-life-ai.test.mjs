import assert from 'node:assert/strict';
import test from 'node:test';
import { usableLocalReply } from '../lib/life/local-ai.ts';

test('local AI refuses the repeated Mongolian output observed in browser and truncated answers', () => {
  const repeated = 'Этеда өгөгдөлтэй бүү хэлээрэд үлдээмэйн ' + 'өмнөөс өгөгдөлтэй байвал '.repeat(25);
  assert.equal(usableLocalReply(repeated, 'stop'), false);
  assert.equal(usableLocalReply('Эхлээд хийх ажлаа сонгоод эхлэх цагаа тэмдэглэж хадгалаарай.', 'length'), false);
  assert.equal(usableLocalReply('<think>Let me think carefully about this goal', 'stop'), false);
  assert.equal(usableLocalReply('First choose a task and write the start time in your plan.', 'stop'), false);
  assert.equal(usableLocalReply('Өнөөдөр хамгийн чухал нэг ажлаа сонго. Түүнийг арван минутанд хийх жижиг хэсэг болгоод, эхлэх цагаа төлөвлөгөөндөө тэмдэглээрэй.', 'stop'), true);
});
