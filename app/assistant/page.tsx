import type { Metadata } from "next";
import { getCurrentTeamOsUser } from "../current-user";
import { requireReadyMember } from "../member-access";
import { AssistantClient } from "./assistant-client";
import { SectionShell } from "../my-guide/section-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Дижитал ментор",
};

function safeConversationId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) return null;
  return candidate;
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string | string[] }>;
}) {
  const [currentUser, params] = await Promise.all([getCurrentTeamOsUser(), searchParams]);
  const conversationId = safeConversationId(params.conversation);
  const returnTo = conversationId
    ? `/assistant?conversation=${encodeURIComponent(conversationId)}`
    : "/assistant";
  const user = requireReadyMember(currentUser, {
    returnTo,
    requireAssessmentConsent: true,
  });

  return (
    <SectionShell
      active="assistant"
      userName={user.displayName}
      eyebrow="GUIDED DIGITAL MENTOR"
      title="Асуултаа жижиг алхам болгоё"
      description="Ойлгоход амархан тайлбар, ярианы дасгал, контентын санаа болон долоо хоногийн эргэцүүллийг өөрт тохирсон хурдаар авна."
    >
      <AssistantClient key={conversationId ?? "new"} initialConversationId={conversationId} userName={user.displayName} />
    </SectionShell>
  );
}
