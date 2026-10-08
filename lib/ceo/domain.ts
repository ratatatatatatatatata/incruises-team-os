import { z } from "zod";

export const policyIds = ["finish_action", "start_checkin", "complete_map", "mentor_support", "assign_mentor"] as const;
export type PolicyId = typeof policyIds[number];
export const metricKeys = ["activeMembers", "mappedMembers", "completedMembers14d", "checkinMembers14d", "openSupport", "unassignedMembers", "actionsCreated14d"] as const;
export type MetricKey = typeof metricKeys[number];
const count = z.number().int().nonnegative();
export const snapshotSchema = z.object({
  version: z.literal(1), asOf: z.string().datetime({ offset: true }), windowStart: z.string().datetime({ offset: true }),
  cohort: z.string().regex(/^[a-f0-9]{32}$/),
  metrics: z.object({ activeMembers: count, mappedMembers: count, completedMembers14d: count, checkinMembers14d: count, openSupport: count, unassignedMembers: count, actionsCreated14d: count }).strict(),
}).strict().refine(s => [s.metrics.mappedMembers, s.metrics.completedMembers14d, s.metrics.checkinMembers14d, s.metrics.unassignedMembers].every(n => n <= s.metrics.activeMembers), "Member counts cannot exceed the cohort");
export type Snapshot = z.infer<typeof snapshotSchema>;
export const metricLabels: Record<MetricKey, string> = {
  activeMembers: "Идэвхтэй эрхтэй гишүүн", mappedMembers: "Төлөвлөгөөгөө бөглөсөн", completedMembers14d: "14 хоногт ажил дуусгасан", checkinMembers14d: "14 хоногт явцаа тэмдэглэсэн", openSupport: "Шийдэгдээгүй тусламж", unassignedMembers: "Mentor оноогоогүй гишүүн", actionsCreated14d: "14 хоногт үүссэн ажил",
};
export const policies: Record<PolicyId, { title: string; action: string; metric: MetricKey; owner: string }> = {
  finish_action: { title: "Эхэлсэн нэг ажлыг дуусгахад туслах", action: "Mentor одоо хийж буй ажлын дуусах шалгуурыг гишүүнтэй хамт тодруулж, боломжит нэг алхам болгон хуваана.", metric: "completedMembers14d", owner: "Mentor" },
  start_checkin: { title: "Явцаа тэмдэглэх дадлыг турших", action: "Mentor уулзалтын төгсгөлд гишүүн өөрөө хийсэн алхам, саад, дараагийн ажлаа аппад тэмдэглэнэ.", metric: "checkinMembers14d", owner: "Mentor" },
  complete_map: { title: "Эхний төлөвлөгөөг бөглөхөд туслах", action: "Бүртгэлтэй боловч төлөвлөгөөгүй гишүүдэд таван асуултаа өөрийн үгээр бөглөх богино танилцуулга бэлтгэнэ.", metric: "mappedMembers", owner: "Сургалтын хариуцагч" },
  mentor_support: { title: "Гацсан ажлын тусламжийг шийдэх", action: "Mentor өөрт хуваарилагдсан нээлттэй хүсэлтийг шалгаж, нэг бодит дараагийн алхам санал болгоно. Гишүүн өөрөө үр дүнг батална.", metric: "completedMembers14d", owner: "Mentor" },
  assign_mentor: { title: "Mentor-ийн хариуцлагыг тодруулах", action: "Админ туслагчгүй гишүүдийн жагсаалтыг эрхийн хүрээнд шалгаж, зөвшилцсөн mentor-ийг одоогийн багийн хэсгээр онооно.", metric: "unassignedMembers", owner: "Админ" },
};
export type Learning = { policyId: PolicyId; verdict: "accepted" | "rejected"; delta: number; experimentId: string };
export type Report = { source: "rules" | "ai_gateway"; model: string | null; fallback: string | null; orderedPolicyIds: PolicyId[]; learningCount: number; version: "ceo-v1" };
export function eligiblePolicies(s: Snapshot): PolicyId[] {
  const m = s.metrics;
  if (!m.activeMembers) return [];
  return policyIds.filter(id => ({ finish_action: m.completedMembers14d < m.activeMembers, start_checkin: m.checkinMembers14d < m.activeMembers, complete_map: m.mappedMembers < m.activeMembers, mentor_support: m.openSupport > 0, assign_mentor: m.unassignedMembers > 0 })[id]);
}
export function ruleReport(s: Snapshot, learning: Learning[] = []): Report {
  const weight = (id: PolicyId) => learning.filter(l => l.policyId === id).reduce((n, l) => n + (l.verdict === "accepted" ? 1 : -1), 0);
  return { source: "rules", model: null, fallback: null, orderedPolicyIds: eligiblePolicies(s).sort((a, b) => weight(b) - weight(a)), learningCount: learning.length, version: "ceo-v1" };
}
export function validateRanking(ids: PolicyId[], s: Snapshot): boolean {
  const eligible = eligiblePolicies(s);
  return ids.length === eligible.length && new Set(ids).size === ids.length && ids.every(id => eligible.includes(id));
}
// Explicit allowlist: no raw member text, identifiers, cohort hash or admin notes reach AI.
export function gatewayInput(s: Snapshot, learning: Learning[]) {
  return { windowDays: 14, metrics: s.metrics, options: eligiblePolicies(s).map(id => ({ id, ...policies[id] })), learning: learning.map(l => ({ policyId: l.policyId, verdict: l.verdict, delta: l.delta })), caveat: "Observational signals only; no causal or guaranteed outcomes." };
}
export function evaluateExperiment(before: Snapshot, after: Snapshot, policyId: PolicyId) {
  const elapsed = new Date(after.asOf).getTime() - new Date(before.asOf).getTime();
  if (elapsed < 14 * 86400000) return { eligible: false, delta: null, reason: "14 хоногийн ажиглалт дуусаагүй." };
  if (before.cohort !== after.cohort || before.metrics.activeMembers !== after.metrics.activeMembers) return { eligible: false, delta: null, reason: "Гишүүдийн бүрэлдэхүүн өөрчлөгдсөн тул харьцуулах боломжгүй." };
  if (before.metrics.activeMembers < 10) return { eligible: false, delta: null, reason: "10-аас цөөн гишүүнтэй тул суралцахад баримт хүрэлцэхгүй." };
  const key = policies[policyId].metric;
  const sign = key === "unassignedMembers" ? -1 : 1;
  const delta = Math.round(sign * (after.metrics[key] - before.metrics[key]) / before.metrics.activeMembers * 1000) / 10;
  return { eligible: true, delta, reason: "Ижил бүрэлдэхүүний ажигласан өөрчлөлт. Туршилт шалтгаан болсон гэж батлахгүй." };
}
export const demoSnapshot: Snapshot = {
  version: 1, asOf: "2026-10-08T08:00:00Z", windowStart: "2026-09-24T08:00:00Z", cohort: "00000000000000000000000000000000",
  metrics: { activeMembers: 24, mappedMembers: 18, completedMembers14d: 9, checkinMembers14d: 12, openSupport: 4, unassignedMembers: 3, actionsCreated14d: 21 },
};
