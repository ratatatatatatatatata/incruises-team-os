import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../current-user";
import { loginPath } from "../auth/login-path.mjs";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Амжилтын зураглал",
};

export default async function OnboardingPage() {
  const user = await getCurrentTeamOsUser();

  if (!user) redirect(loginPath("/onboarding"));
  const hasActiveAccess = user.access === "active" && Boolean(user.role);
  if (user.access === "disabled") redirect("/access-pending");
  if (user.onboarding?.status === "completed") {
    redirect(!user.assessmentConsent ? "/privacy" : hasActiveAccess ? "/" : "/access-pending");
  }

  return (
    <OnboardingFlow
      firstName={user.displayName}
      pauseHref="/access-pending"
      completionHref={hasActiveAccess ? "/my-guide" : "/access-pending"}
    />
  );
}
