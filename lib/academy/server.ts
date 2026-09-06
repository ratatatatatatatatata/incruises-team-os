import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export class AcademyAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireAcademyMember() {
  if (!isSupabaseConfigured()) {
    throw new AcademyAccessError(503, "supabase_not_configured", "Academy database тохируулаагүй байна.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";

  if (error || !userId || isAnonymous) {
    throw new AcademyAccessError(401, "sign_in_required", "Нэвтрэх шаардлагатай.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  const member = membership as {
    role: "builder" | "coach" | "director" | "admin";
    status: "pending" | "active" | "disabled";
  } | null;

  if (!member || member.status !== "active") {
    throw new AcademyAccessError(403, "active_member_required", "Academy-д идэвхтэй гишүүний эрх шаардлагатай.");
  }

  return { supabase, userId, role: member.role };
}

export function academyJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}

export function academyFailure(error: unknown) {
  if (error instanceof AcademyAccessError) {
    return academyJson({ error: error.message, code: error.code }, error.status);
  }

  console.error("Academy request failed");
  return academyJson({ error: "Academy түр ажиллахгүй байна.", code: "academy_unavailable" }, 500);
}

export function assertAcademySameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AcademyAccessError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

export async function readAcademyJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = request.headers.get("content-length");
  const declaredBytes = contentLength === null ? 0 : Number(contentLength);
  if (
    !contentType.includes("application/json") ||
    !Number.isFinite(declaredBytes) ||
    declaredBytes < 0 ||
    declaredBytes > 8_192
  ) {
    throw new AcademyAccessError(400, "invalid_request", "Жижиг JSON хүсэлт шаардлагатай.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8_192) {
    throw new AcademyAccessError(400, "invalid_request", "Жижиг JSON хүсэлт шаардлагатай.");
  }

  try {
    const body = JSON.parse(rawBody) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not_an_object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new AcademyAccessError(400, "invalid_json", "Хүсэлтийн JSON буруу байна.");
  }
}
