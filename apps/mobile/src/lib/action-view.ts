import { actionSteps, plainMongolianText } from '../../../../lib/success-map/presentation.ts';

export function actionView(detail: string, sourceCheckinId: number | null) {
  if (!sourceCheckinId) return { reason: null, steps: actionSteps(detail) };
  const sentences = plainMongolianText(detail).split(/(?<=[.!?])\s+/u).filter(Boolean);
  return {
    reason: sentences[0] ?? 'Сүүлийн явцад тулгуурласан дараагийн алхам.',
    steps: sentences.length > 1 ? actionSteps(sentences.slice(1).join(' ')) : ['Ажлын алхам дутуу байна. Хүнээс тусламж хүсэж тодруулаарай.'],
  };
}

export function localSchedule(day: string, time: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const value = new Date(year, month - 1, date, hour, minute);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== date || value.getHours() !== hour || value.getMinutes() !== minute || value.getTime() <= now) return null;
  return value.toISOString();
}
