import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "./current-user";
import { TeamOsApp } from "./team-os-app";
import { PersonalApp } from "./personal/personal-app";
import { createClient } from "@/lib/supabase/server";
import { parseWeeklyCapacityMinutes } from "@/lib/success-map/capacity.mjs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title:
    process.env.PERSONAL_LIFE_ENABLED === "true"
      ? "Миний өдөр"
      : "Хяналтын төв",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getCurrentTeamOsUser();

  if (!user) redirect("/login");
  if (user.access !== "active" || !user.role) redirect("/access-pending");
  if (process.env.PERSONAL_LIFE_ENABLED === "true") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("member_success_maps")
      .select("goal_30_day,weekly_capacity")
      .eq("user_id", user.userId)
      .maybeSingle();
    return (
      <PersonalApp
        name={user.displayName}
        initialGoal={data?.goal_30_day ?? ""}
        initialMinutes={
          parseWeeklyCapacityMinutes(data?.weekly_capacity ?? "") ?? 60
        }
      />
    );
  }
  if (user.onboardingRequired) redirect("/onboarding");
  const params = await searchParams;

  return (
    <TeamOsApp
      user={{ name: user.displayName, email: user.email, role: user.role }}
      initialSection={params.section}
    />
  );
}
