import {
  AdminAccessError,
  createPrivilegedAdminClient,
  requireActiveAdmin,
} from "@/lib/supabase/admin";
import {
  academySlugPattern,
  academyUuidPattern,
  muxIdentifierPattern,
  type AcademyPlaybackPolicy,
  type AcademyPublishStatus,
  type AcademyVideoStatus,
} from "@/lib/academy/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const publishStatuses = new Set<AcademyPublishStatus>(["draft", "published", "archived"]);
const videoStatuses = new Set<AcademyVideoStatus>(["preparing", "ready", "errored", "disabled"]);
const playbackPolicies = new Set<AcademyPlaybackPolicy>(["public", "signed"]);

class AdminAcademyError extends Error {
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
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AdminAcademyError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = request.headers.get("content-length");
  const declaredBytes = contentLength === null ? 0 : Number(contentLength);
  if (
    !contentType.includes("application/json") ||
    !Number.isFinite(declaredBytes) ||
    declaredBytes < 0 ||
    declaredBytes > 16_384
  ) {
    throw new AdminAcademyError(400, "invalid_request", "Жижиг JSON хүсэлт шаардлагатай.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
    throw new AdminAcademyError(400, "invalid_request", "Жижиг JSON хүсэлт шаардлагатай.");
  }

  try {
    const body = JSON.parse(rawBody) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not_an_object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new AdminAcademyError(400, "invalid_json", "Хүсэлтийн JSON буруу байна.");
  }
}

function safeText(value: unknown, label: string, maximum: number, required = true): string {
  const text = String(value ?? "").trim();
  if ((required && !text) || text.length > maximum) {
    throw new AdminAcademyError(400, "invalid_catalog_value", `${label} утга буруу байна.`);
  }
  return text;
}

function safeUuid(value: unknown): string {
  const id = String(value ?? "");
  if (!academyUuidPattern.test(id)) {
    throw new AdminAcademyError(400, "invalid_catalog_id", "Хүчинтэй catalog item сонгоно уу.");
  }
  return id;
}

function safeSlug(value: unknown): string {
  const slug = String(value ?? "").trim().toLowerCase();
  if (slug.length < 2 || slug.length > 80 || !academySlugPattern.test(slug)) {
    throw new AdminAcademyError(400, "invalid_slug", "Slug нь жижиг латин үсэг, тоо, зурааснаас бүрдэнэ.");
  }
  return slug;
}

function safeOrder(value: unknown): number {
  const order = Number(value ?? 0);
  if (!Number.isInteger(order) || order < 0 || order > 100_000) {
    throw new AdminAcademyError(400, "invalid_sort_order", "Дараалал 0-100000 бүхэл тоо байна.");
  }
  return order;
}

function optionalDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 43_200) {
    throw new AdminAcademyError(400, "invalid_duration", "Үргэлжлэх хугацааг секундээр зөв оруулна уу.");
  }
  return duration;
}

function databaseFailure(error: { code?: string }): never {
  if (error.code === "23505") {
    throw new AdminAcademyError(409, "catalog_conflict", "Slug, playback ID эсвэл lesson video давхардлаа.");
  }
  if (error.code === "23503") {
    throw new AdminAcademyError(409, "catalog_parent_missing", "Холбогдох курс, модуль эсвэл хичээл олдсонгүй.");
  }
  if (error.code === "23514" || error.code === "22023") {
    throw new AdminAcademyError(400, "invalid_catalog_value", "Catalog-ийн утга дүрэмд нийцэхгүй байна.");
  }
  throw error;
}

function requestFailure(error: unknown) {
  if (error instanceof AdminAccessError || error instanceof AdminAcademyError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("Admin Academy request failed");
  return json({ error: "Academy admin service түр ажиллахгүй байна.", code: "academy_admin_unavailable" }, 500);
}

export async function GET() {
  try {
    const authorization = await requireActiveAdmin();
    const adminClient = createPrivilegedAdminClient(authorization);
    const [coursesResult, modulesResult, lessonsResult, videosResult] = await Promise.all([
      adminClient
        .from("academy_courses")
        .select("id,slug,title,description,status,sort_order,published_at,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(200),
      adminClient
        .from("academy_modules")
        .select("id,course_id,title,description,status,sort_order,published_at,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1_000),
      adminClient
        .from("academy_lessons")
        .select("id,module_id,slug,title,summary,duration_seconds,status,sort_order,published_at,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(4_000),
      adminClient
        .from("academy_video_assets")
        .select("id,lesson_id,mux_asset_id,mux_playback_id,playback_policy,status,duration_seconds,aspect_ratio,created_at,updated_at")
        .limit(4_000),
    ]);
    const firstError = coursesResult.error ?? modulesResult.error ?? lessonsResult.error ?? videosResult.error;
    if (firstError) throw firstError;

    return json({
      courses: coursesResult.data ?? [],
      modules: modulesResult.data ?? [],
      lessons: lessonsResult.data ?? [],
      videos: videosResult.data ?? [],
    });
  } catch (error) {
    return requestFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    const action = String(body.action ?? "");
    const authorization = await requireActiveAdmin();
    const adminClient = createPrivilegedAdminClient(authorization);

    if (action === "create_course") {
      const { data, error } = await adminClient
        .from("academy_courses")
        .insert({
          slug: safeSlug(body.slug),
          title: safeText(body.title, "Курсийн нэр", 140),
          description: safeText(body.description, "Курсийн тайлбар", 5_000, false),
          sort_order: safeOrder(body.sortOrder),
          created_by: authorization.actorId,
          updated_by: authorization.actorId,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      return json({ ok: true, id: data.id }, 201);
    }

    if (action === "create_module") {
      const { data, error } = await adminClient
        .from("academy_modules")
        .insert({
          course_id: safeUuid(body.courseId),
          title: safeText(body.title, "Модулийн нэр", 140),
          description: safeText(body.description, "Модулийн тайлбар", 5_000, false),
          sort_order: safeOrder(body.sortOrder),
          created_by: authorization.actorId,
          updated_by: authorization.actorId,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      return json({ ok: true, id: data.id }, 201);
    }

    if (action === "create_lesson") {
      const { data, error } = await adminClient
        .from("academy_lessons")
        .insert({
          module_id: safeUuid(body.moduleId),
          slug: safeSlug(body.slug),
          title: safeText(body.title, "Хичээлийн нэр", 160),
          summary: safeText(body.summary, "Хичээлийн тайлбар", 8_000, false),
          duration_seconds: optionalDuration(body.durationSeconds),
          sort_order: safeOrder(body.sortOrder),
          created_by: authorization.actorId,
          updated_by: authorization.actorId,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      return json({ ok: true, id: data.id }, 201);
    }

    if (action === "set_video") {
      const lessonId = safeUuid(body.lessonId);
      const muxPlaybackId = safeText(body.muxPlaybackId, "Mux playback ID", 255);
      if (!muxIdentifierPattern.test(muxPlaybackId)) {
        throw new AdminAcademyError(400, "invalid_mux_playback_id", "Mux playback ID утга буруу байна.");
      }
      const muxAssetId = safeText(body.muxAssetId, "Mux asset ID", 255, false) || null;
      if (muxAssetId && !muxIdentifierPattern.test(muxAssetId)) {
        throw new AdminAcademyError(400, "invalid_mux_asset_id", "Mux asset ID утга буруу байна.");
      }
      const playbackPolicy = String(body.playbackPolicy ?? "signed") as AcademyPlaybackPolicy;
      const status = String(body.status ?? "preparing") as AcademyVideoStatus;
      if (!playbackPolicies.has(playbackPolicy) || !videoStatuses.has(status)) {
        throw new AdminAcademyError(400, "invalid_video_state", "Playback policy эсвэл video state буруу байна.");
      }
      const durationSeconds = optionalDuration(body.durationSeconds);
      if (status === "ready" && !durationSeconds) {
        throw new AdminAcademyError(
          400,
          "ready_video_duration_required",
          "Ready video-д үргэлжлэх хугацааг секундээр оруулна уу.",
        );
      }

      const { data: existing, error: existingError } = await adminClient
        .from("academy_video_assets")
        .select("id")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (existingError) throw existingError;

      const values = {
        mux_asset_id: muxAssetId,
        mux_playback_id: muxPlaybackId,
        playback_policy: playbackPolicy,
        status,
        duration_seconds: durationSeconds,
        aspect_ratio: safeText(body.aspectRatio, "Aspect ratio", 20, false) || null,
        updated_by: authorization.actorId,
      };

      const result = existing
        ? await adminClient
            .from("academy_video_assets")
            .update(values)
            .eq("id", existing.id)
            .select("id")
            .single()
        : await adminClient
            .from("academy_video_assets")
            .insert({
              lesson_id: lessonId,
              ...values,
              created_by: authorization.actorId,
            })
            .select("id")
            .single();
      if (result.error) databaseFailure(result.error);
      return json({ ok: true, id: result.data.id }, existing ? 200 : 201);
    }

    if (action === "set_status") {
      const entity = String(body.entity ?? "");
      const id = safeUuid(body.id);
      const status = String(body.status ?? "") as AcademyPublishStatus;
      if (!publishStatuses.has(status)) {
        throw new AdminAcademyError(400, "invalid_publish_state", "Publish state буруу байна.");
      }

      let result;
      if (entity === "course") {
        result = await adminClient
          .from("academy_courses")
          .update({ status, updated_by: authorization.actorId })
          .eq("id", id)
          .select("id,status")
          .maybeSingle();
      } else if (entity === "module") {
        result = await adminClient
          .from("academy_modules")
          .update({ status, updated_by: authorization.actorId })
          .eq("id", id)
          .select("id,status")
          .maybeSingle();
      } else if (entity === "lesson") {
        result = await adminClient
          .from("academy_lessons")
          .update({ status, updated_by: authorization.actorId })
          .eq("id", id)
          .select("id,status")
          .maybeSingle();
      } else {
        throw new AdminAcademyError(400, "invalid_catalog_entity", "Catalog entity буруу байна.");
      }

      if (result.error) databaseFailure(result.error);
      if (!result.data) {
        throw new AdminAcademyError(404, "catalog_item_not_found", "Catalog item олдсонгүй.");
      }
      return json({ ok: true, item: result.data });
    }

    throw new AdminAcademyError(400, "unknown_action", "Танигдаагүй Academy admin үйлдэл байна.");
  } catch (error) {
    return requestFailure(error);
  }
}
