import { z } from "zod";
import { requestAuth } from "@/lib/supabase/request-auth";
import { isSameOrigin, RequestAuthError } from "@/lib/supabase/request-policy";
import { normalizeStarterAnswers, createStarterPlan } from "@/lib/success-map/planner";
import { personalizeStarterPlan, STARTER_PLAN_MODEL } from "@/lib/success-map/ai";
import type { AcademyLessonCandidate, StarterAnswers, SuccessMapPlan } from "@/lib/success-map/contracts";
import { CLARIFICATION_GUIDANCE, clarificationMessage, clarificationReason, firstAnswerNeedingClarification } from "@/lib/success-map/clarification";

const payloadSchema = z.object({
  currentContext: z.string().trim().max(1600),
  goal30Day: z.string().trim().max(1600),
  weeklyCapacity: z.string().trim().max(800),
  primaryBlocker: z.string().trim().max(1600),
  growthPreferences: z.string().trim().max(1600),
  aiConsent: z.boolean().default(false),
  supportSummaryConsent: z.boolean().default(false),
}).strict();

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("Хүсэлтийн эх үүсвэр зөвшөөрөгдөөгүй.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 12_000) return errorResponse("Хариултын хэмжээ хэтэрсэн байна.", 413);

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("5 асуултад бүрэн, тодорхой хариулна уу.", 400);

  const submittedAnswers: StarterAnswers = {
    currentContext: parsed.data.currentContext,
    goal30Day: parsed.data.goal30Day,
    weeklyCapacity: parsed.data.weeklyCapacity,
    primaryBlocker: parsed.data.primaryBlocker,
    growthPreferences: parsed.data.growthPreferences,
  };
  const clarificationKey = firstAnswerNeedingClarification(submittedAnswers);
  if (clarificationKey) {
    const reason = clarificationReason(clarificationKey, submittedAnswers[clarificationKey]) ?? "needs_detail";
    return Response.json({
      error: clarificationMessage(reason),
      code: "clarification_required",
      clarificationReason: reason,
      clarificationKey,
      clarificationPrompt: CLARIFICATION_GUIDANCE[clarificationKey].prompt,
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  let auth: Awaited<ReturnType<typeof requestAuth>>;
  try { auth = await requestAuth(request); }
  catch (error) {
    return errorResponse(error instanceof RequestAuthError ? error.message : "Нэвтрэлтийг шалгаж чадсангүй.", error instanceof RequestAuthError ? 401 : 503);
  }
  const { supabase, userId } = auth;

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) return errorResponse("Хэрэглэгчийн эрхийг шалгаж чадсангүй.", 503);
  if (!membership || membership.status !== "active") return errorResponse("Идэвхтэй багийн эрх шаардлагатай.", 403);

  const { data: previousMap, error: previousMapError } = await supabase
    .from("member_success_maps")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (previousMapError && previousMapError.code !== "42P01") {
    return errorResponse("Одоогийн төлөвлөгөөг шалгаж чадсангүй.", 503);
  }
  if (previousMap?.updated_at && Date.now() - new Date(previousMap.updated_at).getTime() < 30_000) {
    return errorResponse("Төлөвлөгөө саяхан шинэчлэгдсэн байна. 30 секундийн дараа дахин оролдоно уу.", 429);
  }

  const [lessonsResult, progressResult] = await Promise.all([
    supabase
      .from("academy_lessons")
      .select("id,level_id,title,minutes")
      .eq("is_published", true)
      .order("level_id")
      .order("sort_order"),
    supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("status", "completed"),
  ]);
  if (lessonsResult.error || progressResult.error) {
    return errorResponse("Academy-ийн мэдээллийг уншиж чадсангүй.", 503);
  }

  const completed = new Set((progressResult.data ?? []).map((row) => String(row.lesson_id)));
  const lessons: AcademyLessonCandidate[] = (lessonsResult.data ?? [])
    .filter((row) => !completed.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      levelId: String(row.level_id),
      title: String(row.title),
      minutes: Number(row.minutes),
    }));

  const answers: StarterAnswers = normalizeStarterAnswers(submittedAnswers);
  const deterministicPlan = createStarterPlan(answers, lessons);
  const personalized = parsed.data.aiConsent
    ? await personalizeStarterPlan(answers, deterministicPlan)
    : { plan: deterministicPlan, usedAi: false, fallbackReason: null };
  // Enforce the private/shared boundary immediately before persistence as well.
  // Both the initial action and future actions are copied by database triggers/RPCs
  // into supporter-readable rows, so no free-form AI action may reach this payload.
  const persistedPlan: SuccessMapPlan = {
    ...personalized.plan,
    todayAction: deterministicPlan.todayAction,
    weeklyActions: deterministicPlan.weeklyActions,
  };
  const planSource = personalized.usedAi ? "ai_gateway" : "deterministic";
  const aiModel = personalized.usedAi ? STARTER_PLAN_MODEL : null;

  const first30DayEnabled = process.env.FIRST_30_DAY_LOOP_ENABLED === "true";
  const rpcName = first30DayEnabled ? "complete_starter_success_map_v2" : "complete_starter_success_map";
  const rpcPayload: Record<string, unknown> = {
    p_current_context: answers.currentContext,
    p_goal_30_day: answers.goal30Day,
    p_weekly_capacity: answers.weeklyCapacity,
    p_primary_blocker: answers.primaryBlocker,
    p_growth_preferences: answers.growthPreferences,
    p_plan: persistedPlan,
    p_plan_source: planSource,
    p_ai_consent: parsed.data.aiConsent,
    p_ai_model: aiModel,
  };
  if (first30DayEnabled) rpcPayload.p_support_summary_consent = parsed.data.supportSummaryConsent;

  const { data: saved, error: saveError } = await supabase.rpc(rpcName, rpcPayload);

  if (saveError) {
    console.error("Starter success map save failed", saveError.code);
    return errorResponse("Starter Success Map-ийг хадгалж чадсангүй.", 503);
  }

  return Response.json({
    ok: true,
    plan: persistedPlan,
    planSource,
    aiFallbackReason: personalized.fallbackReason,
    completedAt: saved?.completed_at ?? new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
