import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../current-user";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import type { StarterAnswers } from "@/lib/success-map/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Starter Success Map" };

type SuccessMapRow = {
  current_context: string;
  goal_30_day: string;
  weekly_capacity: string;
  primary_blocker: string;
  growth_preferences: string;
  ai_consent: boolean;
};

export default async function OnboardingPage() {
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  if (user.access !== "active" || !user.role) redirect("/access-pending");

  const supabase = await createClient();
  const { data } = await supabase
    .from("member_success_maps")
    .select("current_context,goal_30_day,weekly_capacity,primary_blocker,growth_preferences,ai_consent")
    .eq("user_id", user.userId)
    .maybeSingle();
  const row = data as SuccessMapRow | null;
  const initialAnswers: StarterAnswers | null = row ? {
    currentContext: row.current_context,
    goal30Day: row.goal_30_day,
    weeklyCapacity: row.weekly_capacity,
    primaryBlocker: row.primary_blocker,
    growthPreferences: row.growth_preferences,
  } : null;

  return (
    <OnboardingForm
      displayName={user.displayName}
      initialAnswers={initialAnswers}
      initialAiConsent={row?.ai_consent ?? false}
    />
  );
}
