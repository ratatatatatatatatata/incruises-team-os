export const TAILORED_DIMENSIONS: readonly [
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
];

export type TailoredDimension = (typeof TAILORED_DIMENSIONS)[number];

export type GeneratedDimensionSection = {
  dimension: TailoredDimension;
  scales: Array<{ prompt: string; helpText: string }>;
  reflections: Array<{ prompt: string; helpText: string }>;
};

export type TailoredQuestionDraft = {
  position: number;
  dimension: TailoredDimension;
  prompt: string;
  helpText: string;
  responseType: "scale" | "short_text";
};

export function buildTailoredQuestionSet(value: unknown): TailoredQuestionDraft[];
