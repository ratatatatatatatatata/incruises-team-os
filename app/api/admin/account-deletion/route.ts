import { AdminAccessError, requireActiveAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie" },
  });
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function failure(error: unknown) {
  if (error instanceof AdminAccessError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.error("Admin account deletion queue failed");
  return json({ error: "Account deletion queue-г уншиж чадсангүй.", code: "queue_unavailable" }, 500);
}

export async function GET(request: Request) {
  try {
    const { sessionClient } = await requireActiveAdmin();
    const url = new URL(request.url);
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 10_000);
    const perPage = boundedInteger(url.searchParams.get("perPage"), 50, 10, 100);
    const start = (page - 1) * perPage;
    const end = start + perPage - 1;

    const { data, count, error } = await sessionClient
      .from("account_deletion_requests")
      .select("user_id,status,requested_at,cancelled_at,completed_at,updated_at", { count: "exact" })
      .order("requested_at", { ascending: true })
      .range(start, end);

    if (error) throw error;
    const total = count ?? 0;
    return json({
      requests: (data ?? []).map((row) => ({
        userId: row.user_id,
        status: row.status,
        requestedAt: row.requested_at,
        cancelledAt: row.cancelled_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        page,
        perPage,
        total,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
