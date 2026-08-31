import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../current-user";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Амжилтын зураглал",
};

export default async function OnboardingPage() {
  const user = await getCurrentTeamOsUser();

  if (!user) redirect("/login");
  const hasActiveAccess = user.access === "active" && Boolean(user.role);
  if (user.access === "disabled") redirect("/access-pending");
  if (user.onboarding?.status === "completed") {
    redirect(!user.assessmentConsent ? "/privacy" : hasActiveAccess ? "/" : "/access-pending");
  }

  return (
    <OnboardingFlow
      firstName={user.displayName}
      pauseHref={hasActiveAccess ? "/workspace" : "/access-pending"}
      completionHref={hasActiveAccess ? "/my-guide" : "/access-pending"}
    />
  );
}
