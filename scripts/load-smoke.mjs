import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PUBLIC_LOAD_TARGETS = Object.freeze([
  { path: "/api/health", kind: "health" },
  { path: "/login", kind: "html" },
]);

export function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

export function validateBaseUrl(value) {
  if (!value) throw new Error("LOAD_BASE_URL is required.");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("LOAD_BASE_URL must use HTTPS, except for localhost.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("LOAD_BASE_URL must be an origin without credentials, query, or fragment.");
  }
  return url.origin;
}

function boundedInteger(environment, name, defaultValue, minimum, maximum) {
  const rawValue = environment[name];
  if (!rawValue) return defaultValue;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

async function requestTarget(baseUrl, target, timeoutMs) {
  const startedAt = performance.now();

  try {
    const response = await fetch(new URL(target.path, baseUrl), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: { "User-Agent": "inSuccess-public-readiness-load/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    let validBody = true;
    if (target.kind === "health") {
      const payload = await response.json().catch(() => null);
      validBody = payload?.status === "ok" && payload?.database === "reachable";
    } else {
      validBody = response.headers.get("content-type")?.includes("text/html") === true;
      if (response.body) await response.body.cancel().catch(() => undefined);
    }

    return {
      path: target.path,
      durationMs: Math.round(performance.now() - startedAt),
      ok: response.status === 200 && validBody,
    };
  } catch {
    return {
      path: target.path,
      durationMs: Math.round(performance.now() - startedAt),
      ok: false,
    };
  }
}

export async function runPublicLoad(environment = process.env) {
  const baseUrl = validateBaseUrl(environment.LOAD_BASE_URL);
  const requestCount = boundedInteger(environment, "LOAD_REQUESTS", 20, 2, 5_000);
  const concurrency = boundedInteger(environment, "LOAD_CONCURRENCY", 5, 1, 100);
  const timeoutMs = boundedInteger(environment, "LOAD_TIMEOUT_MS", 8_000, 500, 60_000);
  const maximumP95Ms = boundedInteger(environment, "LOAD_MAX_P95_MS", 3_000, 100, 60_000);
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < requestCount) {
      const index = cursor;
      cursor += 1;
      const target = PUBLIC_LOAD_TARGETS[index % PUBLIC_LOAD_TARGETS.length];
      results.push(await requestTarget(baseUrl, target, timeoutMs));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, () => worker()));

  const durations = results.map((result) => result.durationMs);
  const failed = results.filter((result) => !result.ok);
  const p95Ms = percentile(durations, 95);
  const targetCounts = Object.fromEntries(
    PUBLIC_LOAD_TARGETS.map((target) => [target.path, results.filter((result) => result.path === target.path).length]),
  );

  console.log(`Public readiness load completed: ${results.length} requests, ${failed.length} failures.`);
  console.log(`Targets: ${Object.entries(targetCounts).map(([path, count]) => `${path}=${count}`).join(", ")}.`);
  console.log(`Latency ms: p50=${percentile(durations, 50)}, p95=${p95Ms}, p99=${percentile(durations, 99)}.`);

  if (failed.length || p95Ms > maximumP95Ms) {
    throw new Error(
      failed.length
        ? "Public readiness load failed because one or more safe GET requests failed."
        : `Public readiness load failed because p95 exceeded ${maximumP95Ms} ms.`,
    );
  }

  return { requestCount: results.length, failed: failed.length, p95Ms, targetCounts };
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  runPublicLoad().catch((error) => {
    console.error(error instanceof Error ? error.message : "Public readiness load failed.");
    process.exitCode = 1;
  });
}
