import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sharingLevels = new Set(["private", "summary", "detailed"]);
const CONSENT_VERSION = "success-map-2026-08-31-v1";

class PrivacyRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}

async function context() {
  if (!isSupabaseConfigured()) throw new PrivacyRequestError(503, "not_configured", "Өгөгдлийн үйлчилгээ тохируулагдаагүй байна.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (error || !userId || isAnonymous) throw new PrivacyRequestError(401, "sign_in_required", "Нэвтэрч орно уу.");
  return { supabase, userId };
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new PrivacyRequestError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!contentType.includes("application/json") || contentLength > 4_096) {
    throw new PrivacyRequestError(400, "invalid_request", "JSON хүсэлт шаардлагатай.");
  }
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PrivacyRequestError(400, "invalid_json", "Хүсэлтийн мэдээлэл буруу байна.");
  }
  return body as Record<string, unknown>;
}

function failure(error: unknown) {
  if (error instanceof PrivacyRequestError) return json({ error: error.message, code: error.code }, error.status);
  console.error("Privacy preferences request failed");
  return json({ error: "Нууцлалын тохиргоо түр ажиллахгүй байна.", code: "privacy_unavailable" }, 500);
}

function responseShape(row: {
  assessment_consent: boolean;
  assessment_consent_version: string | null;
  assessment_consented_at: string | null;
  sharing_level: string;
  assistant_memory: boolean;
} | null) {
  return {
    assessmentConsent: row?.assessment_consent ?? false,
    consentVersion: row?.assessment_consent_version ?? null,
    consentedAt: row?.assessment_consented_at ?? null,
    sharingLevel: row?.sharing_level ?? "private",
    assistantMemory: row?.assistant_memory ?? true,
  };
}

export async function GET() {
  try {
    const { supabase, userId } = await context();
    const { data, error } = await supabase
      .from("member_privacy_preferences")
      .select("assessment_consent,assessment_consent_version,assessment_consented_at,sharing_level,assistant_memory")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return json({ preferences: responseShape(data) });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    const { supabase, userId } = await context();
    const action = String(body.action ?? "");

    if (action === "accept_assessment") {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("member_privacy_preferences")
        .upsert(
          {
            user_id: userId,
            assessment_consent: true,
            assessment_consent_version: CONSENT_VERSION,
            assessment_consented_at: now,
            updated_at: now,
          },
          { onConflict: "user_id" },
        )
        .select("assessment_consent,assessment_consent_version,assessment_consented_at,sharing_level,assistant_memory")
        .single();
      if (error) throw error;
      return json({ preferences: responseShape(data) });
    }

    if (action === "withdraw_assessment") {
      const { data, error } = await supabase.rpc("withdraw_assessment_consent");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] ?? null : data;
      return json({ preferences: responseShape(row) });
    }

    if (action === "update_preferences") {
      const sharingLevel = String(body.sharingLevel ?? "");
      const assistantMemory = body.assistantMemory;
      if (!sharingLevels.has(sharingLevel) || typeof assistantMemory !== "boolean") {
        throw new PrivacyRequestError(400, "invalid_preferences", "Нууцлалын сонголт буруу байна.");
      }

      const { data, error } = await supabase
        .from("member_privacy_preferences")
        .update({ sharing_level: sharingLevel, assistant_memory: assistantMemory, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("assessment_consent", true)
        .select("assessment_consent,assessment_consent_version,assessment_consented_at,sharing_level,assistant_memory")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new PrivacyRequestError(409, "consent_required", "Эхлээд Success Map-ийн зөвшөөрлөө баталгаажуулна уу.");
      }
      return json({ preferences: responseShape(data) });
    }

    throw new PrivacyRequestError(400, "unknown_action", "Танигдаагүй нууцлалын үйлдэл байна.");
  } catch (error) {
    return failure(error);
  }
}
