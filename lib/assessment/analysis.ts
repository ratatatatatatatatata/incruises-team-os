export const assessmentDimensions = [
  "direction",
  "consistency",
  "communication",
  "relationships",
  "content",
  "leadership",
  "learning",
  "resilience",
  "planning",
  "compliance",
] as const;

export type AssessmentDimension = (typeof assessmentDimensions)[number];

export const assessmentStyleLabels: Record<AssessmentDimension, string> = {
  direction: "Зорилгын чиглүүлэгч",
  consistency: "Тогтвортой хэрэгжүүлэгч",
  communication: "Итгэлцэлтэй харилцагч",
  relationships: "Харилцаа бүтээгч",
  content: "Контент өгүүлэгч",
  leadership: "Баг хөгжүүлэгч",
  learning: "Тасралтгүй суралцагч",
  resilience: "Тэсвэртэй урагшлагч",
  planning: "Системтэй төлөвлөгч",
  compliance: "Хариуцлагатай бүтээгч",
};

export const rankDisclaimer =
  "Энэ маршрут нь Board Director цол, орлого эсвэл тодорхой хугацаанд үр дүн гарна гэж амлахгүй. Бодит үр дүн нь хүний үйлдэл, багийн нөхцөл болон inCruises-ийн тухайн үеийн албан шаардлагаас хамаарна.";

export type ScoredAssessmentAnswer = {
  dimension: AssessmentDimension;
  value: number | null;
};

export type DeterministicAssessmentAnalysis = {
  dimensionScores: Record<AssessmentDimension, number>;
  primaryStyle: string;
  secondaryStyle: string;
  strengths: string[];
  growthEdges: string[];
  answered: number;
  skipped: number;
  rankDisclaimer: string;
};

/**
 * Mirrors the database completion method for previews and tests. The database
 * remains authoritative and recomputes the persisted profile from saved rows.
 */
export function analyzeAssessment(answers: ScoredAssessmentAnswer[]): DeterministicAssessmentAnalysis {
  const dimensionScores = Object.fromEntries(
    assessmentDimensions.map((dimension) => {
      const values = answers
        .filter((answer) => answer.dimension === dimension && answer.value !== null)
        .map((answer) => answer.value as number);
      const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return [dimension, Math.round(average * 20)];
    }),
  ) as Record<AssessmentDimension, number>;

  const ranked = assessmentDimensions
    .map((dimension) => ({ dimension, label: assessmentStyleLabels[dimension], score: dimensionScores[dimension] }))
    .sort((left, right) => right.score - left.score || left.dimension.localeCompare(right.dimension));

  const answered = answers.filter((answer) => answer.value !== null).length;

  return {
    dimensionScores,
    primaryStyle: answered < 30 ? "Нэмэлт мэдээлэл шаардлагатай" : ranked[0].label,
    secondaryStyle: answered < 30 ? "" : ranked[1].label,
    strengths: answered < 30 ? [] : ranked.slice(0, 3).map((item) => item.label),
    growthEdges: answered < 30 ? [] : [...ranked]
      .sort((left, right) => left.score - right.score || left.dimension.localeCompare(right.dimension))
      .slice(0, 3)
      .map((item) => item.label),
    answered,
    skipped: answers.length - answered,
    rankDisclaimer,
  };
}
