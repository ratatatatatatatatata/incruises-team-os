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

test("invite-only access gates membership and disables public sign-up", async () => {
  const [login, signupPage, signupAction, currentUser, config, inviteTemplate, membershipMigration, inviteMigration, inviteFunction] = await Promise.all([
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signup/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signup/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/current-user.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
    readFile(new URL("../supabase/templates/invite.html", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260829062550_harden_membership_access.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260915213140_invite_only_success_map_v1.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/invite-member/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(login, /зөвхөн админы имэйл урилгаар/);
  assert.match(signupPage, /INVITE-ONLY ACCESS/);
  assert.doesNotMatch(signupAction, /auth\.signUp/);
  assert.match(config, /enable_signup = false/);
  assert.match(inviteTemplate, /token_hash=\{\{ \.TokenHash \}\}/);
  assert.match(inviteTemplate, /type=invite/);
  assert.match(inviteTemplate, /\/auth\/confirm/);
  assert.match(currentUser, /team_members/);
  assert.doesNotMatch(currentUser, /metadata\.(role|app_role)|user_metadata.*\["role"\]/);
  assert.match(membershipMigration, /create table if not exists public\.team_members/);
  assert.match(membershipMigration, /revoke all on table public\.team_members from anon, authenticated/);
  assert.doesNotMatch(membershipMigration, /grant (insert|update|delete).*team_members.*authenticated/i);
  assert.match(inviteMigration, /public\.member_invitations/);
  assert.match(inviteMigration, /invitation\.status in \('pending', 'sent'\)/);
  assert.match(inviteMigration, /if not found then\s+return new/);
  assert.match(inviteMigration, /onboarding_required = true/);
  assert.match(inviteFunction, /inviteUserByEmail/);
  assert.match(inviteFunction, /membership\.role !== "admin"/);
  assert.doesNotMatch(inviteFunction, /delete\(/);
});

test("starter map uses exactly five private answers with explicit AI consent", async () => {
  const [form, route, migration, hardeningMigration, ai] = await Promise.all([
    readFile(new URL("../app/onboarding/onboarding-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/success-map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260915213140_invite_only_success_map_v1.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260915215100_harden_success_map_rpc.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/success-map/ai.ts", import.meta.url), "utf8"),
  ]);

  assert.equal((form.match(/title: "[1-5]\./g) ?? []).length, 5);
  assert.match(form, /Personal AI-аар илүү нарийвчлуулах/);
  assert.match(route, /p_ai_consent/);
  assert.match(migration, /member_success_maps_select_active_own/);
  assert.doesNotMatch(migration, /member_success_maps_select_admin/);
  assert.match(migration, /revoke all on table public\.member_success_maps from anon, authenticated/);
  assert.match(hardeningMigration, /create or replace function private\.complete_starter_success_map/);
  assert.match(hardeningMigration, /create or replace function public\.complete_starter_success_map[\s\S]*security invoker/);
  assert.doesNotMatch(hardeningMigration, /create or replace function public\.complete_starter_success_map[\s\S]{0,180}security definer/);
  assert.match(ai, /zeroDataRetention: true/);
  assert.match(ai, /disallowPromptTraining: true/);
  assert.doesNotMatch(ai, /email|userId/);
});

test("sponsor and coach operations expose only purpose-limited summaries", async () => {
  const [migration, inviteFunction, inviteRoute, workspaceRoute, onboarding, app] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260916170145_sponsor_team_success_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/invite-member/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/invitations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/onboarding-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /create table if not exists public\.member_relationships/);
  assert.match(migration, /create table if not exists public\.member_success_summaries/);
  assert.match(migration, /create table if not exists public\.member_checkins/);
  assert.match(migration, /create table if not exists public\.coach_notes/);
  assert.match(migration, /alter table public\.member_relationships enable row level security/);
  assert.match(migration, /alter table public\.member_success_summaries enable row level security/);
  assert.match(migration, /create or replace function private\.current_user_can_support_member/);
  assert.match(migration, /revoke all on table public\.member_success_summaries from anon, authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*member_success_summaries.*authenticated/i);
  assert.doesNotMatch(migration, /delete from|truncate table|drop table/i);
  assert.match(inviteFunction, /sponsor_user_id/);
  assert.match(inviteFunction, /coach_user_id/);
  assert.match(inviteFunction, /SPONSOR_ROLES/);
  assert.match(inviteRoute, /sponsorUserId/);
  assert.match(workspaceRoute, /member_success_summaries/);
  assert.match(workspaceRoute, /weekly_checkin/);
  assert.match(workspaceRoute, /add_coach_note/);
  assert.match(onboarding, /purpose-limited summary/);
  assert.match(onboarding, /\/auth\/signout/);
  assert.match(app, /Түүхий 5 хариулт харагдахгүй/);
});

test("production accepts Vercel Marketplace Supabase environment names", async () => {
  const [supabaseConfig, nextConfig] = await Promise.all([
    readFile(new URL("../lib/supabase/config.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(supabaseConfig, /process\.env\.SUPABASE_URL/);
  assert.match(supabaseConfig, /process\.env\.SUPABASE_PUBLISHABLE_KEY/);
  assert.match(supabaseConfig, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(nextConfig, /process\.env\.SUPABASE_URL/);
  assert.doesNotMatch(supabaseConfig, /service_role|SUPABASE_SECRET_KEY/);
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
