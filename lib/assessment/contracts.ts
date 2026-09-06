export const BASELINE_TOTAL = 15;
export const TAILORED_TOTAL = 100;
export const ASSESSMENT_TOTAL = BASELINE_TOTAL + TAILORED_TOTAL;
export const ASSESSMENT_VERSION = "insuccess-v1";

export type AssessmentStage =
  | "baseline"
  | "analysis"
  | "tailored"
  | "ready_to_complete"
  | "completed";

export type AssessmentPhase = "baseline" | "tailored";

export type AssessmentResponseType =
  | "single_choice"
  | "multi_choice"
  | "scale"
  | "short_text"
  | "long_text"
  | "number";

export type AssessmentOption = {
  value: string;
  label: string;
  description?: string | null;
};

export type AssessmentQuestion = {
  id: string;
  phase: AssessmentPhase;
  position: number;
  prompt: string;
  helpText?: string | null;
  responseType: AssessmentResponseType;
  required: boolean;
  options?: AssessmentOption[];
  minSelections?: number;
  maxSelections?: number;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  placeholder?: string;
  maxLength?: number;
};

export type AssessmentSnapshot = {
  sessionId: string;
  stage: AssessmentStage;
  baselineAnswered: number;
  baselineTotal: typeof BASELINE_TOTAL;
  tailoredAnswered: number;
  tailoredTotal: typeof TAILORED_TOTAL;
  personalizationSource: "ai_gateway" | "adaptive_fallback" | null;
  personalizationModel: string | null;
  question: AssessmentQuestion | null;
};

export type AssessmentAnswer =
  | { kind: "answer"; value: string | number | string[] }
  | { kind: "skip"; reason: "not_sure" };

export type SaveAssessmentAnswerInput = {
  sessionId: string;
  questionId: string;
  phase: AssessmentPhase;
  clientAnswerId: string;
  answer: AssessmentAnswer;
};

export const assessmentStages = new Set<AssessmentStage>([
  "baseline",
  "analysis",
  "tailored",
  "ready_to_complete",
  "completed",
]);

export const assessmentPhases = new Set<AssessmentPhase>(["baseline", "tailored"]);
