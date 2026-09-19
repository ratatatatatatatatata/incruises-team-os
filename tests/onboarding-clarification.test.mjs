import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  answerNeedsClarification,
  CLARIFICATION_GUIDANCE,
  clarificationMessage,
  clarificationReason,
  firstAnswerNeedingClarification,
  isStandaloneUnknown,
  parseWeeklyCapacityMinutes,
  STARTER_ANSWER_KEYS,
} from "../lib/success-map/clarification.ts";

const RESOLVED_ANSWERS = {
  currentContext: "Одоогоор шинэ ажилдаа дасаж, гэр бүлийн цагаа зэрэг зохицуулж байна.",
  goal30Day: "30 хоногийн дараа хурлын үеэр санаагаа хоёр минут ойлгомжтой хэлдэг болно.",
  weeklyCapacity: "Долоо хоногт нийт 20 минут гаргаж чадна.",
  primaryBlocker: "Яриагаа яаж эхлэхээ мэдэхгүй; бичиж үзэхээр хэт урт болдог.",
  growthPreferences: "Нэг удаад нэг жижиг ажил аваад coach-оос товч feedback авмаар байна.",
};

test("blank, too-short and standalone unknown answers request clarification", () => {
  assert.equal(answerNeedsClarification("currentContext", ""), true);
  assert.equal(answerNeedsClarification("goal30Day", "   "), true);
  assert.equal(answerNeedsClarification("weeklyCapacity", "?"), true);
  for (const answer of ["Мэдэхгүй байна", "Мэдэхгүй байна аа", "Яг сайн мэдэхгүй байна", "Сайн мэдэхгүй", "одоохондоо тодорхойгүй", "medehgui baina", "medehgui bn", "not sure", "not sure yet", "idk", "n/a"]) {
    assert.equal(isStandaloneUnknown(answer), true, answer);
  }
});

test("short detail is not mislabelled as unknown and bare minutes remain usable", () => {
  assert.equal(clarificationReason("currentContext", "Оюутан"), "needs_detail");
  assert.match(clarificationMessage("needs_detail"), /дэлгэрүүлж/);
  assert.doesNotMatch(clarificationMessage("needs_detail"), /мэдэхгүй/);
  assert.equal(answerNeedsClarification("weeklyCapacity", "5"), false);
  assert.equal(clarificationReason("weeklyCapacity", "0 минут"), "invalid_capacity");
  assert.equal(clarificationReason("weeklyCapacity", "маргааш"), "invalid_capacity");
  assert.equal(clarificationReason("weeklyCapacity", "1 минут"), "invalid_capacity");
  assert.equal(parseWeeklyCapacityMinutes("0.25 tsag"), 15);
});

test("meaningful uncertainty remains a valid blocker", () => {
  assert.equal(isStandaloneUnknown(RESOLVED_ANSWERS.primaryBlocker), false);
  assert.equal(answerNeedsClarification("primaryBlocker", RESOLVED_ANSWERS.primaryBlocker), false);
});

test("the first unresolved answer is returned in question order", () => {
  assert.equal(firstAnswerNeedingClarification({ ...RESOLVED_ANSWERS, goal30Day: "", primaryBlocker: "Мэдэхгүй байна" }), "goal30Day");
  assert.equal(firstAnswerNeedingClarification(RESOLVED_ANSWERS), null);
});

test("every follow-up choice resolves its own question", () => {
  assert.deepEqual(Object.keys(CLARIFICATION_GUIDANCE), STARTER_ANSWER_KEYS);
  for (const key of STARTER_ANSWER_KEYS) {
    assert.ok(CLARIFICATION_GUIDANCE[key].prompt.length > 10);
    assert.ok(CLARIFICATION_GUIDANCE[key].choices.length >= 3);
    for (const choice of CLARIFICATION_GUIDANCE[key].choices) {
      assert.equal(answerNeedsClarification(key, choice), false, `${key}: ${choice}`);
    }
  }
});

test("client and API both enforce the shared clarification gate before save", async () => {
  const [form, route] = await Promise.all([
    readFile(new URL("../app/onboarding/onboarding-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/success-map/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(form, /firstAnswerNeedingClarification\(answers\)/);
  assert.match(form, /activeClarification/);
  assert.match(form, /Илүү энгийнээр асууя/);
  assert.doesNotMatch(form, /onBlur=/);
  assert.match(form, /disabled=\{saving\}/);
  assert.doesNotMatch(form, /disabled=\{saving \|\| completed !== QUESTIONS\.length\}/);
  assert.match(route, /firstAnswerNeedingClarification\(submittedAnswers\)/);
  assert.match(route, /code: "clarification_required"/);
  assert.match(route, /status: 422/);
  assert.ok(route.indexOf("firstAnswerNeedingClarification(submittedAnswers)") < route.indexOf("await createClient()"));
  assert.ok(route.indexOf("firstAnswerNeedingClarification(submittedAnswers)") < route.indexOf("await personalizeStarterPlan"));
  assert.ok(route.indexOf("firstAnswerNeedingClarification(submittedAnswers)") < route.indexOf("supabase.rpc"));
});
