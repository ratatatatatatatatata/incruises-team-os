import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const DATABASE_TIMEOUT_MS = 5_000;
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
};

type DatabaseStatus = "reachable" | "unreachable" | "unconfigured";

function readinessResponse(database: DatabaseStatus, latencyMs: number | null) {
  const ready = database === "reachable";

  return Response.json(
    {
      status: ready ? "ok" : "degraded",
      database,
      latencyMs,
      checkedAt: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: responseHeaders,
    },
  );
}

export async function GET() {
  const config = getSupabaseConfig();
  if (!config) return readinessResponse("unconfigured", null);

  const startedAt = performance.now();

  try {
    // This data-free RPC performs a real Postgres round trip. The publishable
    // key is intentionally used here so this public probe never needs a secret.
    const response = await fetch(new URL("/rest/v1/rpc/health_check", config.url), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: config.publishableKey,
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(DATABASE_TIMEOUT_MS),
    });

    if (response.body) await response.body.cancel().catch(() => undefined);
    const latencyMs = Math.round(performance.now() - startedAt);
    return readinessResponse(response.ok ? "reachable" : "unreachable", latencyMs);
  } catch {
    return readinessResponse("unreachable", Math.round(performance.now() - startedAt));
  }
}
