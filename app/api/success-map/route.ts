import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeStarterAnswers, createStarterPlan } from "@/lib/success-map/planner";
import { personalizeStarterPlan, STARTER_PLAN_MODEL } from "@/lib/success-map/ai";
import type { AcademyLessonCandidate, StarterAnswers } from "@/lib/success-map/contracts";

const payloadSchema = z.object({
  currentContext: z.string().trim().min(10).max(1600),
  goal30Day: z.string().trim().min(10).max(1600),
  weeklyCapacity: z.string().trim().min(3).max(800),
  primaryBlocker: z.string().trim().min(10).max(1600),
  growthPreferences: z.string().trim().min(10).max(1600),
  aiConsent: z.boolean().default(false),
}).strict();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(forwardedHost && new URL(origin).host === forwardedHost);
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Хүсэлтийн эх үүсвэр зөвшөөрөгдөөгүй.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 12_000) return errorResponse("Хариултын хэмжээ хэтэрсэн байна.", 413);

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("5 асуултад бүрэн, тодорхой хариулна уу.", 400);

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (claimsError || !userId) return errorResponse("Нэвтрэх шаардлагатай.", 401);

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

  const answers: StarterAnswers = normalizeStarterAnswers(parsed.data);
  const deterministicPlan = createStarterPlan(answers, lessons);
  const personalized = parsed.data.aiConsent
    ? await personalizeStarterPlan(answers, deterministicPlan)
    : { plan: deterministicPlan, usedAi: false, fallbackReason: null };
  const planSource = personalized.usedAi ? "ai_gateway" : "deterministic";
  const aiModel = personalized.usedAi ? STARTER_PLAN_MODEL : null;

  const { data: saved, error: saveError } = await supabase.rpc("complete_starter_success_map", {
    p_current_context: answers.currentContext,
    p_goal_30_day: answers.goal30Day,
    p_weekly_capacity: answers.weeklyCapacity,
    p_primary_blocker: answers.primaryBlocker,
    p_growth_preferences: answers.growthPreferences,
    p_plan: personalized.plan,
    p_plan_source: planSource,
    p_ai_consent: parsed.data.aiConsent,
    p_ai_model: aiModel,
  });

  if (saveError) {
    console.error("Starter success map save failed", saveError.code);
    return errorResponse("Starter Success Map-ийг хадгалж чадсангүй.", 503);
  }

  return Response.json({
    ok: true,
    plan: personalized.plan,
    planSource,
    aiFallbackReason: personalized.fallbackReason,
    completedAt: saved?.completed_at ?? new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
