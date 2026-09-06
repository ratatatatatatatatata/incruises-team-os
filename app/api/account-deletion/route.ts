import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

type DeletionStatus = "requested" | "processing" | "cancelled" | "completed";

type DeletionRow = {
  status: DeletionStatus;
  requested_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

class AccountDeletionError extends Error {
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
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Vary: "Cookie",
    },
  });
}

async function requestContext() {
  if (!isSupabaseConfigured()) {
    throw new AccountDeletionError(503, "not_configured", "Өгөгдлийн үйлчилгээ тохируулагдаагүй байна.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";

  if (error || !userId || isAnonymous) {
    throw new AccountDeletionError(401, "sign_in_required", "Account-даа нэвтэрч орно уу.");
  }

  return { supabase, userId };
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AccountDeletionError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (
    !contentType.includes("application/json") ||
    (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 2_048))
  ) {
    throw new AccountDeletionError(400, "invalid_request", "JSON хүсэлт шаардлагатай.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 2_048) {
    throw new AccountDeletionError(413, "request_too_large", "Хүсэлтийн хэмжээ хэтэрсэн байна.");
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AccountDeletionError(400, "invalid_json", "Хүсэлтийн мэдээлэл буруу байна.");
  }
  return body as Record<string, unknown>;
}

function responseShape(row: DeletionRow | null) {
  if (!row) return null;
  return {
    status: row.status,
    requestedAt: row.requested_at,
    cancelledAt: row.cancelled_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

async function readRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<DeletionRow | null> {
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("status,requested_at,cancelled_at,completed_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as DeletionRow | null;
}

function databaseError(error: unknown): never {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

  if (code === "42501") {
    throw new AccountDeletionError(403, "not_allowed", "Энэ үйлдлийг хийх эрхгүй байна.");
  }
  if (code === "22023") {
    throw new AccountDeletionError(409, "invalid_state", "Хүсэлтийн одоогийн төлөв энэ үйлдлийг зөвшөөрөхгүй байна.");
  }
  throw error;
}

function failure(error: unknown) {
  if (error instanceof AccountDeletionError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("Account deletion request failed");
  return json({ error: "Account устгах хүсэлтийг одоогоор ажиллуулж чадсангүй.", code: "deletion_unavailable" }, 500);
}

export async function GET() {
  try {
    const { supabase, userId } = await requestContext();
    const request = await readRequest(supabase, userId);
    return json({ request: responseShape(request) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    const action = body.action;
    if (action !== "request" && action !== "cancel") {
      throw new AccountDeletionError(400, "unknown_action", "Танигдаагүй account deletion үйлдэл байна.");
    }

    const { supabase, userId } = await requestContext();
    const functionName = action === "request"
      ? "request_account_deletion"
      : "cancel_account_deletion_request";
    const { error } = await supabase.rpc(functionName);
    if (error) databaseError(error);

    const current = await readRequest(supabase, userId);
    return json({ request: responseShape(current) });
  } catch (error) {
    return failure(error);
  }
}
