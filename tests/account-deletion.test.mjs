import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("account deletion request lifecycle is owner-scoped, locked and non-destructive", async () => {
  const [migration, route, databaseTest] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260906103524_account_deletion_requests.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account-deletion/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/tests/009_account_deletion.test.sql", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /create table if not exists public\.account_deletion_requests/);
  assert.match(migration, /alter table public\.account_deletion_requests enable row level security/);
  assert.match(migration, /grant select on table public\.account_deletion_requests to authenticated/);
  assert.match(migration, /create or replace function public\.request_account_deletion\(\)[\s\S]*?security invoker/);
  assert.match(migration, /create or replace function public\.cancel_account_deletion_request\(\)[\s\S]*?security invoker/);
  assert.equal((migration.match(/pg_advisory_xact_lock/g) ?? []).length, 2);
  assert.match(migration, /if v_existing_status in \('requested', 'processing'\)/);
  assert.match(migration, /if v_existing_status = 'cancelled'[\s\S]*return 'cancelled'/);
  assert.match(migration, /create or replace function public\.health_check\(\)[\s\S]*?select true/);
  assert.match(migration, /grant execute on function public\.health_check\(\) to anon, authenticated/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);

  assert.match(route, /supabase\.auth\.getClaims\(\)/);
  assert.match(route, /origin !== new URL\(request\.url\)\.origin/);
  assert.match(route, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength > 2_048/);
  assert.match(route, /request_account_deletion/);
  assert.match(route, /cancel_account_deletion_request/);
  assert.doesNotMatch(route, /SUPABASE_SECRET_KEY|createPrivilegedAdminClient|\.delete\(/);

  assert.match(databaseTest, /select plan\(29\)/);
  assert.match(databaseTest, /Browser clients cannot update deletion request status directly/);
  assert.match(databaseTest, /Repeating a queued request is idempotent/);
  assert.match(databaseTest, /An active admin may read the operator queue/);
});

test("store-facing legal and deletion paths are public, linked and explicit about draft gaps", async () => {
  const [deletionPage, deletionControl, privacyNotice, terms, privacyClient, login, loginAction, footer, layout, robots] = await Promise.all([
    readFile(new URL("../app/account-deletion/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-deletion/account-deletion-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/legal/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/legal/terms/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/privacy-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/legal-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
  ]);

  assert.match(deletionPage, /robots: \{ index: true, follow: true \}/);
  assert.match(deletionPage, /энэ алхам өгөгдөл устгахгүй/);
  assert.match(deletionControl, /\/login\?next=\/account-deletion/);
  assert.match(deletionControl, /Одоогоор өгөгдөл автоматаар устгагдаагүй/);
  assert.match(privacyNotice, /OWNER-REVIEW DRAFT/);
  assert.match(privacyNotice, /бодит өгөгдөл автоматаар устгахгүй/);
  assert.match(terms, /production хэрэглэгчтэй байгуулах эцсийн хууль зүйн нөхцөл биш/);
  assert.match(privacyClient, /\/account-deletion#manage/);
  assert.match(login, /\/legal\/privacy/);
  assert.match(login, /name="next" type="hidden"/);
  assert.match(loginAction, /safeNextPath/);
  assert.match(loginAction, /redirect\(next\)/);
  assert.match(footer, /\/legal\/privacy/);
  assert.match(footer, /\/account-deletion/);
  assert.match(layout, /<LegalFooter \/>/);
  assert.match(robots, /allow: \["\/account-deletion", "\/legal\/privacy", "\/legal\/terms"\]/);
});

test("admin has a read-only account deletion queue with an explicit manual completion gate", async () => {
  const [route, page, client, adminPage] = await Promise.all([
    readFile(new URL("../app/api/admin/account-deletion/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/account-deletion/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/account-deletion/queue.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /requireActiveAdmin\(\)/);
  assert.match(route, /\.from\("account_deletion_requests"\)/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)|\.update\(|\.delete\(/);
  assert.match(page, /Бодит deletion\/anonymization болон хэрэглэгчид өгөх мэдэгдлийг/);
  assert.match(page, /автомат deletion worker[\s\S]*байхгүй/);
  assert.match(client, /Бүртгэгдсэн хүсэлтүүд/);
  assert.match(adminPage, /\/admin\/account-deletion/);
});
