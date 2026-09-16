import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "./current-user";
import { TeamOsApp } from "./team-os-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Хяналтын төв",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await getCurrentTeamOsUser();

  if (!user) redirect("/login");
  if (user.access !== "active" || !user.role) redirect("/access-pending");
  if (user.onboardingRequired) redirect("/onboarding");
  const params = await searchParams;

  return <TeamOsApp user={{ name: user.displayName, email: user.email, role: user.role }} initialSection={params.section} />;
}
