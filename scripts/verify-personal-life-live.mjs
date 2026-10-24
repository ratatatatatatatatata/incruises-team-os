// Opt-in integration checks. Only synthetic accounts marked for this fixture may be used.
// Credentials/config stay in an external mode-0600 file, never in test output or Git.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const base = process.env.LIFE_E2E_BASE_URL;
assert.ok(base && process.env.LIFE_E2E_ALLOW_WRITES === "yes", "Explicit test URL and opt-in required");
const config = JSON.parse(await readFile(process.env.LIFE_E2E_CONFIG_FILE, "utf8"));
const users = JSON.parse(await readFile(process.env.LIFE_E2E_USERS_FILE, "utf8"));
assert.equal(users.length, 2);
assert.ok(users.every((u) => /^life-e2e-[ab]-[a-f0-9]+@example\.invalid$/.test(u.email)));
const origin = new URL(base).origin;
const vercelCli = process.env.LIFE_E2E_VERCEL_CLI;
let requestNumber = 0;
async function request(url, options) {
  if (!vercelCli) return fetch(url, options);
  assert.ok(new URL(url).hostname.endsWith(".vercel.app"), "Vercel transport only targets an explicit preview URL");
  assert.ok(process.env.LIFE_E2E_VERCEL_SCOPE && process.env.LIFE_E2E_HTTP_ARTIFACT_DIR);
  const root = process.env.LIFE_E2E_HTTP_ARTIFACT_DIR;
  await mkdir(root, { recursive: true, mode: 0o700 });
  const prefix = join(root, String(++requestNumber));
  const quote = (s) => `"${String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const lines = ["silent", "show-error", "max-time = 40", `request = ${quote(options.method)}`, `dump-header = ${quote(prefix + ".headers")}`, `output = ${quote(prefix + ".body")}`, 'write-out = "%{http_code}"'];
  for (const [key, value] of Object.entries(options.headers)) lines.push(`header = ${quote(`${key}: ${value}`)}`);
  if (options.body) {
    await writeFile(prefix + ".input", options.body, { mode: 0o600 });
    lines.push(`data-binary = ${quote("@" + prefix + ".input")}`);
  }
  // Existing Vercel authentication is used for this one URL. No environment or bypass secret is exported.
  // Member JWTs travel through stdin, never command arguments or test output.
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vercelCli, "curl", url, "--scope", process.env.LIFE_E2E_VERCEL_SCOPE, "--", "--config", "-"], { env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1", NO_UPDATE_NOTIFIER: "1" }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => code === 0 && /^\d{3}$/.test(out.trim()) ? resolve(Number(out.trim())) : reject(new Error("Authenticated Vercel request failed")));
    child.stdin.end(lines.join("\n") + "\n");
  });
  const rawHeaders = await readFile(prefix + ".headers", "utf8");
  const headers = new Headers();
  for (const line of rawHeaders.trim().split(/\r?\n\r?\n/).at(-1).split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return new Response(await readFile(prefix + ".body"), { status, headers });
}
const url = config.API_URL ?? config.NEXT_PUBLIC_SUPABASE_URL;
const key = config.PUBLISHABLE_KEY ?? config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log(`PASS ${name}`);
}
const clients = users.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
let sessions = [];
for (let i = 0; i < 2; i++) {
  const { data, error } = await clients[i].auth.signInWithPassword({ email: users[i].email, password: users[i].password });
  assert.equal(error, null, "Synthetic password login must work");
  assert.equal(data.user.id, users[i].id);
  assert.equal(data.user.user_metadata.test_fixture, "personal-life-20261024");
  sessions.push(data.session);
}
async function api(i, { method = "GET", payload, token, requestOrigin = origin, path = "" } = {}) {
  return request(`${origin}/api/life-workspace${path}`, {
    method,
    headers: {
      ...(token !== null ? { authorization: `Bearer ${token ?? sessions[i].access_token}` } : {}),
      ...(method !== "GET" ? { "content-type": "application/json", ...(requestOrigin !== null ? { origin: requestOrigin } : {}) } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
async function workspace(i) {
  const response = await api(i);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  return (await response.json()).workspace;
}
const empty = () => ({ version: 1, weekBudgets: {}, goal: { area: "planning", title: "", why: "", measure: "", weeklyMinutes: 60 }, tasks: [], habit: { title: "", dates: [] }, vision: { wish: "", reason: "", obstacle: "", ifThen: "", action: "" }, style: { words: "", values: "", introduction: "", practice: "" }, reviews: [] });
await check("two genuine Auth password logins", async () => assert.equal(sessions.length, 2));
for (let i = 0; i < 2; i++) {
  await check(`account ${i === 0 ? "A" : "B"} save and API reload`, async () => {
    const before = await workspace(i);
    const state = structuredClone(before?.state ?? empty());
    state.goal.title = `${i === 0 ? "A" : "B"} бүртгэлийн хувийн 30 хоногийн зорилго`;
    state.vision.wish = `${i === 0 ? "A" : "B"} хувийн мөрөөдөл`;
    state.style.words = `${i === 0 ? "A" : "B"} хувийн хэв маяг`;
    const response = await api(i, { method: "POST", payload: { revision: before?.revision ?? 0, state } });
    assert.equal(response.status, 200);
    const saved = await response.json();
    const after = await workspace(i);
    assert.equal(after.revision, saved.revision);
    assert.deepEqual(after.state, state);
  });
}
await check("anonymous and invalid-token API denied", async () => {
  assert.equal((await api(0, { token: null })).status, 401);
  assert.equal((await api(0, { token: "not-a-session" })).status, 401);
});
await check("foreign write origin denied; authenticated native request allowed", async () => {
  const before = await workspace(0);
  assert.equal((await api(0, { method: "POST", requestOrigin: "https://foreign.example.invalid", payload: before })).status, 403);
  assert.equal((await api(0, { method: "POST", requestOrigin: null, payload: before })).status, 200);
});
await check("owner cannot be supplied in API payload", async () => {
  const before = await workspace(0);
  assert.equal((await api(0, { method: "POST", payload: { ...before, user_id: users[1].id } })).status, 400);
});
await check("API query cannot select another owner", async () => {
  const r = await api(0, { path: `?user_id=${users[1].id}` });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).workspace.state.goal.title, "A бүртгэлийн хувийн 30 хоногийн зорилго");
});
await check("stale revision returns conflict and preserves newest state", async () => {
  const before = await workspace(0);
  const valid = await api(0, { method: "POST", payload: before });
  assert.equal(valid.status, 200);
  const stale = await api(0, { method: "POST", payload: before });
  assert.equal(stale.status, 409);
  assert.equal((await workspace(0)).revision, before.revision + 1);
});
for (let i = 0; i < 2; i++) {
  const other = 1 - i;
  await check(`RLS account ${i === 0 ? "A" : "B"} cannot read other workspace or history`, async () => {
    for (const table of ["personal_life_workspaces", "personal_life_versions"]) {
      const { data, error } = await clients[i].from(table).select("user_id,revision").eq("user_id", users[other].id);
      assert.equal(error, null);
      assert.deepEqual(data, []);
      const all = await clients[i].from(table).select("user_id,revision");
      assert.equal(all.error, null);
      assert.ok(all.data.length > 0 && all.data.every((row) => row.user_id === users[i].id));
    }
  });
  await check(`RLS account ${i === 0 ? "A" : "B"} cannot update other workspace`, async () => {
    const before = await workspace(other);
    const { data, error } = await clients[i].from("personal_life_workspaces").update({ revision: before.revision + 1, state: before.state }).eq("user_id", users[other].id).select("revision");
    assert.equal(error, null);
    assert.deepEqual(data, []);
    assert.deepEqual(await workspace(other), before);
  });
}
await check("owner cannot transfer workspace or forge history", async () => {
  const before = await workspace(0);
  const transfer = await clients[0].from("personal_life_workspaces").update({ user_id: users[1].id, revision: before.revision + 1 }).eq("user_id", users[0].id);
  assert.ok(transfer.error);
  const forge = await clients[0].from("personal_life_versions").insert({ user_id: users[0].id, revision: 99999, state: before.state });
  assert.ok(forge.error);
  const rewrite = await clients[0].from("personal_life_versions").update({ state: empty() }).eq("user_id", users[0].id);
  assert.ok(rewrite.error);
  assert.deepEqual(await workspace(0), before);
});
await check("anonymous Data API cannot read private workspaces", async () => {
  const anonymous = createClient(url, key, { auth: { persistSession: false } });
  const result = await anonymous.from("personal_life_workspaces").select("user_id,revision");
  assert.ok(result.error || result.data.length === 0);
});
await check("atomic immutable version matches current saved revision", async () => {
  for (let i = 0; i < 2; i++) {
    const current = await workspace(i);
    const history = await clients[i].from("personal_life_versions").select("revision,state").eq("user_id", users[i].id).order("revision");
    assert.equal(history.error, null);
    assert.equal(history.data.length, current.revision);
    assert.deepEqual(history.data.at(-1), { revision: current.revision, state: current.state });
  }
});
await check("token refresh and fresh password relogin preserve both accounts", async () => {
  for (let i = 0; i < 2; i++) {
    const before = await workspace(i);
    const refresh = await clients[i].auth.refreshSession({ refresh_token: sessions[i].refresh_token });
    assert.equal(refresh.error, null);
    sessions[i] = refresh.data.session;
    assert.deepEqual(await workspace(i), before);
    assert.equal((await clients[i].auth.signOut({ scope: "local" })).error, null);
    const relogin = await clients[i].auth.signInWithPassword({ email: users[i].email, password: users[i].password });
    assert.equal(relogin.error, null);
    sessions[i] = relogin.data.session;
    assert.deepEqual(await workspace(i), before);
  }
});
if (process.env.LIFE_E2E_REPORT_FILE)
  await writeFile(process.env.LIFE_E2E_REPORT_FILE, JSON.stringify({ origin, testedAt: new Date().toISOString(), checks: results }, null, 2));
console.log(`${results.length} live integration checks passed; no credentials printed.`);
for (const client of clients) await client.auth.signOut({ scope: "local" });
