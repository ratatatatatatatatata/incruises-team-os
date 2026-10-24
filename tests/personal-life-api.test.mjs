import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { emptyLife } from "../lib/life/domain.ts";
import { RequestAuthError } from "../lib/supabase/request-policy.ts";

test("personal API enforces verified identity, active membership, strict input, CAS and truthful storage failures", async () => {
  let active = true;
  let mode = "okay";
  let saved = null;
  let supplied = null;
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () =>
      mode === "conflict"
        ? { data: null, error: null }
        : { data: { revision: 2 }, error: null },
    single: async () =>
      mode === "database-error"
        ? { data: null, error: { code: "42P01" } }
        : { data: { revision: 1 }, error: null },
  };
  const mock = {
    from(table) {
      if (table === "team_members")
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { status: active ? "active" : "disabled" },
            error: null,
          }),
        };
      assert.equal(table, "personal_life_workspaces");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: saved, error: null }),
        insert(v) {
          supplied = v;
          return query;
        },
        update(v) {
          supplied = v;
          return query;
        },
      };
    },
  };
  const symbol = Symbol.for("insuccess.personal-api-test");
  globalThis[symbol] = async () => {
    if (mode === "unauthenticated")
      throw new RequestAuthError("Sign in required");
    return { supabase: mock, userId: "verified-member" };
  };
  try {
    let source = await readFile(
      new URL("../app/api/life-workspace/route.ts", import.meta.url),
      "utf8",
    );
    source = source.replace(
      /import \{ requestAuth \} from "[^"]+";/,
      'const requestAuth = globalThis[Symbol.for("insuccess.personal-api-test")];',
    );
    for (const [alias, path] of [
      ["@/lib/supabase/request-policy", "../lib/supabase/request-policy.ts"],
      ["@/lib/life/domain", "../lib/life/domain.ts"],
    ])
      source = source.replace(
        `"${alias}"`,
        JSON.stringify(new URL(path, import.meta.url).href),
      );
    source = source.replace(
      '"zod"',
      JSON.stringify(
        new URL("../node_modules/zod/index.js", import.meta.url).href,
      ),
    );
    const js = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
    );
    const req = (body, origin = "https://www.insuccess.net") =>
      new Request("https://www.insuccess.net/api/life-workspace", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const body = { revision: 0, state: emptyLife() };
    assert.equal(
      (await api.POST(req(body, "https://attacker.example"))).status,
      403,
    );
    mode = "unauthenticated";
    assert.equal(
      (
        await api.GET(
          new Request("https://www.insuccess.net/api/life-workspace"),
        )
      ).status,
      401,
    );
    mode = "okay";
    active = false;
    assert.equal((await api.POST(req(body))).status, 403);
    active = true;
    assert.equal(
      (await api.POST(req({ ...body, user_id: "other-member" }))).status,
      400,
    );
    assert.equal(
      (
        await api.POST(
          req({ ...body, state: { ...emptyLife(), tasks: [{ minutes: -1 }] } }),
        )
      ).status,
      400,
    );
    assert.equal((await api.POST(req(body))).status, 200);
    assert.equal(supplied.user_id, "verified-member");
    assert.equal(supplied.revision, 1);
    saved = { state: emptyLife(), revision: 1 };
    const loaded = await api.GET(
      new Request("https://www.insuccess.net/api/life-workspace"),
    );
    assert.equal(loaded.headers.get("cache-control"), "no-store");
    assert.deepEqual((await loaded.json()).workspace, saved);
    mode = "conflict";
    assert.equal((await api.POST(req({ ...body, revision: 1 }))).status, 409);
    mode = "database-error";
    assert.equal((await api.POST(req(body))).status, 503);
  } finally {
    delete globalThis[symbol];
  }
});
