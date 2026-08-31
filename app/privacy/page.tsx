import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../current-user";
import { PrivacyClient } from "./privacy-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Миний нууцлал" };

export default async function PrivacyPage() {
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  return <PrivacyClient userName={user.displayName} />;
}
