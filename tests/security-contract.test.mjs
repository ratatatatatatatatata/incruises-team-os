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
  const [login, signupPage, signupAction, currentUser, config, inviteTemplate, membershipMigration, inviteMigration, inviteTriggerMigration, inviteFunction] = await Promise.all([
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signup/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signup/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/current-user.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
    readFile(new URL("../supabase/templates/invite.html", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260829062550_harden_membership_access.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260915213140_invite_only_success_map_v1.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260917173000_ensure_invite_only_auth_trigger.sql", import.meta.url), "utf8"),
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
  assert.match(inviteTriggerMigration, /create trigger on_auth_user_created_create_team_profile/);
  assert.match(inviteTriggerMigration, /execute function private\.handle_new_team_user\(\)/);
  assert.doesNotMatch(inviteTriggerMigration, /insert into public\.(user_profiles|team_members)/);
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

test("sponsor relationship foreign keys have covering indexes", async () => {
  const indexMigration = await readFile(
    new URL("../supabase/migrations/20260916175300_index_member_relationships_creator.sql", import.meta.url),
    "utf8",
  );

  assert.match(indexMigration, /member_relationships_created_by_idx/);
  assert.doesNotMatch(indexMigration, /drop|delete|truncate/i);
});

test("starter advice is explicit, measurable and upgrade-safe", async () => {
  const [planner, ai, app, route] = await Promise.all([
    readFile(new URL("../lib/success-map/planner.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/success-map/ai.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(planner, /type FocusTrack = "content" \| "follow_up" \| "discovery" \| "communication" \| "learning" \| "team" \| "general"/);
  assert.match(planner, /version: 3/);
  assert.match(planner, /doneWhen/);
  assert.match(planner, /normalizeMongolianIntent/);
  assert.match(planner, /actionConflictsWithAnswers/);
  assert.match(ai, /weeklyActions/);
  assert.match(ai, /successMeasures/);
  assert.match(ai, /Хэрэглэгчийн хариултад байхгүй орлого, үр дүн, хүний тоо эсвэл амжилтын тоон зорилт зохиож болохгүй/);
  assert.match(app, /ӨНӨӨДРИЙН НЭГ АЖИЛ/);
  assert.match(app, /Start\/Done\/Blocked|Эхлэх|Тусламж хэрэгтэй/);
  assert.match(app, /Төлөвлөгөөг тодорхой болгох/);
  assert.match(app, /Дууссан гэж үзэх шалгуур/);
  assert.match(route, /function sameOrigin/);
  assert.match(route, /contentLength > 32_000/);
});

test("first 30 day loop is additive, gated and relationship-scoped", async () => {
  const [migration, indexMigration, workspace, app, env] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260917171558_first_30_days_member_support_loop.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260917173500_index_first_30_days_foreign_keys.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  for (const table of ["member_actions", "member_action_events", "support_requests", "support_request_events", "member_academy_practices", "member_development_evidence", "external_rank_claims"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.match(migration, /current_user_is_direct_supporter/);
  assert.match(migration, /member_success_summaries_sharing_gate[\s\S]*as restrictive/);
  assert.doesNotMatch(migration, /drop table|truncate table|delete from/i);
  assert.doesNotMatch(migration, /create trigger[^;]+external_rank_claims/i);
  assert.doesNotMatch(migration, /update\s+public\.team_members[\s\S]{0,200}external_rank_claims/i);
  for (const index of ["coach_notes_support_request_member_idx", "member_action_events_actor_idx", "support_request_events_actor_idx", "support_requests_checkin_idx"]) {
    assert.match(indexMigration, new RegExp(`create index if not exists ${index}`));
  }
  assert.doesNotMatch(indexMigration, /drop|delete|truncate/i);
  assert.match(workspace, /FIRST_30_DAY_LOOP_ENABLED/);
  assert.match(env, /FIRST_30_DAY_LOOP_ENABLED=false/);
  assert.match(app, /Түүхий 5 хариулт харагдахгүй/);
  assert.match(app, /Rank мэдээллийг зөвхөн нотолгоотой бүртгэнэ/);
  assert.match(app, /хэрэглэгчийн эрх, Academy access, зөвлөмжийг өөрчлөхгүй/);
});

test("P1 support loop hardening is fail-closed and preserves member feedback history", async () => {
  const [migration, followupMigration, workspace, app, onboarding, onboardingPage, successMapRoute] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260918123000_harden_member_support_feedback_loop.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260918123100_p1_consent_and_queue_followup.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/onboarding-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/success-map/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /current_user_has_active_membership/);
  assert.match(migration, /coalesce\(v_request\.assigned_to = v_user_id, false\)/);
  assert.match(migration, /A member cannot review their own practice/);
  assert.match(migration, /status = case when v_assigned_to is null then 'unassigned' else 'assigned' end/);
  assert.match(migration, /outcome_helpful = false/);
  assert.match(migration, /next_check_at = now\(\) \+ interval '1 day'/);
  assert.match(migration, /member_actions_sync_current_summary/);
  assert.match(migration, /viewer\.role = 'admin'/);
  assert.doesNotMatch(migration, /viewer\.role in \('admin', 'director'\)/);
  assert.match(followupMigration, /alter column sharing_enabled set default false/);
  assert.match(followupMigration, /alter column support_summary_consent set default false/);
  assert.match(followupMigration, /member_success_maps_sync_summary_consent/);
  assert.match(followupMigration, /p_helpful is null/);
  assert.match(followupMigration, /assigned\.role = 'admin'/);
  assert.match(followupMigration, /resolutionNote/);
  assert.match(workspace, /completedActionCountByMember/);
  assert.match(workspace, /myPracticesResult/);
  assert.match(app, /Энэ нь feature flag-ийн алдаа биш/);
  assert.match(app, /first30DayEnabled=\{workspace\.first30DayEnabled\}/);
  assert.match(app, /ДУУСГААГҮЙ ДАДЛАГА/);
  assert.match(app, /Coach feedback ба өмнөх дадлагын түүх/);
  assert.match(app, /nextCheckAt: nextCheckAt \? new Date\(nextCheckAt\)\.toISOString\(\) : null/);
  assert.match(onboarding, /ажил, амьдрал, сурч байгаа зүйл/i);
  assert.match(onboardingPage, /initialSupportSummaryConsent=\{row\?\.support_summary_consent \?\? false\}/);
  assert.match(successMapRoute, /supportSummaryConsent: z\.boolean\(\)\.default\(false\)/);
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
