import { redirect } from "next/navigation";
import type { OnboardingStatus, TeamOsUser, TeamRole } from "./current-user";
import { loginPath } from "./auth/login-path.mjs";

type ReadyMember = TeamOsUser & {
  access: "active";
  role: TeamRole;
  onboarding: {
    status: Extract<OnboardingStatus, "completed">;
    baselineAnswered: number;
    tailoredAnswered: number;
  };
};

export function requireReadyMember(
  user: TeamOsUser | null,
  options: {
    returnTo: string;
    requireAssessmentConsent?: boolean;
  },
): ReadyMember {
  if (!user) redirect(loginPath(options.returnTo));

  // Disabled access always wins so a disabled member never enters onboarding.
  if (user.access === "disabled") redirect("/access-pending");

  // Pending and active invited members may complete their personal assessment.
  if (user.onboarding?.status !== "completed") redirect("/onboarding");

  if (user.access !== "active" || !user.role) redirect("/access-pending");
  if (options.requireAssessmentConsent && !user.assessmentConsent) redirect("/privacy");

  return user as ReadyMember;
}
