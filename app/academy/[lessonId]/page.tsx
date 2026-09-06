import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { academyUuidPattern } from "@/lib/academy/contracts";
import { getCurrentTeamOsUser } from "../../current-user";
import { requireReadyMember } from "../../member-access";
import { AcademyShell } from "../academy-shell";
import { AcademyLessonView } from "./academy-lesson-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Academy хичээл" };

export default async function AcademyLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const [currentUser, routeParams] = await Promise.all([getCurrentTeamOsUser(), params]);
  const user = requireReadyMember(currentUser, { returnTo: `/academy/${routeParams.lessonId}` });
  if (!academyUuidPattern.test(routeParams.lessonId)) notFound();

  return (
    <AcademyShell userName={user.displayName}>
      <AcademyLessonView lessonId={routeParams.lessonId} />
    </AcademyShell>
  );
}
