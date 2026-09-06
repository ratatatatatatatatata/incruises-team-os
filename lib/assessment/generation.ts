import "server-only";

import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateTailoredQuestions, type BaselineEvidence } from "@/lib/ai/assessment";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { TAILORED_DIMENSIONS } from "./tailored-validation.mjs";
import type { AssessmentContext } from "./server";

export type TailoredPreparation = "complete" | "waiting" | "fallback";

type BaselineQuestionRow = {
  id: number | string;
  dimension: string;
  prompt: string;
  options: unknown;
};

type BaselineAnswerRow = {
  question_id: number | string;
  answer_kind: "answer" | "skip";
  answer_value: unknown;
};

function createAssessmentServiceClient(context: AssessmentContext) {
  if (!context.verified) return null;
  const config = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secretKey) return null;
  return createSupabaseClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function optionLabels(value: unknown) {
  if (!Array.isArray(value)) return new Map<string, string>();
  return new Map(value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const option = item as Record<string, unknown>;
    if (typeof option.value !== "string" || typeof option.label !== "string") return [];
    return [[option.value, option.label] as const];
  }));
}

function humanAnswer(answer: unknown, options: unknown): string | string[] | number | null {
  const labels = optionLabels(options);
  if (typeof answer === "number" && Number.isFinite(answer)) return answer;
  if (typeof answer === "string") return labels.get(answer) ?? answer;
  if (Array.isArray(answer)) {
    return answer
      .filter((item): item is string => typeof item === "string")
      .slice(0, 8)
      .map((item) => labels.get(item) ?? item);
  }
  return null;
}

async function loadBaselineEvidence(
  context: AssessmentContext,
  sessionId: string,
): Promise<BaselineEvidence[]> {
  const [questionsResult, answersResult] = await Promise.all([
    context.supabase
      .from("assessment_questions")
      .select("id,dimension,prompt,options")
      .eq("session_id", sessionId)
      .eq("phase", "baseline")
      .order("position", { ascending: true })
      .limit(15),
    context.supabase
      .from("assessment_answers")
      .select("question_id,answer_kind,answer_value")
      .eq("session_id", sessionId)
      .limit(15),
  ]);

  const firstError = questionsResult.error ?? answersResult.error;
  if (firstError) throw new Error("baseline_read_failed");
  const questions = (questionsResult.data ?? []) as BaselineQuestionRow[];
  const answers = (answersResult.data ?? []) as BaselineAnswerRow[];
  if (questions.length !== 15 || answers.length !== 15) throw new Error("baseline_evidence_incomplete");

  const answersByQuestion = new Map(answers.map((answer) => [String(answer.question_id), answer]));
  return questions.map((question) => {
    const answer = answersByQuestion.get(String(question.id));
    if (!answer || !TAILORED_DIMENSIONS.includes(question.dimension)) {
      throw new Error("baseline_evidence_invalid");
    }
    return {
      dimension: question.dimension,
      question: question.prompt,
      answer: answer.answer_kind === "skip" ? null : humanAnswer(answer.answer_value, question.options),
      skipped: answer.answer_kind === "skip",
    };
  });
}

export async function prepareAiTailoredQuestions(
  context: AssessmentContext,
  sessionId: string,
): Promise<TailoredPreparation> {
  const service = createAssessmentServiceClient(context);
  if (!service) return "fallback";

  const generationId = randomUUID();
  let claim: unknown;
  try {
    const claimResult = await service.rpc("claim_ai_tailored_generation", {
      p_user_id: context.userId,
      p_session_id: sessionId,
      p_generation_id: generationId,
    });
    if (claimResult.error) return "fallback";
    claim = claimResult.data;
  } catch {
    return "fallback";
  }
  if (claim === "ready") return "complete";
  if (claim === "wait") return "waiting";
  if (claim !== "acquired") return "fallback";

  let errorCode = "ai_generation_failed";
  try {
    const evidence = await loadBaselineEvidence(context, sessionId);
    const generation = await generateTailoredQuestions(evidence, generationId);
    errorCode = "ai_persistence_failed";
    const finalizeResult = await service.rpc("finalize_ai_tailored_question_snapshot", {
      p_user_id: context.userId,
      p_session_id: sessionId,
      p_generation_id: generation.generationId,
      p_model: generation.model,
      p_prompt_version: generation.promptVersion,
      p_questions: generation.questions,
      p_input_tokens: generation.inputTokens,
      p_output_tokens: generation.outputTokens,
    });
    if (finalizeResult.error) throw new Error("ai_persistence_failed");
    return "complete";
  } catch (error) {
    if (error instanceof Error && error.message === "ai_gateway_unconfigured") {
      errorCode = "ai_gateway_unconfigured";
    } else if (error instanceof Error && error.message.includes("question")) {
      errorCode = "ai_output_rejected";
    }
    try {
      await service.rpc("record_ai_tailored_generation_failure", {
        p_generation_id: generationId,
        p_error_code: errorCode,
      });
    } catch {
      // The deterministic snapshot remains available even if telemetry cannot be recorded.
    }
    console.warn("Tailored question generation used the deterministic fallback", { errorCode });
    return "fallback";
  }
}
