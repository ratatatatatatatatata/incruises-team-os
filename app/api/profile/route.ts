import {
  loadSuccessContext,
  personalizationErrorResponse,
  requirePersonalizationContext,
} from "@/lib/ai/member-context";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : text(record(item).title) ?? text(record(item).label)))
      .filter((item): item is string => Boolean(item));
  }
  return text(value) ? [text(value) as string] : [];
}

function firstList(source: JsonRecord, keys: string[]): string[] {
  for (const key of keys) {
    const values = stringList(source[key]);
    if (values.length) return values;
  }
  return [];
}

function normalizeWeeklyPlan(value: unknown): Array<{ day: string; title: string; action: string }> {
  if (Array.isArray(value)) {
    return value.slice(0, 14).map((item, index) => {
      const row = record(item);
      const fallback = typeof item === "string" ? item : `Өдрийн жижиг алхам ${index + 1}`;
      return {
        day: text(row.day) ?? `${index + 1}-р өдөр`,
        title: text(row.title) ?? text(row.focus) ?? fallback,
        action: text(row.action) ?? text(row.task) ?? fallback,
      };
    });
  }

  return Object.entries(record(value))
    .slice(0, 14)
    .map(([day, item]) => {
      const row = record(item);
      const fallback = typeof item === "string" ? item : day;
      return {
        day,
        title: text(row.title) ?? text(row.focus) ?? fallback,
        action: text(row.action) ?? text(row.task) ?? fallback,
      };
    });
}

function normalizeProfile(
  displayName: string,
  profile: JsonRecord,
  guide: JsonRecord,
  onboarding: JsonRecord,
) {
  const dimensions = record(profile.dimension_scores);
  const evidenceCounts = record(profile.dimension_evidence_counts);
  const strengths = stringList(profile.strengths);
  const growthEdges = stringList(profile.growth_edges);
  const board = record(guide.board_director_route);
  const content = record(guide.content_strategy);
  const cadence = record(guide.social_cadence);
  const growth = record(guide.growth_plan);
  const weeklyPlan = normalizeWeeklyPlan(guide.weekly_plan);
  const routeEnabled = board.appropriate === true;

  const evidence = Object.entries(dimensions).map(([label, value]) => {
    const evidenceCount = typeof evidenceCounts[label] === "number" ? evidenceCounts[label] : 0;
    const hasEvidence = evidenceCount > 0 && typeof value === "number";
    return {
      label,
      value: hasEvidence ? `${Math.round(value)} / 100 · ${evidenceCount} хариулт` : "Нотолгоо хүрэлцэхгүй",
      source: hasEvidence ? "15 + 100 асуултын хариулт" : "Алгассан эсвэл үнэлэх боломжгүй хариулт",
      status: hasEvidence ? "Хариултад суурилсан" : "Тодорхойгүй",
    };
  });

  const summaryParts = [profile.motivation_pattern, profile.communication_style, profile.work_rhythm]
    .map(text)
    .filter((item): item is string => Boolean(item));

  return {
    displayName,
    headline: `${text(profile.primary_style) ?? "Хувийн"} Success Map`,
    summary:
      summaryParts.join(" · ") ||
      "Таны зорилго, ажиллах хэв маяг, ур чадвар, саад болон дэмжлэгийн хэрэгцээнд суурилсан шинэчлэгддэг зураглал.",
    primaryStyle: text(profile.primary_style),
    secondaryStyle: text(profile.secondary_style),
    strengths,
    growthEdges,
    confidence: text(profile.confidence_note),
    confidenceLabel: text(profile.confidence_note) ?? "Хариултад суурилсан working profile",
    evidence,
    limitations: [
      text(profile.methodology_note),
      text(guide.rank_disclaimer),
      "Энэ нь эмнэлгийн эсвэл сэтгэлзүйн онош биш; self-report хариултыг бодит үйлдлийн үр дүнтэй тулгаж хэрэглэнэ.",
    ].filter((item): item is string => Boolean(item)),
    boardDirector: {
      appropriate: routeEnabled,
      reason: text(board.reason) ?? text(board.rationale),
      currentStage: text(board.current_stage) ?? text(board.stage),
      target: text(board.target) ?? (routeEnabled ? "Board Director зорилгын хөгжлийн зам" : null),
      gaps: firstList(board, ["gaps", "focus_areas", "next_capabilities", "development_priorities"]),
      disclaimer: text(guide.rank_disclaimer),
      raw: board,
    },
    plan: {
      sevenDay: weeklyPlan,
      thirty: firstList(growth, ["day_30", "thirty_day", "plan_30", "first_30_days"]),
      sixty: firstList(growth, ["day_60", "sixty_day", "plan_60"]),
      ninety: firstList(growth, ["day_90", "ninety_day", "plan_90"]),
    },
    academy: growthEdges.slice(0, 5).map((edge) => ({
      title: edge,
      progress: null,
      nextLesson: "Academy-д энэ ур чадварын дараагийн дасгалыг нээнэ.",
    })),
    contentGuide: {
      themes: firstList(content, ["primaryPillars", "themes", "pillars", "content_pillars", "topics"]),
      channels: firstList(cadence, ["channels", "primary_channels", "formats"]),
      cadence: cadence,
      strategy: content,
      relationshipGuide: guide.relationship_guide,
      guardrails: firstList(record(guide.compliance_guardrails), ["rules", "guardrails", "limitations"]),
    },
    generatedAt: text(profile.generated_at),
    profileVersion: text(profile.profile_version),
    assessment: {
      version: text(onboarding.assessment_version),
      baselineAnswered: onboarding.baseline_answered,
      tailoredAnswered: onboarding.tailored_answered,
      completedAt: text(onboarding.completed_at),
    },
  };
}

export async function GET() {
  try {
    const member = await requirePersonalizationContext();
    const success = await loadSuccessContext(member);

    return Response.json(
      {
        profile: normalizeProfile(member.displayName, success.profile, success.guide, success.onboarding),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return personalizationErrorResponse(error);
  }
}
