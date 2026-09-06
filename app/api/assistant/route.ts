import { DEFAULT_MENTOR_MODEL, generateMentorReply, type MentorAction, type MentorMode } from "@/lib/ai/mentor";
import {
  createPersonalizationServiceClient,
  loadSuccessContext,
  personalizationErrorResponse,
  PersonalizationAccessError,
  requirePersonalizationContext,
} from "@/lib/ai/member-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const modes = new Set<MentorMode>(["simple", "step_by_step", "fast"]);
const actions = new Set<MentorAction>([
  "today",
  "lesson",
  "conversation_practice",
  "content_idea",
  "weekly_reflection",
  "custom",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      ...extraHeaders,
    },
  });
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new PersonalizationAccessError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!contentType.includes("application/json") || contentLength > 16_384) {
    throw new PersonalizationAccessError(400, "invalid_request", "JSON хүсэлт шаардлагатай.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
    throw new PersonalizationAccessError(400, "invalid_request", "Хүсэлтийн хэмжээ хэтэрсэн байна.");
  }

  try {
    const body = JSON.parse(rawBody) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_body");
    return body as Record<string, unknown>;
  } catch {
    throw new PersonalizationAccessError(400, "invalid_json", "Хүсэлтийн мэдээлэл буруу байна.");
  }
}

function safeConversationId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value);
  if (!uuidPattern.test(id)) {
    throw new PersonalizationAccessError(400, "invalid_conversation", "Ярилцлагын дугаар буруу байна.");
  }
  return id;
}

function compactSuccessContext(profile: Record<string, unknown>, guide: Record<string, unknown>) {
  return {
    profile: {
      profile_version: profile.profile_version,
      primary_style: profile.primary_style,
      secondary_style: profile.secondary_style,
      dimension_scores: profile.dimension_scores,
      dimension_evidence_counts: profile.dimension_evidence_counts,
      strengths: profile.strengths,
      growth_edges: profile.growth_edges,
      motivation_pattern: profile.motivation_pattern,
      communication_style: profile.communication_style,
      work_rhythm: profile.work_rhythm,
      confidence_note: profile.confidence_note,
    },
    guide: {
      guide_version: guide.guide_version,
      board_director_route: guide.board_director_route,
      content_strategy: guide.content_strategy,
      social_cadence: guide.social_cadence,
      relationship_guide: guide.relationship_guide,
      weekly_plan: guide.weekly_plan,
      growth_plan: guide.growth_plan,
      compliance_guardrails: guide.compliance_guardrails,
      rank_disclaimer: guide.rank_disclaimer,
    },
  };
}

function rpcFailure(error: { code?: string; message?: string }): never {
  if (error.code === "P0001" && error.message?.includes("assistant_rate_limited")) {
    throw new PersonalizationAccessError(429, "rate_limited", "Түр азхан завсарлаад дахин оролдоно уу.");
  }
  if (error.code === "P0002") {
    throw new PersonalizationAccessError(404, "conversation_not_found", "Ярилцлага олдсонгүй.");
  }
  if (error.code === "22023") {
    throw new PersonalizationAccessError(400, "invalid_assistant_request", "Assistant хүсэлтийн мэдээлэл буруу байна.");
  }
  if (error.code === "42501" && error.message?.includes("Assistant consent withdrawn")) {
    throw new PersonalizationAccessError(
      428,
      "privacy_consent_required",
      "Зөвшөөрөл цуцлагдсан тул AI хүсэлтийг зогсоолоо. Нууцлал хэсгээс дахин идэвхжүүлнэ үү.",
    );
  }
  if (error.code === "42501") {
    throw new PersonalizationAccessError(403, "assistant_forbidden", "Энэ assistant-д хандах эрх алга.");
  }
  throw error;
}

export async function GET(request: Request) {
  try {
    const member = await requirePersonalizationContext();
    const requestedConversation = safeConversationId(new URL(request.url).searchParams.get("conversation"));
    const conversationsResult = await member.supabase
      .from("ai_conversations")
      .select("id,title,mode,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (conversationsResult.error) throw conversationsResult.error;

    const conversations = conversationsResult.data ?? [];
    const conversationId = requestedConversation ?? (conversations[0]?.id as string | undefined) ?? null;
    let messages: unknown[] = [];

    if (conversationId) {
      if (!conversations.some((conversation) => conversation.id === conversationId)) {
        const { data: ownedConversation, error: ownedConversationError } = await member.supabase
          .from("ai_conversations")
          .select("id")
          .eq("id", conversationId)
          .maybeSingle();
        if (ownedConversationError) throw ownedConversationError;
        if (!ownedConversation) {
          throw new PersonalizationAccessError(404, "conversation_not_found", "Ярилцлага олдсонгүй.");
        }
      }

      const [messagesResult, generationsResult] = await Promise.all([
        member.supabase
          .from("ai_messages")
          .select("id,conversation_id,generation_id,role,content,created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(200),
        member.supabase
          .from("ai_generations")
          .select("id,source")
          .eq("conversation_id", conversationId)
          .limit(200),
      ]);
      if (messagesResult.error) throw messagesResult.error;
      if (generationsResult.error) throw generationsResult.error;
      const generationSources = new Map(
        (generationsResult.data ?? []).map((generation) => [generation.id, generation.source]),
      );
      messages = (messagesResult.data ?? []).map((message) => ({
        ...message,
        source: message.generation_id ? generationSources.get(message.generation_id) ?? null : null,
      }));
    }

    return json({ conversations, conversationId, messages });
  } catch (error) {
    return personalizationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    const member = await requirePersonalizationContext();
    const service = createPersonalizationServiceClient(member);
    const success = await loadSuccessContext(member);
    const message = String(body.message ?? "").trim();
    const mode = String(body.mode ?? "simple") as MentorMode;
    const action = String(body.action ?? "custom") as MentorAction;
    const conversationId = safeConversationId(body.conversationId);

    if (message.length < 1 || message.length > 2_000 || !modes.has(mode) || !actions.has(action)) {
      throw new PersonalizationAccessError(400, "invalid_assistant_request", "1–2000 тэмдэгттэй асуулт болон зөв горим сонгоно уу.");
    }

    const configuredModel = process.env.INSUCCESS_AI_MODEL?.trim() || DEFAULT_MENTOR_MODEL;
    const { data: privacyRow, error: privacyError } = await member.supabase
      .from("member_privacy_preferences")
      .select("assistant_memory")
      .eq("user_id", member.userId)
      .maybeSingle();
    if (privacyError) throw privacyError;
    const assistantMemory = privacyRow?.assistant_memory !== false;
    const effectiveConversationId = assistantMemory ? conversationId : null;
    const modelContext = compactSuccessContext(success.profile, success.guide);
    const contextSnapshot = {
      ...modelContext,
      assistant_memory: assistantMemory,
    };
    const title = message.replace(/\s+/g, " ").slice(0, 80);
    const { data: createdRows, error: createError } = await service.rpc("create_assistant_turn", {
      p_actor: member.userId,
      p_conversation_id: effectiveConversationId,
      p_title: title,
      p_mode: mode,
      p_message: message,
      p_model: configuredModel,
      p_context_snapshot: contextSnapshot,
    });
    if (createError) rpcFailure(createError);

    const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
    const createdRecord = created as { conversation_id?: string; generation_id?: string } | null;
    const nextConversationId = createdRecord?.conversation_id;
    const generationId = createdRecord?.generation_id;
    if (!nextConversationId || !generationId) throw new Error("assistant_turn_not_created");

    try {
      const historyResult = assistantMemory
        ? await member.supabase
            .from("ai_messages")
            .select("role,content,generation_id,created_at,id")
            .eq("conversation_id", nextConversationId)
            .neq("generation_id", generationId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(10)
        : { data: [], error: null };
      if (historyResult.error) throw historyResult.error;

      const recentMessages = (historyResult.data ?? [])
        .slice()
        .reverse()
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role as "user" | "assistant", content: String(item.content) }));

      const { data: currentConsent, error: currentConsentError } = await member.supabase
        .from("member_privacy_preferences")
        .select("assessment_consent")
        .eq("user_id", member.userId)
        .maybeSingle();
      if (currentConsentError) throw currentConsentError;
      if (currentConsent?.assessment_consent !== true) {
        const closed = await service.rpc("fail_assistant_turn", {
          p_actor: member.userId,
          p_generation_id: generationId,
          p_error_code: "consent_withdrawn",
        });
        if (closed.error) rpcFailure(closed.error);
        throw new PersonalizationAccessError(
          428,
          "privacy_consent_required",
          "Зөвшөөрөл цуцлагдсан тул AI хүсэлтийг зогсоолоо. Нууцлал хэсгээс дахин идэвхжүүлнэ үү.",
        );
      }

      const reply = await generateMentorReply({
        message,
        mode,
        action,
        profile: {
          ...modelContext.profile,
          user_reflections: success.reflections.slice(0, 12).map((reflection) => ({
            dimension: reflection.dimension,
            question: reflection.question,
            answer: reflection.answer.slice(0, 320),
          })),
        },
        guide: modelContext.guide,
        recentMessages,
        abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
      });

      const completionInput = {
        p_actor: member.userId,
        p_generation_id: generationId,
        p_result: reply.text,
        p_model: reply.model,
        p_source: reply.source,
        p_error_code: reply.errorCode ?? null,
        p_input_tokens: reply.usage?.inputTokens ?? null,
        p_output_tokens: reply.usage?.outputTokens ?? null,
        p_total_tokens: reply.usage?.totalTokens ?? null,
      };
      let completion = await service.rpc("complete_assistant_turn", completionInput);
      if (completion.error && !["22023", "42501", "55000", "P0002"].includes(completion.error.code ?? "")) {
        completion = await service.rpc("complete_assistant_turn", completionInput);
      }
      if (completion.error) rpcFailure(completion.error);

      return json(
        {
          conversationId: nextConversationId,
          generationId,
          reply: reply.text,
          source: reply.source,
          mode,
          assistantMemory,
          suggestions: ["Өнөөдрийн алхам", "Ярианы дасгал", "Долоо хоногоо дүгнэх"],
        },
        effectiveConversationId ? 200 : 201,
        reply.errorCode === "gateway_failed" ? { "X-inSuccess-AI-Fallback": "gateway_failed" } : undefined,
      );
    } catch (error) {
      const failureCode =
        error instanceof PersonalizationAccessError && error.code === "privacy_consent_required"
          ? "consent_withdrawn"
          : "assistant_turn_failed";
      await service.rpc("fail_assistant_turn", {
        p_actor: member.userId,
        p_generation_id: generationId,
        p_error_code: failureCode,
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof PersonalizationAccessError && error.status === 429) {
      return json({ error: error.message, code: error.code }, 429, { "Retry-After": "60" });
    }
    return personalizationErrorResponse(error);
  }
}
