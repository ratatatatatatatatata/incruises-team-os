import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server-renders the Team OS application shell", async () => {
  const [page, app] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/team-os-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /inCruises/);
  assert.match(page, /TEAM OS/);
  assert.match(app, /Хяналтын төв/);
  assert.match(app, /Content Studio/);
  assert.match(app, /Source Vault/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape/);
});

test("ships product metadata, persistence and PWA wiring", async () => {
  const [page, layout, manifest, serviceWorker, hosting, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /TeamOsApp/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /inCruises Team OS/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(serviceWorker, /\/api\//);
  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(schema, /contentDrafts/);
  assert.match(schema, /lessonProgress/);
  assert.match(schema, /memberTasks/);
});
