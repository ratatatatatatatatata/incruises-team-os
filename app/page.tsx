import type { Metadata } from "next";
import { loadSuccessContext, requirePersonalizationContext } from "@/lib/ai/member-context";
import { getCurrentTeamOsUser } from "./current-user";
import { requireReadyMember } from "./member-access";
import { MemberHome } from "./member-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Миний зам",
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label : typeof row.title === "string" ? row.title : "";
      return label.trim();
    })
    .filter(Boolean);
}

function firstWeeklyAction(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value && typeof value === "object" ? Object.values(value)[0] : null;
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object") {
    const row = first as Record<string, unknown>;
    for (const key of ["action", "task", "title", "focus"]) {
      if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
    }
  }
  return "Success Map-аас хамгийн жижиг нэг ажлыг сонгоод 20 минут эхлүүл.";
}

function boardRouteEnabled(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.appropriate === true;
}

export default async function Home() {
  const user = requireReadyMember(await getCurrentTeamOsUser(), {
    returnTo: "/",
    requireAssessmentConsent: true,
  });

  const context = await requirePersonalizationContext();
  const success = await loadSuccessContext(context);

  return (
    <MemberHome
      user={{ name: user.displayName, email: user.email, role: user.role }}
      primaryStyle={String(success.profile.primary_style ?? "Өөрийн хэмнэлтэй хөгжүүлэгч")}
      strengths={stringList(success.profile.strengths)}
      growthEdges={stringList(success.profile.growth_edges)}
      todayAction={firstWeeklyAction(success.guide.weekly_plan)}
      boardDirectorRoute={boardRouteEnabled(success.guide.board_director_route)}
    />
  );
}
