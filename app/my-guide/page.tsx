import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../current-user";
import { MyGuideClient } from "./my-guide-client";
import { SectionShell } from "./section-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний амжилтын зам",
};

export default async function MyGuidePage() {
  const user = await getCurrentTeamOsUser();

  if (!user) redirect("/login");
  if (user.onboarding?.status !== "completed") redirect("/onboarding");
  if (user.access !== "active" || !user.role) redirect("/access-pending");
  if (!user.assessmentConsent) redirect("/privacy");

  return (
    <SectionShell
      active="guide"
      userName={user.displayName}
      eyebrow="MY SUCCESS GUIDE"
      title="Таны дараагийн зөв алхам"
      description="Таны профайлд тулгуурласан нотолгоо, бодит хязгаарлалт, 7 хоногийн төвлөрөл болон 30/60/90 хоногийн замыг нэг дор харна."
    >
      <MyGuideClient />
    </SectionShell>
  );
}
