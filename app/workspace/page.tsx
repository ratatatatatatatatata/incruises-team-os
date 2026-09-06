import type { Metadata } from "next";
import { getCurrentTeamOsUser } from "../current-user";
import { requireReadyMember } from "../member-access";
import { TeamOsApp } from "../team-os-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team OS" };

export default async function WorkspacePage() {
  const user = requireReadyMember(await getCurrentTeamOsUser(), { returnTo: "/workspace" });

  return <TeamOsApp user={{ name: user.displayName, email: user.email, role: user.role }} />;
}
