export type StarterAnswers = {
  currentContext: string;
  goal30Day: string;
  weeklyCapacity: string;
  primaryBlocker: string;
  growthPreferences: string;
};

export type AcademyLessonCandidate = {
  id: string;
  levelId: string;
  title: string;
  minutes: number;
};

export type SuccessMapPlan = {
  version: 1 | 2;
  generatedAt: string;
  profileSummary: string;
  whyThisPlan: string;
  todayAction: {
    title: string;
    detail: string;
    minutes: number;
  };
  weeklyActions: Array<{
    title: string;
    detail: string;
    doneWhen: string;
  }>;
  managementPlan: {
    focus: string[];
    cadence: string[];
    measures: string[];
  };
  contentPlan: {
    pillars: string[];
    sevenDayPlan: Array<{
      day: string;
      action: string;
    }>;
    guardrails: string[];
  };
  academyRecommendation: {
    lessonId: string;
    levelId: string;
    title: string;
    minutes: number;
    reason: string;
  } | null;
  generation: {
    source: "deterministic" | "ai_gateway";
    aiModel: string | null;
    aiFallbackReason: string | null;
  };
};

export type StoredSuccessMap = {
  answers: StarterAnswers;
  plan: SuccessMapPlan;
  planSource: "deterministic" | "ai_gateway";
  aiConsent: boolean;
  completedAt: string;
  updatedAt: string;
};
