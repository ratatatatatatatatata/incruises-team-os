import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { prepareAiTailoredQuestions } from "./generation";
import {
  ASSESSMENT_VERSION,
  BASELINE_TOTAL,
  TAILORED_TOTAL,
  assessmentPhases,
  assessmentStages,
  type AssessmentAnswer,
  type AssessmentOption,
  type AssessmentPhase,
  type AssessmentQuestion,
  type AssessmentSnapshot,
  type AssessmentStage,
  type SaveAssessmentAnswerInput,
} from "./contracts";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export type AssessmentContext = {
  supabase: SessionClient;
  userId: string;
  verified: true;
};

type StateRow = {
  user_id: string;
  active_session_id: string | null;
  status: string;
  assessment_version: string;
  baseline_answered: number;
  tailored_answered: number;
  active_session: unknown;
};

type QuestionRow = {
  id: number | string;
  phase: AssessmentPhase;
  position: number;
  prompt: string;
  help_text: string | null;
  response_type: AssessmentQuestion["responseType"];
  required: boolean;
  options: unknown;
  response_config: unknown;
};

type DatabaseError = { code?: string; message?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bigintPattern = /^[1-9][0-9]{0,18}$/;
export class AssessmentRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function assessmentJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}

export function assessmentFailure(error: unknown) {
  if (error instanceof AssessmentRequestError) {
    return assessmentJson({ error: error.message, code: error.code }, error.status);
  }

  const databaseError = error as DatabaseError;
  if (databaseError?.code === "P0002") {
    return assessmentJson({ error: "Assessment session олдсонгүй.", code: "session_not_found" }, 404);
  }
  if (databaseError?.code === "42501") {
    return assessmentJson({ error: "Энэ assessment-д хандах эрхгүй байна.", code: "assessment_forbidden" }, 403);
  }
  if (databaseError?.code === "22023" || databaseError?.code === "23505") {
    return assessmentJson(
      { error: databaseError.message ?? "Assessment-ийн төлөв эсвэл хариулт буруу байна.", code: "assessment_conflict" },
      409,
    );
  }

  console.error("Onboarding assessment request failed");
  return assessmentJson({ error: "Assessment service түр ажиллахгүй байна.", code: "assessment_unavailable" }, 500);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AssessmentRequestError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

export async function readAssessmentBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!contentType.includes("application/json") || contentLength > 16_384) {
    throw new AssessmentRequestError(400, "invalid_request", "16KB-аас бага JSON хүсэлт шаардлагатай.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
    throw new AssessmentRequestError(400, "invalid_request", "16KB-аас бага JSON хүсэлт шаардлагатай.");
  }

  try {
    const body = JSON.parse(rawBody) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    throw new AssessmentRequestError(400, "invalid_json", "Хүсэлтийн JSON буруу байна.");
  }
}

export async function requireAssessmentContext(): Promise<AssessmentContext> {
  if (!isSupabaseConfigured()) {
    throw new AssessmentRequestError(503, "not_configured", "Өгөгдлийн үйлчилгээ тохируулагдаагүй байна.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (error || !userId || claims?.is_anonymous === true) {
    throw new AssessmentRequestError(401, "sign_in_required", "Нэвтэрч орно уу.");
  }

  return { supabase, userId, verified: true };
}

export async function requireAssessmentConsent(context: AssessmentContext) {
  const { data, error } = await context.supabase
    .from("member_privacy_preferences")
    .select("assessment_consent")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.assessment_consent !== true) {
    throw new AssessmentRequestError(
      428,
      "privacy_consent_required",
      "Success Map assessment эхлүүлэхийн өмнө нууцлалын зөвшөөрөл өгнө үү.",
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asOptions(value: unknown): AssessmentOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.flatMap((item) => {
    const option = asRecord(item);
    if (typeof option.value !== "string" || typeof option.label !== "string") return [];
    return [{
      value: option.value,
      label: option.label,
      description: typeof option.description === "string" ? option.description : null,
    }];
  });
  return options.length > 0 ? options : undefined;
}

function questionFromRow(row: QuestionRow): AssessmentQuestion {
  const config = asRecord(row.response_config);
  const question: AssessmentQuestion = {
    id: String(row.id),
    phase: row.phase,
    position: row.position,
    prompt: row.prompt,
    helpText: row.help_text,
    responseType: row.response_type,
    required: row.required,
  };

  const options = asOptions(row.options);
  if (options) question.options = options;
  if (typeof config.minSelections === "number") question.minSelections = config.minSelections;
  if (typeof config.maxSelections === "number") question.maxSelections = config.maxSelections;
  if (typeof config.min === "number") question.min = config.min;
  if (typeof config.max === "number") question.max = config.max;
  if (typeof config.minLabel === "string") question.minLabel = config.minLabel;
  if (typeof config.maxLabel === "string") question.maxLabel = config.maxLabel;
  if (typeof config.placeholder === "string") question.placeholder = config.placeholder;
  if (typeof config.maxLength === "number") question.maxLength = config.maxLength;
  return question;
}

async function readState(context: AssessmentContext): Promise<StateRow | null> {
  const { data, error } = await context.supabase
    .from("member_onboarding_state")
    .select("user_id,active_session_id,status,assessment_version,baseline_answered,tailored_answered,active_session:assessment_sessions!member_onboarding_state_active_session_owner_fkey(adaptation_context)")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  return data as StateRow | null;
}

async function beginSession(context: AssessmentContext): Promise<string> {
  const { data, error } = await context.supabase.rpc("begin_onboarding_assessment");
  if (error) throw error;
  if (typeof data !== "string" || !uuidPattern.test(data)) {
    throw new AssessmentRequestError(500, "invalid_session", "Assessment session үүссэнгүй.");
  }
  return data;
}

async function prepareTailoredQuestions(context: AssessmentContext, sessionId: string) {
  const preparation = await prepareAiTailoredQuestions(context, sessionId);
  if (preparation === "complete" || preparation === "waiting") return;

  const { error } = await context.supabase.rpc("snapshot_onboarding_tailored_questions", {
    p_session_id: sessionId,
  });
  if (error) throw error;
}

function personalizationMetadata(state: StateRow) {
  const joinedSession = asRecord(state.active_session);
  const context = asRecord(joinedSession.adaptation_context);
  const algorithmVersion = typeof context.algorithmVersion === "string" ? context.algorithmVersion : "";
  return {
    personalizationSource: algorithmVersion === "ai-tailored-v2"
      ? "ai_gateway" as const
      : algorithmVersion.startsWith("adaptive-branch-")
        ? "adaptive_fallback" as const
        : null,
    personalizationModel: algorithmVersion === "ai-tailored-v2" && typeof context.model === "string"
      ? context.model
      : null,
  };
}

async function currentQuestion(
  context: AssessmentContext,
  sessionId: string,
  stage: AssessmentStage,
): Promise<AssessmentQuestion | null> {
  if (stage !== "baseline" && stage !== "tailored") return null;

  const phase: AssessmentPhase = stage;
  const [questionsResult, answersResult] = await Promise.all([
    context.supabase
      .from("assessment_questions")
      .select("id,phase,position,prompt,help_text,response_type,required,options,response_config")
      .eq("session_id", sessionId)
      .eq("phase", phase)
      .order("position", { ascending: true })
      .limit(stage === "baseline" ? BASELINE_TOTAL : TAILORED_TOTAL),
    context.supabase
      .from("assessment_answers")
      .select("question_id")
      .eq("session_id", sessionId)
      .limit(BASELINE_TOTAL + TAILORED_TOTAL),
  ]);

  const firstError = questionsResult.error ?? answersResult.error;
  if (firstError) throw firstError;
  const answered = new Set((answersResult.data ?? []).map((row) => String(row.question_id)));
  const question = ((questionsResult.data ?? []) as QuestionRow[]).find((row) => !answered.has(String(row.id)));
  return question ? questionFromRow(question) : null;
}

export async function loadAssessmentSnapshot(
  context: AssessmentContext,
  options: { createIfMissing?: boolean } = {},
): Promise<AssessmentSnapshot> {
  let state = await readState(context);

  if ((!state || !state.active_session_id) && options.createIfMissing) {
    await beginSession(context);
    state = await readState(context);
  }

  if (!state?.active_session_id) {
    throw new AssessmentRequestError(404, "session_not_found", "Assessment session эхлээгүй байна.");
  }
  if (state.assessment_version !== ASSESSMENT_VERSION || !assessmentStages.has(state.status as AssessmentStage)) {
    throw new AssessmentRequestError(409, "unsupported_assessment", "Assessment-ийн version эсвэл төлөв дэмжигдэхгүй байна.");
  }

  if (state.status === "analysis") {
    await prepareTailoredQuestions(context, state.active_session_id);
    state = await readState(context);
    if (!state?.active_session_id) {
      throw new AssessmentRequestError(500, "invalid_session", "Adaptive question snapshot үүссэнгүй.");
    }
  }

  const stage = state.status as AssessmentStage;
  const question = await currentQuestion(context, state.active_session_id, stage);

  if ((stage === "baseline" || stage === "tailored") && !question) {
    throw new AssessmentRequestError(409, "question_snapshot_incomplete", "Assessment question snapshot бүрэн биш байна.");
  }

  return {
    sessionId: state.active_session_id,
    stage,
    baselineAnswered: state.baseline_answered,
    baselineTotal: BASELINE_TOTAL,
    tailoredAnswered: state.tailored_answered,
    tailoredTotal: TAILORED_TOTAL,
    ...personalizationMetadata(state),
    question,
  };
}

function parseAnswer(value: unknown): AssessmentAnswer {
  const answer = asRecord(value);
  if (answer.kind === "skip" && answer.reason === "not_sure") {
    return { kind: "skip", reason: "not_sure" };
  }

  if (answer.kind !== "answer") {
    throw new AssessmentRequestError(400, "invalid_answer", "Хариултын төрөл буруу байна.");
  }

  const answerValue = answer.value;
  if (typeof answerValue === "number" && Number.isFinite(answerValue)) {
    return { kind: "answer", value: answerValue };
  }
  if (typeof answerValue === "string" && answerValue.length <= 2_000) {
    return { kind: "answer", value: answerValue };
  }
  if (
    Array.isArray(answerValue)
    && answerValue.length <= 100
    && answerValue.every((item) => typeof item === "string" && item.length <= 200)
  ) {
    return { kind: "answer", value: answerValue };
  }

  throw new AssessmentRequestError(400, "invalid_answer", "Хариултын утга буруу байна.");
}

export function parseSaveAnswerInput(body: Record<string, unknown>): SaveAssessmentAnswerInput {
  const sessionId = String(body.sessionId ?? "");
  const questionId = String(body.questionId ?? "");
  const phase = String(body.phase ?? "") as AssessmentPhase;
  const clientAnswerId = String(body.clientAnswerId ?? "");

  if (!uuidPattern.test(sessionId)) {
    throw new AssessmentRequestError(400, "invalid_session", "Session ID буруу байна.");
  }
  if (!bigintPattern.test(questionId)) {
    throw new AssessmentRequestError(400, "invalid_question", "Question ID буруу байна.");
  }
  if (!assessmentPhases.has(phase)) {
    throw new AssessmentRequestError(400, "invalid_phase", "Assessment phase буруу байна.");
  }
  if (!uuidPattern.test(clientAnswerId)) {
    throw new AssessmentRequestError(400, "invalid_answer_id", "clientAnswerId UUID байх шаардлагатай.");
  }

  return {
    sessionId,
    questionId,
    phase,
    clientAnswerId,
    answer: parseAnswer(body.answer),
  };
}

export async function saveAssessmentAnswer(context: AssessmentContext, input: SaveAssessmentAnswerInput) {
  const { error } = await context.supabase.rpc("save_onboarding_answer", {
    p_session_id: input.sessionId,
    p_question_id: input.questionId,
    p_client_answer_id: input.clientAnswerId,
    p_answer_kind: input.answer.kind,
    p_answer_value: input.answer.kind === "answer" ? input.answer.value : null,
    p_skip_reason: input.answer.kind === "skip" ? input.answer.reason : null,
  });
  if (error) throw error;
}

export function parseCompletionSessionId(body: Record<string, unknown>): string {
  const sessionId = String(body.sessionId ?? "");
  if (!uuidPattern.test(sessionId)) {
    throw new AssessmentRequestError(400, "invalid_session", "Session ID буруу байна.");
  }
  return sessionId;
}

export async function completeAssessment(context: AssessmentContext, sessionId: string) {
  const snapshot = await loadAssessmentSnapshot(context);
  if (snapshot.sessionId !== sessionId) {
    throw new AssessmentRequestError(404, "session_not_found", "Assessment session олдсонгүй.");
  }
  if (snapshot.stage !== "ready_to_complete" && snapshot.stage !== "completed") {
    throw new AssessmentRequestError(409, "assessment_incomplete", "15+100 хариултаа бүрэн хадгалсны дараа дуусгана.");
  }

  const { error } = await context.supabase.rpc("complete_onboarding_assessment", {
    p_session_id: sessionId,
  });
  if (error) throw error;
}
