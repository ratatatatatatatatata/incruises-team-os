import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import * as planner from "../lib/success-map/planner.ts";
import * as clarification from "../lib/success-map/clarification.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sentinel = "Q1_PRIVATE_CONTEXT_9424_DO_NOT_SHARE";
const answers = {
  currentContext: `Миний хувийн нөхцөлийн нууц тэмдэглэл: ${sentinel}`,
  goal30Day: "Өдрийн ажлаа төлөвлөж, өөрийгөө удирдаж сурмаар байна.",
  weeklyCapacity: "Долоо хоногт нийт 15 минут",
  primaryBlocker: "Хийх ажлаа сонгоод эхлэхэд жишээ хэрэгтэй байна.",
  growthPreferences: "Нэг удаад нэг жижиг ажил, энгийн жишээ хүсэж байна.",
};

function compileModule(path, mocks, env = {}) {
  const source = readFileSync(path, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: fileURLToPath(path),
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(code, {
    module: compiledModule,
    exports: compiledModule.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    process: { env },
    AbortSignal, Request, Response, Date, console,
  });
  return compiledModule.exports;
}

function echoedAction() {
  return {
    title: `Нууц сэдвээр ажиллах ${sentinel}`,
    detail: `Энэ зөвлөгөөнд хувийн нөхцөл орсон: ${sentinel}`,
    doneWhen: `Хувийн нөхцөлтэй холбоотой үр дүн ${sentinel}`,
  };
}

const shareableActions = (plan) => ({ todayAction: plan.todayAction, weeklyActions: plan.weeklyActions });

test("AI-echoed private Q1 text is kept out of initial and future shared action fields", async () => {
  const basePlan = planner.createStarterPlan(answers, []);
  let calls = 0;
  const ai = compileModule(new URL("../lib/success-map/ai.ts", import.meta.url), {
    "server-only": {},
    "./planner": planner,
    ai: {
      Output: { object: (value) => value },
      generateText: async () => {
        calls += 1;
        return { output: {
          profileSummary: `Зөвхөн өөрт харагдах хувийн тайлбар ${sentinel}`,
          whyThisPlan: `Таны хувийн нөхцөлд үндэслэсэн тайлбар ${sentinel}`,
          todayAction: echoedAction(),
          weeklyActions: Array.from({ length: 3 }, echoedAction),
          managementFocus: ["Нэг зорилго", "Нэг алхам", "Бодит үр дүн"],
          successMeasures: ["Хийсэн ажил", "Бодит ахиц", "Дараагийн алхам"],
          contentAngles: null,
        } };
      },
    },
  }, { AI_GATEWAY_API_KEY: "synthetic-test-only-not-a-credential" });
  const result = await ai.personalizeStarterPlan(answers, basePlan);
  assert.equal(calls, 1);
  assert.equal(result.usedAi, true);
  assert.ok(result.plan.profileSummary.includes(sentinel));
  assert.ok(!JSON.stringify(shareableActions(result.plan)).includes(sentinel));
  assert.deepEqual(shareableActions(result.plan), shareableActions(basePlan));
});

test("the persistence boundary rejects AI action text even if personalization returns it", async () => {
  for (const first30DayEnabled of [true, false]) {
    for (const supportSummaryConsent of [true, false]) {
      let savedPayload;
      let savedRpc;
      const supabase = {
        auth: { getClaims: async () => ({ data: { claims: { sub: "synthetic-user" } }, error: null }) },
        from(table) {
          const data = table === "team_members" ? { status: "active" } : table === "member_success_maps" ? null : [];
          const result = { data, error: null };
          const query = {
            select() { return this; }, eq() { return this; }, order() { return this; },
            maybeSingle: async () => result,
            then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
          };
          return query;
        },
        rpc: async (name, payload) => {
          savedRpc = name;
          savedPayload = payload;
          return { data: { completed_at: "2026-09-24T00:00:00Z" }, error: null };
        },
      };
      const route = compileModule(new URL("../app/api/success-map/route.ts", import.meta.url), {
        "@/lib/supabase/server": { createClient: async () => supabase },
        "@/lib/success-map/planner": planner,
        "@/lib/success-map/clarification": clarification,
        "@/lib/success-map/ai": {
          STARTER_PLAN_MODEL: "synthetic-test-model",
          personalizeStarterPlan: async (_answers, basePlan) => ({
            usedAi: true, fallbackReason: null,
            plan: {
              ...basePlan,
              profileSummary: `Хувийн тайлбар ${sentinel}`,
              todayAction: { ...echoedAction(), minutes: 15 },
              weeklyActions: Array.from({ length: 3 }, echoedAction),
            },
          }),
        },
      }, { FIRST_30_DAY_LOOP_ENABLED: String(first30DayEnabled) });
      const response = await route.POST(new Request("https://insuccess.example/api/success-map", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...answers, aiConsent: true, supportSummaryConsent }),
      }));
      assert.equal(response.status, 200);
      assert.equal(savedRpc, first30DayEnabled ? "complete_starter_success_map_v2" : "complete_starter_success_map");
      assert.ok(savedPayload.p_current_context.includes(sentinel));
      assert.ok(savedPayload.p_plan.profileSummary.includes(sentinel));
      assert.ok(!JSON.stringify(shareableActions(savedPayload.p_plan)).includes(sentinel));
      assert.deepEqual(shareableActions(savedPayload.p_plan), shareableActions(planner.createStarterPlan(answers, [])));
      const returned = await response.json();
      assert.ok(!JSON.stringify(shareableActions(returned.plan)).includes(sentinel));
    }
  }
});
