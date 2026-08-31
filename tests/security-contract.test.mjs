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
  assert.match(membershipMigration, /status text not null default 'pending' check \(status in \('pending', 'active', 'disabled'\)\)/);
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

test("workspace data uses canonical lesson IDs and verified database sources", async () => {
  const [api, data, sourceMigration] = await Promise.all([
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830033919_reconcile_learning_and_sources.sql", import.meta.url), "utf8"),
  ]);

  assert.match(api, /function canonicalLessonId/);
  assert.match(api, /\.from\("official_sources"\)/);
  assert.match(api, /allowed_for_review,verified_at/);
  assert.match(api, /function sourceUsableForReview/);
  assert.match(api, /source\.review_due_at >= today/);
  assert.match(data, /officialSources: OfficialSource\[\]/);
  assert.match(sourceMigration, /create trigger content_drafts_verified_source_gate/);
  assert.match(sourceMigration, /create or replace function private\.enforce_verified_content_source/);
  assert.match(sourceMigration, /A verified and review-allowed official source is required/);
  assert.match(sourceMigration, /Official source review is overdue/);
  assert.match(sourceMigration, /Official source verification date cannot be in the future/);
});

test("admin access is server-only, fail-closed, and audited", async () => {
  const [adminServer, adminRoute, adminClient, adminMigration, membershipLifecycleMigration] = await Promise.all([
    readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/members/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830033918_admin_membership_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260831135600_pending_assessment_membership.sql", import.meta.url), "utf8"),
  ]);

  assert.match(adminServer, /^import "server-only";/);
  assert.match(adminServer, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(adminServer + adminRoute + adminClient, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
  assert.match(adminServer, /requireActiveAdmin/);
  assert.match(adminRoute, /inviteUserByEmail/);
  assert.match(adminRoute, /admin_register_invited_member/);
  assert.match(adminRoute, /admin_update_team_member/);
  assert.match(adminMigration, /values \(p_user_id, 'builder', 'pending'\)/);
  assert.match(adminMigration, /p_status not in \('pending', 'active', 'disabled'\)/);
  assert.match(adminMigration, /team_membership_audit_events/);
  assert.match(adminMigration, /An admin cannot demote or disable their own membership/);
  assert.match(adminMigration, /create or replace function public\.admin_update_team_member[\s\S]*security invoker/);
  assert.doesNotMatch(adminMigration, /create or replace function public\.admin_update_team_member[\s\S]{0,180}security definer/);
  assert.match(membershipLifecycleMigration, /alter column status set default 'pending'/);
  assert.match(membershipLifecycleMigration, /drop constraint if exists team_members_status_check/);
  assert.match(membershipLifecycleMigration, /values \(p_user_id, 'builder', 'pending'\)/);
  assert.match(membershipLifecycleMigration, /p_status not in \('pending', 'active', 'disabled'\)/);
  assert.match(membershipLifecycleMigration, /create or replace function private\.admin_update_team_member/);
});

test("personal Success Map and AI mentor are consent-gated, adaptive, private and server-finalized", async () => {
  const [privacyMigration, privacyRoute, assessmentMigration, assistantMigration, assessmentServer, assistantRoute, mentor] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260831135000_member_privacy_preferences.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/privacy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260831135704_onboarding_assessment.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260831140034_ai_assistant_persistence.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/assessment/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai/mentor.ts", import.meta.url), "utf8"),
  ]);

  assert.match(privacyMigration, /enable row level security/);
  assert.match(privacyRoute, /withdraw_assessment/);
  assert.match(privacyRoute, /\.eq\("assessment_consent", true\)/);
  assert.match(assessmentMigration, /Assessment consent required/);
  assert.match(assessmentMigration, /Tailored branch bank must contain exactly 300 questions/);
  assert.match(assessmentMigration, /adaptive-branch-v2/);
  assert.match(assessmentMigration, /v_primary_goal = 'board_director'/);
  assert.match(assessmentMigration, /v_non_skip_answers >= 92/);
  assert.match(assessmentMigration, /'appropriate', false/);
  assert.match(assessmentMigration, /'promise', false/);
  assert.equal((assessmentMigration.match(/member\.status in \('pending', 'active'\)/g) ?? []).length, 7);
  assert.equal((assessmentMigration.match(/is_anonymous/g) ?? []).length, 7);
  assert.match(assessmentServer, /clientAnswerId/);
  assert.match(assistantMigration, /pg_advisory_xact_lock/);
  assert.match(assistantMigration, /to service_role/);
  assert.doesNotMatch(assistantMigration, /grant execute on function public\.complete_assistant_turn[\s\S]{0,180}to authenticated/);
  assert.match(assistantMigration, /create or replace function public\.withdraw_assessment_consent\(\)[\s\S]*security invoker/);
  assert.doesNotMatch(assistantMigration, /create or replace function public\.withdraw_assessment_consent\(\)[\s\S]{0,220}security definer/);
  assert.match(assistantMigration, /p_actor is distinct from auth\.uid\(\)/);
  assert.match(assistantMigration, /member_privacy_cancel_pending_assistant_turns/);
  assert.match(assistantRoute, /createPersonalizationServiceClient/);
  assert.match(assistantRoute, /fail_assistant_turn/);
  assert.match(assistantRoute, /privacy_consent_required/);
  assert.match(mentor, /<profile_data>/);
  assert.match(mentor, /zeroDataRetention: true/);
  assert.match(mentor, /Автоматаар нийтэлсэн, компанийн баталсан гэж бүү хэл/);
});

test("CI runs isolated database policy tests before the application build", async () => {
  const [workflow, membershipTest, contentTest, adminTest, assessmentTest, assistantTest, privacyTest] = await Promise.all([
    readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/001_membership_rls.test.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/002_content_workflow.test.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/003_admin_membership.test.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/004_onboarding_assessment.test.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/005_ai_assistant.test.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/006_privacy_preferences.test.sql", import.meta.url), "utf8"),
  ]);

  assert.match(workflow, /supabase\/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520/);
  assert.match(workflow, /version: 2\.116\.0/);
  assert.match(workflow, /supabase db start/);
  assert.match(workflow, /supabase test db supabase\/tests/);
  assert.match(membershipTest, /select plan\(/);
  assert.match(contentTest, /select plan\(/);
  assert.match(adminTest, /select plan\(16\)/);
  assert.match(assessmentTest, /select plan\(82\)/);
  assert.match(assistantTest, /select plan\(50\)/);
  assert.match(privacyTest, /select plan\(13\)/);
});
