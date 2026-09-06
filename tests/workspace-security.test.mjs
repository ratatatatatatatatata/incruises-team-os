import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace mutations reject cross-origin and oversized requests before authentication", async () => {
  const route = await readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  const postStart = route.indexOf("export async function POST");
  const post = route.slice(postStart);

  assert.match(route, /origin !== new URL\(request\.url\)\.origin/);
  assert.match(route, /contentLength > 32_768/);
  assert.match(route, /TextEncoder\(\).*byteLength > 32_768/);
  assert.ok(post.indexOf("assertSameOrigin(request)") < post.indexOf("authorizedContext()"));
  assert.ok(post.indexOf("readWorkspaceBody(request)") < post.indexOf("authorizedContext()"));
});
test("workspace authentication rejects anonymous users and server errors do not log raw objects", async () => {
  const route = await readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
  assert.match(route, /claims\?\.is_anonymous === true/);
  assert.doesNotMatch(route, /console\.error\("Workspace request failed",\s*error\)/);
});
