import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "./current-user";
import { TeamOsApp } from "./team-os-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team OS",
};

export default async function Home() {
  const user = await getCurrentTeamOsUser();

  if (!user) redirect("/login");

  return <TeamOsApp user={{ name: user.displayName, email: user.email }} />;
}
