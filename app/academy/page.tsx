import type { Metadata } from "next";
import { getCurrentTeamOsUser } from "../current-user";
import { requireReadyMember } from "../member-access";
import { AcademyCatalog } from "./academy-catalog";
import { AcademyShell } from "./academy-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Video Academy" };

export default async function AcademyPage() {
  const user = requireReadyMember(await getCurrentTeamOsUser(), { returnTo: "/academy" });

  return (
    <AcademyShell userName={user.displayName}>
      <AcademyCatalog />
    </AcademyShell>
  );
}
