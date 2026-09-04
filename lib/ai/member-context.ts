import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export class PersonalizationAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type PersonalizationContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
  displayName: string;
  verified: true;
};

export type SuccessContext = {
  profile: Record<string, unknown>;
  guide: Record<string, unknown>;
  onboarding: Record<string, unknown>;
};

export async function requirePersonalizationContext(): Promise<PersonalizationContext> {
  if (!isSupabaseConfigured()) {
    throw new PersonalizationAccessError(503, "not_configured", "Өгөгдлийн үйлчилгээ тохируулагдаагүй байна.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (error || !userId || !email || isAnonymous) {
    throw new PersonalizationAccessError(401, "sign_in_required", "Нэвтэрч орно уу.");
  }

  const [membershipResult, onboardingResult, profileResult, privacyResult] = await Promise.all([
    supabase.from("team_members").select("status").eq("user_id", userId).maybeSingle(),
    supabase
      .from("member_onboarding_state")
      .select("status,baseline_answered,tailored_answered,completed_at,assessment_version")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("user_profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase
      .from("member_privacy_preferences")
      .select("assessment_consent")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const firstError = membershipResult.error ?? onboardingResult.error ?? profileResult.error ?? privacyResult.error;
  if (firstError) throw firstError;

  const membership = membershipResult.data as { status: "pending" | "active" | "disabled" } | null;
  if (!membership || membership.status !== "active") {
    throw new PersonalizationAccessError(403, "access_inactive", "Таны багийн access хараахан идэвхжээгүй байна.");
  }

  const onboarding = onboardingResult.data as { status: string } | null;
  if (!onboarding || onboarding.status !== "completed") {
    throw new PersonalizationAccessError(409, "assessment_incomplete", "Эхлээд 15 + 100 асуултын Success Map-аа дуусгана уу.");
  }

  const privacy = privacyResult.data as { assessment_consent: boolean } | null;
  if (!privacy?.assessment_consent) {
    throw new PersonalizationAccessError(428, "privacy_consent_required", "Хувийн guide болон assistant ашиглах зөвшөөрлөө Нууцлал хэсгээс идэвхжүүлнэ үү.");
  }

  const profileRow = profileResult.data as { display_name?: string | null } | null;
  return {
    supabase,
    userId,
    email,
    displayName: profileRow?.display_name?.trim() || email,
    verified: true,
  };
}

export function createPersonalizationServiceClient(context: PersonalizationContext) {
  if (!context.verified) {
    throw new PersonalizationAccessError(403, "assistant_forbidden", "Энэ assistant-д хандах эрх алга.");
  }

  const config = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secretKey) {
    throw new PersonalizationAccessError(
      503,
      "assistant_service_unavailable",
      "AI assistant-ийн server-only тохиргоо хийгдээгүй байна.",
    );
  }

  return createSupabaseClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function loadSuccessContext(context: PersonalizationContext): Promise<SuccessContext> {
  const [profileResult, guideResult, onboardingResult] = await Promise.all([
    context.supabase
      .from("success_profiles")
      .select(
        "profile_version,primary_style,secondary_style,dimension_scores,dimension_evidence_counts,strengths,growth_edges,motivation_pattern,communication_style,work_rhythm,confidence_note,methodology_note",
      )
      .eq("user_id", context.userId)
      .maybeSingle(),
    context.supabase
      .from("success_guides")
      .select(
        "guide_version,board_director_route,content_strategy,social_cadence,relationship_guide,weekly_plan,growth_plan,compliance_guardrails,rank_disclaimer",
      )
      .eq("user_id", context.userId)
      .maybeSingle(),
    context.supabase
      .from("member_onboarding_state")
      .select("status,assessment_version,baseline_answered,tailored_answered,completed_at")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);

  const firstError = profileResult.error ?? guideResult.error ?? onboardingResult.error;
  if (firstError) throw firstError;
  if (!profileResult.data || !guideResult.data || !onboardingResult.data) {
    throw new PersonalizationAccessError(409, "profile_not_ready", "Success Profile бэлэн болоогүй байна.");
  }

  return {
    profile: profileResult.data as Record<string, unknown>,
    guide: guideResult.data as Record<string, unknown>,
    onboarding: onboardingResult.data as Record<string, unknown>,
  };
}

export function personalizationErrorResponse(error: unknown): Response {
  if (error instanceof PersonalizationAccessError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  console.error("Personalization request failed");
  return Response.json(
    { error: "Хувийн guide үйлчилгээ түр ажиллахгүй байна.", code: "personalization_unavailable" },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
