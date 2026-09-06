import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships a least-privilege Video Academy schema and guarded progress workflow", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260906110000_video_academy_foundation.sql", import.meta.url),
    "utf8",
  );

  for (const table of [
    "academy_courses",
    "academy_modules",
    "academy_lessons",
    "academy_video_assets",
    "academy_watch_progress",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }

  assert.match(migration, /status in \('draft', 'published', 'archived'\)/);
  assert.match(migration, /playback_policy in \('public', 'signed'\)/);
  assert.match(migration, /private\.is_active_academy_member\(\)/);
  assert.match(migration, /create or replace function public\.save_academy_watch_progress[\s\S]*security invoker/);
  assert.match(migration, /create or replace function private\.save_academy_watch_progress[\s\S]*security definer/);
  assert.match(migration, /v_percent >= 90/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[\s\S]{0,80}academy_courses to authenticated/i);
  assert.doesNotMatch(migration, /grant select \([\s\S]{0,200}mux_asset_id/);
});

test("serves authorized public or signed Mux playback without exposing signing keys", async () => {
  const [mux, playbackRoute, academyRoute, config] = await Promise.all([
    readFile(new URL("../lib/academy/mux.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/academy/playback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/academy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(mux, /createSign\("RSA-SHA256"\)/);
  assert.match(mux, /MUX_SIGNING_KEY_ID/);
  assert.match(mux, /MUX_SIGNING_PRIVATE_KEY/);
  assert.match(mux, /input\.policy === "public"/);
  assert.match(mux, /playback-token/);
  assert.match(playbackRoute, /requireAcademyMember/);
  assert.match(playbackRoute, /\.eq\("status", "published"\)/);
  assert.match(playbackRoute, /"Cache-Control": "private, no-store"|academyJson/);
  assert.doesNotMatch(playbackRoute, /MUX_SIGNING_PRIVATE_KEY/);
  assert.match(academyRoute, /assertAcademySameOrigin/);
  assert.match(academyRoute, /save_academy_watch_progress/);
  assert.match(config, /frame-src 'self' https:\/\/player\.mux\.com/);
  assert.match(config, /media-src 'self' blob: https:\/\/\*\.mux\.com/);
});

test("includes member and bounded admin Academy experiences without upload or delete actions", async () => {
  const [catalog, lesson, player, adminPage, adminClient, adminApi] = await Promise.all([
    readFile(new URL("../app/academy/academy-catalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/academy/[lessonId]/academy-lesson-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/academy/[lessonId]/mux-video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/academy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/academy/admin-academy-catalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/academy/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(catalog, /Үргэлжлүүлэн үзэх/);
  assert.match(lesson, /MuxVideoPlayer/);
  assert.match(player, /onTimeUpdate/);
  assert.match(player, /playerMode === "native"/);
  assert.match(player, /<iframe/);
  assert.match(player, /Дуусгасан гэж тэмдэглэх/);
  assert.match(adminPage, /SUPABASE_SECRET_KEY/);
  assert.match(adminApi, /requireActiveAdmin/);
  assert.match(adminApi, /createPrivilegedAdminClient/);
  assert.match(adminApi, /action === "set_status"/);
  assert.match(adminClient, /Mux playback ID/);
  assert.doesNotMatch(adminApi + adminClient, /uploadUserMedia|directUpload|delete\(/i);
});

test("enforces Academy JSON limits on actual request bytes and object shapes", async () => {
  const [memberServer, adminApi] = await Promise.all([
    readFile(new URL("../lib/academy/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/academy/route.ts", import.meta.url), "utf8"),
  ]);

  for (const source of [memberServer, adminApi]) {
    assert.match(source, /await request\.text\(\)/);
    assert.match(source, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength/);
    assert.match(source, /JSON\.parse\(rawBody\)/);
    assert.match(source, /Array\.isArray\(body\)/);
  }
});
