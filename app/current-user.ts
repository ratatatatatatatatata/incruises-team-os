import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type OnboardingStatus = "not_started" | "baseline" | "analysis" | "tailored" | "ready_to_complete" | "completed";

export type TeamOsUser = {
  userId: string;
  displayName: string;
  email: string;
  role: TeamRole | null;
  access: "active" | "disabled" | "pending";
  assessmentConsent: boolean;
  onboarding: {
    status: OnboardingStatus;
    baselineAnswered: number;
    tailoredAnswered: number;
  } | null;
};

export type TeamRole = "builder" | "coach" | "director" | "admin";

export async function getCurrentTeamOsUser(): Promise<TeamOsUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (error || !userId || !email || isAnonymous) return null;

  const metadata = claims?.user_metadata;
  const fullName =
    metadata && typeof metadata === "object" && "full_name" in metadata && typeof metadata.full_name === "string"
      ? metadata.full_name
      : null;

  const [membershipResult, onboardingResult, privacyResult] = await Promise.all([
    supabase.from("team_members").select("role,status").eq("user_id", userId).maybeSingle(),
    supabase
      .from("member_onboarding_state")
      .select("status,baseline_answered,tailored_answered")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("member_privacy_preferences")
      .select("assessment_consent")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (membershipResult.error) throw membershipResult.error;
  if (onboardingResult.error) throw onboardingResult.error;
  if (privacyResult.error) throw privacyResult.error;

  const activeMembership = membershipResult.data as { role: TeamRole; status: "pending" | "active" | "disabled" } | null;
  const onboardingRow = onboardingResult.data as {
    status: OnboardingStatus;
    baseline_answered: number;
    tailored_answered: number;
  } | null;
  const access = activeMembership?.status ?? "disabled";
  let displayName = fullName ?? email;

  if (access === "active") {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.display_name) displayName = String(profile.display_name);
  }

  return {
    userId,
    email,
    displayName,
    role: activeMembership?.role ?? null,
    access,
    assessmentConsent: privacyResult.data?.assessment_consent === true,
    onboarding: onboardingRow
      ? {
          status: onboardingRow.status,
          baselineAnswered: onboardingRow.baseline_answered,
          tailoredAnswered: onboardingRow.tailored_answered,
        }
      : null,
  };
}
