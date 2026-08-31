import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../current-user";
import { TeamOsApp } from "../team-os-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team OS" };

export default async function WorkspacePage() {
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  if (user.onboarding?.status !== "completed") redirect("/onboarding");
  if (user.access !== "active" || !user.role) redirect("/access-pending");

  return <TeamOsApp user={{ name: user.displayName, email: user.email, role: user.role }} />;
}
