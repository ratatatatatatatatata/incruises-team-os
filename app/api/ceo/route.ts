import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamOsUser } from "@/app/current-user";
import { isCeoAdmin, sameOrigin } from "@/lib/ceo/access";
import { snapshotSchema, policyIds, type Learning } from "@/lib/ceo/domain";
import { createCeoReport } from "@/lib/ceo/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("analyze") }).strict(),
  z.object({ action: z.literal("start"), runId: z.string().uuid(), policyId: z.enum(policyIds) }).strict(),
  z.object({ action: z.literal("stop"), id: z.string().uuid(), note: z.string().trim().min(10).max(1000) }).strict(),
  z.object({ action: z.literal("measure"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("review"), id: z.string().uuid(), verdict: z.enum(["accepted", "rejected"]), note: z.string().trim().min(10).max(1000) }).strict(),
]);
const learningSchema = z.array(z.object({ policyId: z.enum(policyIds), verdict: z.enum(["accepted", "rejected"]), delta: z.number(), experimentId: z.string().uuid() }));
async function authorize() {
  if (process.env.CEO_ENABLED !== "true") return json({ error: "AI CEO одоогоор идэвхжээгүй." }, 404);
  const user = await getCurrentTeamOsUser();
  if (!user) return json({ error: "Нэвтрэх шаардлагатай." }, 401);
  if (!isCeoAdmin(user)) return json({ error: "Админы эрх шаардлагатай." }, 403);
  return null;
}
function databaseError(error: { message: string; code?: string }) {
  const messages: Record<string, string> = {
    CEO_RUN_LIMIT: "Нэг минутын дараа дахин оролдоно уу. Өдөрт нийт 8 дүн шинжилгээний хязгаартай.",
    CEO_TOO_EARLY: "14 хоногийн ажиглалтын хугацаа дуусаагүй.",
    CEO_REFRESH_REQUIRED: "Шинэ дүн шинжилгээ гаргаад туршилтаа сонгоно уу.",
    CEO_INSUFFICIENT_EVIDENCE: "Эерэг, харьцуулж болох баримт хүрэлцэхгүй тул сургамж болгон батлах боломжгүй.",
    CEO_EXPERIMENT_CONFLICT: "Туршилтын төлөв өөрчлөгдсөн. Мэдээллээ шинэчилнэ үү.",
  };
  const code = Object.keys(messages).find(key => error.message.includes(key));
  return json({ error: code ? messages[code] : error.code === "23505" ? "Нэг туршилт аль хэдийн явагдаж байна." : "Мэдээллийг хадгалж/уншиж чадсангүй. CEO өгөгдлийн тохиргоог шалгана уу." }, code === "CEO_RUN_LIMIT" ? 429 : 409);
}
export async function GET() {
  try {
    const denied = await authorize(); if (denied) return denied;
    const db = await createClient();
    const [snapshot, runs, experiments] = await Promise.all([
      db.rpc("ceo_snapshot"), db.from("ceo_runs").select("id,created_at,snapshot,report").not("report", "is", null).order("created_at", { ascending: false }).limit(1),
      db.from("ceo_experiments").select("id,policy_id,status,started_at,before_snapshot,after_snapshot,learning_eligible,delta,review_note").order("started_at", { ascending: false }).limit(20),
    ]);
    const error = snapshot.error ?? runs.error ?? experiments.error;
    if (error) return databaseError(error);
    return json({ snapshot: snapshotSchema.parse(snapshot.data), run: runs.data?.[0] ?? null, experiments: experiments.data ?? [] });
  } catch { return json({ error: "Удирдлагын мэдээллийг баталгаажуулж чадсангүй." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Хүсэлтийн эх үүсвэр зөвшөөрөгдөөгүй." }, 403);
  try {
    const denied = await authorize(); if (denied) return denied;
    // Read a bounded body even when Content-Length is missing/chunked.
    const reader = request.body?.getReader(); if (!reader) return json({ error: "Хүсэлт хоосон." }, 400);
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 4096) { await reader.cancel(); return json({ error: "Хүсэлт хэт том." }, 413); } chunks.push(value); }
    const data = command.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!data.success) return json({ error: "Хүсэлтийн утга буруу." }, 400);
    const db = await createClient(); const c = data.data;
    if (c.action === "analyze") {
      const started = await db.rpc("begin_ceo_run"); if (started.error) return databaseError(started.error);
      const snapshot = snapshotSchema.parse(started.data.snapshot);
      const learning: Learning[] = learningSchema.parse(started.data.learning);
      const report = await createCeoReport(snapshot, learning);
      const saved = await db.rpc("finish_ceo_run", { p_id: started.data.id, p_report: report });
      if (saved.error) return databaseError(saved.error);
      return json({ ok: true });
    }
    const result = c.action === "start"
      ? await db.rpc("start_ceo_experiment", { p_run_id: c.runId, p_policy_id: c.policyId })
      : c.action === "stop" ? await db.rpc("stop_ceo_experiment", { p_id: c.id, p_note: c.note })
      : c.action === "measure" ? await db.rpc("measure_ceo_experiment", { p_id: c.id })
      : await db.rpc("review_ceo_experiment", { p_id: c.id, p_verdict: c.verdict, p_note: c.note });
    return result.error ? databaseError(result.error) : json({ ok: true });
  } catch (error) { return json({ error: error instanceof SyntaxError ? "Хүсэлтийн хэлбэр буруу." : "Хүсэлтийг гүйцэтгэж чадсангүй." }, error instanceof SyntaxError ? 400 : 503); }
}
