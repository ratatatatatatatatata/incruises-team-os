import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the Team OS application and Supabase login flow", async () => {
  const [page, app, login, currentUser] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/current-user.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /TeamOsApp/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(app, /Хяналтын төв/);
  assert.match(app, /Content Studio/);
  assert.match(app, /Source Vault/);
  assert.match(login, /SUPABASE SECURE ACCESS/);
  assert.match(currentUser, /getClaims/);
  assert.doesNotMatch(page + currentUser, /chatGPTSignInPath|oai-authenticated-user/);
});

test("ships Supabase RLS persistence, SSR session refresh and PWA wiring", async () => {
  const [layout, manifest, serviceWorker, migration, serverClient, rootProxy, api] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260810000000_team_os.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /\/og\.png/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(serviceWorker, /\/api\//);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(serverClient, /createServerClient/);
  assert.match(rootProxy, /updateSession/);
  assert.match(api, /lesson_progress/);
  assert.match(api, /content_drafts/);
  assert.match(api, /member_tasks/);
  assert.doesNotMatch(api, /drizzle|cloudflare:workers/);
});
