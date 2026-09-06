import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authMessagePath, safeNextPath } from "../app/auth/redirects.mjs";
import {
  authInviteRedirectUrl,
  passwordRecoveryOrigin,
  passwordRecoveryRedirectUrl,
} from "../app/auth/recovery-url.mjs";

test("auth redirect accepts only same-origin relative paths", () => {
  const origin = "https://team.example";

  assert.equal(safeNextPath("/academy?level=l1#lesson", origin), "/academy?level=l1#lesson");
  assert.equal(safeNextPath("//evil.example/path", origin), "/");
  assert.equal(safeNextPath("/\\evil.example/path", origin), "/");
  assert.equal(safeNextPath("/%5cevil.example/path", origin), "/");
  assert.equal(safeNextPath("https://evil.example/path", origin), "/");
  assert.equal(safeNextPath(null, origin), "/");
});

test("password recovery uses only operator-controlled callback origins", () => {
  assert.equal(
    passwordRecoveryRedirectUrl({ PASSWORD_RESET_ORIGIN: "https://team.example", NODE_ENV: "production" }),
    "https://team.example/auth/confirm?next=%2Fauth%2Fset-password%3Fflow%3Drecovery",
  );
  assert.equal(passwordRecoveryOrigin({ VERCEL_URL: "preview-team.vercel.app", NODE_ENV: "production" }), "https://preview-team.vercel.app");
  assert.equal(
    passwordRecoveryOrigin({
      PASSWORD_RESET_ORIGIN: "https://auth.team.example",
      VERCEL_PROJECT_PRODUCTION_URL: "team.example",
      VERCEL_URL: "preview-team.vercel.app",
      NODE_ENV: "production",
    }),
    "https://auth.team.example",
  );
  assert.equal(
    passwordRecoveryOrigin({
      VERCEL_PROJECT_PRODUCTION_URL: "team.example",
      VERCEL_URL: "preview-team.vercel.app",
      NODE_ENV: "production",
    }),
    "https://team.example",
  );
  assert.equal(
    authInviteRedirectUrl({ PASSWORD_RESET_ORIGIN: "https://team.example", NODE_ENV: "production" }),
    "https://team.example/auth/confirm?next=%2Fauth%2Fset-password",
  );
  assert.equal(passwordRecoveryOrigin({ PASSWORD_RESET_ORIGIN: "http://evil.example", NODE_ENV: "production" }), null);
  assert.equal(passwordRecoveryOrigin({ PASSWORD_RESET_ORIGIN: "https://team.example/hidden", NODE_ENV: "production" }), null);
  assert.equal(passwordRecoveryRedirectUrl({ NODE_ENV: "production" }), null);
  assert.equal(passwordRecoveryOrigin({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("auth message redirects percent-encode Unicode before creating headers", () => {
  const path = authMessagePath(
    "/auth/set-password?flow=recovery",
    "error",
    "Нууц үг тохируулах холбоос хүчингүй байна.",
  );
  const target = new URL(path, "https://team.example");
  const location = Response.redirect(target).headers.get("location");

  assert.equal(target.searchParams.get("flow"), "recovery");
  assert.equal(target.searchParams.get("error"), "Нууц үг тохируулах холбоос хүчингүй байна.");
  assert.doesNotMatch(path, /[^\x00-\x7F]/);
  assert.ok(location);
  assert.doesNotMatch(location, /[^\x00-\x7F]/);
  assert.throws(() => authMessagePath("https://evil.example", "error", "no"), /must be internal/);
  assert.throws(() => authMessagePath("/%5cevil.example", "error", "no"), /must be internal/);
});

test("password recovery is generic, PKCE-compatible and preserves invite setup", async () => {
  const [login, forgotPage, forgotAction, confirmRoute, setPasswordPage, setPasswordAction] = await Promise.all([
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/forgot-password/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/forgot-password/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/confirm/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(login, /href="\/auth\/forgot-password"/);
  assert.match(forgotPage, /Аюулгүй байдлын үүднээс/);
  assert.match(forgotAction, /resetPasswordForEmail/);
  assert.match(forgotAction, /authMessagePath/);
  assert.match(forgotAction, /Хүсэлтийг хүлээн авлаа/);
  assert.match(forgotAction, /error\.code/);
  assert.doesNotMatch(forgotAction, /error\.message|console\.(log|error|warn)\(.*email/);
  assert.match(confirmRoute, /exchangeCodeForSession/);
  assert.match(confirmRoute, /verifyOtp/);
  assert.match(confirmRoute, /SUPPORTED_EMAIL_OTP_TYPES/);
  assert.match(confirmRoute, /type === "recovery"/);
  assert.match(confirmRoute, /Cache-Control", "no-store"/);
  assert.match(confirmRoute, /Referrer-Policy", "no-referrer"/);
  assert.match(confirmRoute, /authMessagePath/);
  assert.match(setPasswordPage, /flow.*recovery/);
  assert.match(setPasswordPage, /authMessagePath/);
  assert.match(setPasswordAction, /if \(recoveryFlow\) redirect\("\/"\)/);
  assert.match(setPasswordAction, /redirect\("\/onboarding"\)/);
  assert.match(setPasswordAction, /authMessagePath/);
  assert.match(setPasswordAction, /is_anonymous/);
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
  assert.match(actions, /authMessagePath/);
  assert.match(config, /enable_signup = false/);
  assert.match(currentUser, /team_members/);
  assert.doesNotMatch(currentUser, /metadata\.(role|app_role)|user_metadata.*\["role"\]/);
  assert.match(membershipMigration, /create table if not exists public\.team_members/);
  assert.match(membershipMigration, /status text not null default 'pending' check \(status in \('pending', 'active', 'disabled'\)\)/);
  assert.match(membershipMigration, /revoke all on table public\.team_members from anon, authenticated/);
  assert.doesNotMatch(membershipMigration, /grant (insert|update|delete).*team_members.*authenticated/i);
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
  const [adminServer, adminRoute, adminClient, adminPage, adminMigration, membershipLifecycleMigration] = await Promise.all([
    readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/members/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830033918_admin_membership_operations.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260831135600_pending_assessment_membership.sql", import.meta.url), "utf8"),
  ]);

  assert.match(adminServer, /^import "server-only";/);
  assert.match(adminServer, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(adminServer + adminRoute + adminClient, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
  assert.match(adminServer, /requireActiveAdmin/);
  assert.match(adminRoute, /inviteUserByEmail/);
  assert.match(adminRoute, /authInviteRedirectUrl/);
  assert.match(adminRoute, /inviteUserByEmail\(email, \{ redirectTo \}\)/);
  assert.match(adminRoute, /admin_register_invited_member/);
  assert.match(adminRoute, /admin_update_team_member/);
  assert.match(adminMigration, /values \(p_user_id, 'builder', 'pending'\)/);
  assert.match(adminMigration, /p_status not in \('pending', 'active', 'disabled'\)/);
  assert.match(adminMigration, /team_membership_audit_events/);
  assert.match(adminMigration, /An admin cannot demote or disable their own membership/);
  assert.match(adminClient, /admin: "Супер админ"/);
  assert.match(adminClient, /Last super admin: protected/);
  assert.match(adminPage, /Супер админ · \{user\.email\}/);
  assert.match(adminMigration, /create or replace function public\.admin_update_team_member[\s\S]*security invoker/);
  assert.doesNotMatch(adminMigration, /create or replace function public\.admin_update_team_member[\s\S]{0,180}security definer/);
  assert.match(membershipLifecycleMigration, /alter column status set default 'pending'/);
  assert.match(membershipLifecycleMigration, /drop constraint if exists team_members_status_check/);
  assert.match(membershipLifecycleMigration, /values \(p_user_id, 'builder', 'pending'\)/);
  assert.match(membershipLifecycleMigration, /p_status not in \('pending', 'active', 'disabled'\)/);
  assert.match(membershipLifecycleMigration, /create or replace function private\.admin_update_team_member/);
});

test("privileged and privacy JSON routes enforce actual body size and object shape", async () => {
  const [adminRoute, privacyRoute] = await Promise.all([
    readFile(new URL("../app/api/admin/members/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/privacy/route.ts", import.meta.url), "utf8"),
  ]);

  for (const route of [adminRoute, privacyRoute]) {
    assert.match(route, /const rawBody = await request\.text\(\)/);
    assert.match(route, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength/);
    assert.match(route, /JSON\.parse\(rawBody\)/);
    assert.match(route, /Array\.isArray\(body\)/);
  }
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
