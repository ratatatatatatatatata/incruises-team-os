import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the personal inSuccess home, Team OS workspace and Supabase login flow", async () => {
  const [page, home, workspace, app, login, currentUser, brand] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/member-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/current-user.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/brand.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MemberHome/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(page, /redirect\("\/onboarding"\)/);
  assert.match(workspace, /TeamOsApp/);
  assert.match(home, /15 \+ 100/);
  assert.match(home, /Хувийн AI туслах/);
  assert.match(app, /Хяналтын төв/);
  assert.match(app, /Content Studio/);
  assert.match(app, /Source Vault/);
  assert.match(login, /PRIVATE TEAM ACCESS/);
  assert.match(brand, /BRAND_NAME = "inSuccess"/);
  assert.doesNotMatch(page + home + app + login + brand, /inCruises/);
  assert.match(currentUser, /getClaims/);
  assert.doesNotMatch(page + currentUser, /chatGPTSignInPath|oai-authenticated-user/);
});

test("ships Supabase RLS persistence, SSR session refresh and PWA wiring", async () => {
  const [layout, manifest, serviceWorker, socialImage, migration, serverClient, rootProxy, api] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/opengraph-image.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260810000000_team_os.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /PRODUCT_NAME/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /PRODUCT_SHORT_NAME/);
  assert.match(serviceWorker, /insuccess-shell-v3/);
  assert.doesNotMatch(serviceWorker, /\/og\.png/);
  assert.match(socialImage, /ImageResponse/);
  assert.match(socialImage, /BRAND_NAME/);
  assert.match(serviceWorker, /STATIC_ASSETS\.includes\(url\.pathname\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(serverClient, /createServerClient/);
  assert.match(rootProxy, /updateSession/);
  assert.match(api, /lesson_progress/);
  assert.match(api, /content_drafts/);
  assert.match(api, /member_tasks/);
  assert.doesNotMatch(api, /drizzle|cloudflare:workers/);
});

test("keeps production Supabase auth safeguards in version control", async () => {
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

  assert.match(config, /site_url = "https:\/\/incruises-team-os\.vercel\.app"/);
  assert.match(config, /enable_signup = false/);
  assert.match(config, /enable_confirmations = true/);
  assert.match(config, /secure_password_change = true/);
  assert.match(config, /otp_length = 8/);
  assert.match(config, /enroll_enabled = true/);
  assert.match(config, /verify_enabled = true/);
});
