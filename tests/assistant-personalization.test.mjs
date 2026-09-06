import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("personal assistant uses bounded user-owned reflection evidence without persisting it in snapshots", async () => {
  const [context, route] = await Promise.all([
    readFile(new URL("../lib/ai/member-context.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(context, /assessment_questions!inner\(prompt,dimension,response_type,phase\)/);
  assert.match(context, /\.eq\("assessment_questions\.response_type", "short_text"\)/);
  assert.match(context, /\.limit\(20\)/);
  assert.match(route, /user_reflections: success\.reflections\.slice\(0, 12\)/);
  assert.match(route, /answer: reflection\.answer\.slice\(0, 320\)/);

  const snapshotStart = route.indexOf("const contextSnapshot");
  const createTurnStart = route.indexOf("create_assistant_turn", snapshotStart);
  assert.doesNotMatch(route.slice(snapshotStart, createTurnStart), /user_reflections/);
});
