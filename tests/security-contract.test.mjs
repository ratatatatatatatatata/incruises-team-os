import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { safeNextPath } from "../app/auth/redirects.mjs";

test("auth redirect accepts only same-origin relative paths", () => {
  const origin = "https://team.example";

  assert.equal(safeNextPath("/academy?level=l1#lesson", origin), "/academy?level=l1#lesson");
  assert.equal(safeNextPath("//evil.example/path", origin), "/");
  assert.equal(safeNextPath("/\\evil.example/path", origin), "/");
  assert.equal(safeNextPath("/%5cevil.example/path", origin), "/");
  assert.equal(safeNextPath("https://evil.example/path", origin), "/");
  assert.equal(safeNextPath(null, origin), "/");
});

test("public sign-up is removed and membership is server-authoritative", async () => {
  const [actions, login, currentUser, config, membershipMigration] = await Promise.all([
    readFile(new URL("../app/login/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/current-user.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260829062550_harden_membership_access.sql", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(actions + login, /signUp|signup|Бүртгүүлэх/);
  assert.match(config, /enable_signup = false/);
  assert.match(currentUser, /team_members/);
  assert.doesNotMatch(currentUser, /metadata\.(role|app_role)|user_metadata.*\["role"\]/);
  assert.match(membershipMigration, /create table if not exists public\.team_members/);
  assert.match(membershipMigration, /revoke all on table public\.team_members from anon, authenticated/);
  assert.doesNotMatch(membershipMigration, /grant (insert|update|delete).*team_members.*authenticated/i);
});

test("content approval uses role-separated database transitions", async () => {
  const [api, app, workflowMigration, finalMigration] = await Promise.all([
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260829062600_enforce_content_review_workflow.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260829063013_finalize_content_write_lockdown.sql", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(api + app, /set_draft_status/);
  assert.match(api, /submit_content_draft/);
  assert.match(api, /review_content_draft/);
  assert.match(api, /record_corporate_approval_reference/);
  assert.match(workflowMigration, /A draft owner cannot review their own draft/);
  assert.match(workflowMigration, /A draft owner cannot record their own corporate approval/);
  assert.match(workflowMigration, /allowed_for_review/);
  assert.match(workflowMigration, /content_review_events/);
  assert.match(workflowMigration, /create or replace function private\.submit_content_draft/);
  assert.match(workflowMigration, /create or replace function public\.submit_content_draft[\s\S]*security invoker/);
  assert.doesNotMatch(workflowMigration, /create or replace function public\.submit_content_draft[\s\S]{0,160}security definer/);
  assert.doesNotMatch(workflowMigration, /grant update \(status, updated_at\).*content_drafts/i);
  assert.match(finalMigration, /revoke update on table public\.content_drafts from authenticated/i);
});

test("private-app response controls are configured", async () => {
  const [nextConfig, layout, robots, serviceWorker] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(nextConfig, /poweredByHeader: false/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /X-Robots-Tag/);
  assert.match(nextConfig, /Cache-Control/);
  assert.match(layout, /index: false/);
  assert.match(robots, /disallow: "\/"/);
  assert.match(serviceWorker, /STATIC_ASSETS\.includes\(url\.pathname\)/);
  assert.doesNotMatch(serviceWorker, /cache\.put/);
});
