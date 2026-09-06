import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateDeployEnvironment,
  evaluateLaunchEnvironment,
  formatPreflightResult,
  parseEnvironmentFile,
} from "../scripts/launch-preflight.mjs";
import { percentile, PUBLIC_LOAD_TARGETS, validateBaseUrl } from "../scripts/load-smoke.mjs";
import {
  EXPECTED_SCHEMA_CONTRACT,
  verifySchemaContract,
} from "../scripts/schema-contract-preflight.mjs";

test("launch preflight validates names and never formats secret values", () => {
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-value",
    NEXT_PUBLIC_SUPPORT_EMAIL: "support@insuccess.test",
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "inSuccess Test Operator",
    SUPABASE_SECRET_KEY: "server-secret-test-value",
    PASSWORD_RESET_ORIGIN: "https://app.insuccess.test",
    AI_GATEWAY_API_KEY: "gateway-secret-test-value",
    MUX_SIGNING_KEY_ID: "mux-key-test-value",
    MUX_SIGNING_PRIVATE_KEY: "mux-private-test-value",
  };
  const result = evaluateLaunchEnvironment(environment);
  const output = formatPreflightResult(result);

  assert.equal(result.ok, true);
  for (const value of Object.values(environment)) assert.doesNotMatch(output, new RegExp(value));
  assert.equal(evaluateDeployEnvironment({}).ok, false);
  assert.equal(evaluateLaunchEnvironment({ ...environment, AI_GATEWAY_API_KEY: "" }, { vercelRuntime: true }).ok, true);
  assert.equal(
    evaluateLaunchEnvironment(
      { ...environment, MUX_SIGNING_KEY_ID: "", MUX_SIGNING_PRIVATE_KEY: "" },
      { requireSignedVideo: true },
    ).ok,
    false,
  );
  assert.equal(evaluateLaunchEnvironment({ ...environment, MUX_SIGNING_PRIVATE_KEY: "" }).ok, false);
  assert.equal(evaluateLaunchEnvironment({ ...environment, NEXT_PUBLIC_SUPPORT_EMAIL: "not-an-email" }).ok, false);
  assert.equal(evaluateLaunchEnvironment({ ...environment, NEXT_PUBLIC_LEGAL_ENTITY_NAME: "Your legal entity" }).ok, false);
  const missingLegal = evaluateLaunchEnvironment({
    ...environment,
    NEXT_PUBLIC_SUPPORT_EMAIL: "",
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: "",
  });
  assert.deepEqual(
    missingLegal.missing.filter((name) => name.startsWith("NEXT_PUBLIC_")),
    ["NEXT_PUBLIC_SUPPORT_EMAIL", "NEXT_PUBLIC_LEGAL_ENTITY_NAME"],
  );
});

test("environment file parser retains names while allowing equals signs in values", () => {
  const parsed = parseEnvironmentFile("A=one=two\nexport B='three'\n# C=four\n");
  assert.deepEqual(parsed, { A: "one=two", B: "three" });
});

test("schema preflight verifies the exact service-only production contract without formatting secrets", async () => {
  const secretKey = "server-only-schema-test-key";
  let capturedRequest;
  const returned = await verifySchemaContract(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: secretKey,
    },
    {
      fetchImplementation: async (url, options) => {
        capturedRequest = { url: String(url), options };
        return Response.json(EXPECTED_SCHEMA_CONTRACT);
      },
    },
  );

  assert.equal(returned, EXPECTED_SCHEMA_CONTRACT);
  assert.equal(capturedRequest.url, "https://project.supabase.co/rest/v1/rpc/insuccess_schema_contract");
  assert.equal(capturedRequest.options.method, "POST");
  assert.equal(capturedRequest.options.redirect, "error");
  assert.equal(capturedRequest.options.headers.apikey, secretKey);
  await assert.rejects(
    verifySchemaContract(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SECRET_KEY: secretKey,
      },
      { fetchImplementation: async () => Response.json("wrong-contract") },
    ),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(secretKey));
      return /does not match/.test(error.message);
    },
  );
});

test("public load scaffold is constrained to non-mutating readiness targets", () => {
  assert.deepEqual(PUBLIC_LOAD_TARGETS.map((target) => target.path), ["/api/health", "/login"]);
  assert.equal(validateBaseUrl("https://app.example.test/path"), "https://app.example.test");
  assert.equal(validateBaseUrl("http://localhost:3000"), "http://localhost:3000");
  assert.throws(() => validateBaseUrl("http://public.example.test"));
  assert.equal(percentile([100, 200, 300, 400], 95), 400);
});

test("health route performs a secret-free database readiness probe", async () => {
  const healthRoute = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(healthRoute, /\/rest\/v1\/rpc\/health_check/);
  assert.match(healthRoute, /method: "POST"/);
  assert.match(healthRoute, /body: "\{\}"/);
  assert.match(healthRoute, /apikey: config\.publishableKey/);
  assert.match(healthRoute, /status: ready \? 200 : 503/);
  assert.doesNotMatch(healthRoute, /SUPABASE_SECRET_KEY|error\.message|console\./);
});

test("production workflow gates deployment on database checks and post-deploy smoke", async () => {
  const [workflow, packageFile] = await Promise.all([
    readFile(new URL("../.github/workflows/deploy-vercel.yml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageFile);

  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
  assert.match(workflow, /pnpm audit --prod --audit-level=high/);
  assert.match(workflow, /supabase test db supabase\/tests/);
  assert.match(workflow, /preflight:deploy/);
  assert.match(workflow, /preflight:schema -- --env-file \.vercel\/\.env\.production\.local/);
  assert.ok(workflow.indexOf("preflight:schema") < workflow.indexOf("vercel@58.9.0 build"));
  assert.match(workflow, /--env-file \.vercel\/\.env\.production\.local --vercel-runtime --require-signed-video/);
  assert.match(workflow, /load:smoke/);
  assert.equal(packageJson.scripts.preflight, "node scripts/launch-preflight.mjs");
  assert.equal(packageJson.scripts["preflight:schema"], "node scripts/schema-contract-preflight.mjs");
  assert.equal(packageJson.scripts["load:smoke"], "node scripts/load-smoke.mjs");
});

test("final database migration requires the full schema and grants its exact contract only to service role", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260906120000_launch_schema_contract.sql", import.meta.url),
    "utf8",
  );

  for (const requiredObject of [
    "private.assessment_generation_runs",
    "public.account_deletion_requests",
    "public.academy_video_assets",
    "public.finalize_ai_tailored_question_snapshot",
    "public.save_academy_watch_progress",
  ]) {
    assert.match(migration, new RegExp(requiredObject.replaceAll(".", "\\.")));
  }
  assert.match(migration, /raise exception[\s\S]*launch schema prerequisites are missing/);
  assert.match(migration, /revoke execute on function public\.insuccess_schema_contract\(\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.insuccess_schema_contract\(\)[\s\S]*to service_role/);
  assert.match(migration, new RegExp(EXPECTED_SCHEMA_CONTRACT));
});

test("CI actions are immutable-pinned and production dependencies are audited", async () => {
  const workflows = await Promise.all([
    readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-vercel.yml", import.meta.url), "utf8"),
  ]);

  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
    assert.match(workflow, /pnpm audit --prod --audit-level=high/);
  }
});

test("Vercel functions run beside the Mumbai Supabase primary", async () => {
  const configuration = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(configuration.regions, ["bom1"]);
});
