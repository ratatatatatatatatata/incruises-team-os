import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildTailoredQuestionSet,
  TAILORED_DIMENSIONS,
} from "../lib/assessment/tailored-validation.mjs";

function validSections() {
  return TAILORED_DIMENSIONS.map((dimension) => ({
    dimension,
    scales: Array.from({ length: 8 }, (_, index) => ({
      prompt: `${dimension} чиглэлд бодит нөхцөл ${index + 1} үүсэхэд та хийх ажлаа хэр тогтвортой үргэлжлүүлдэг вэ?`,
      helpText: `Сүүлийн бодит жишээгээ бодоод ${index + 1}-ээс 5 хүртэл үнэлээрэй.`,
    })),
    reflections: Array.from({ length: 2 }, (_, index) => ({
      prompt: `${dimension} чиглэлд таны аргыг илүү сайн ойлгоход туслах бодит жишээ ${index + 1}-ээ тайлбарлана уу.`,
      helpText: `Нөхцөл, өөрийн хийсэн үйлдэл, гарсан сургамжаа ${index + 1} өгүүлбэрээр бичээрэй.`,
    })),
  }));
}

test("builds exactly 100 safe, interleaved, dimension-balanced questions", () => {
  const questions = buildTailoredQuestionSet(validSections());
  assert.equal(questions.length, 100);
  assert.deepEqual(questions.map((question) => question.position), Array.from({ length: 100 }, (_, index) => index + 1));

  for (const dimension of TAILORED_DIMENSIONS) {
    const dimensionQuestions = questions.filter((question) => question.dimension === dimension);
    assert.equal(dimensionQuestions.length, 10);
    assert.equal(dimensionQuestions.filter((question) => question.responseType === "scale").length, 8);
    assert.equal(dimensionQuestions.filter((question) => question.responseType === "short_text").length, 2);
  }
  assert.equal(questions[40].responseType, "short_text");
  assert.equal(questions[90].responseType, "short_text");
});

test("rejects duplicate and sensitive generated prompts before persistence", () => {
  const duplicated = validSections();
  duplicated[0].scales[1].prompt = duplicated[0].scales[0].prompt;
  assert.throws(() => buildTailoredQuestionSet(duplicated), /question_set_not_unique/);

  const sensitive = validSections();
  sensitive[0].scales[0].prompt = "Баталгаажуулах код болон нууц үгээ энд дэлгэрэнгүй бичнэ үү.";
  assert.throws(() => buildTailoredQuestionSet(sensitive), /forbidden_topic/);

  const sensitiveHelp = validSections();
  sensitiveHelp[0].scales[0].helpText = "Нууц үгээ жишээ болгон энд бичээрэй.";
  assert.throws(() => buildTailoredQuestionSet(sensitiveHelp), /forbidden_topic/);

  const namedRank = validSections();
  namedRank[0].scales[0].prompt = "Board Director болох зорилгодоо хүрэх алхмаа хэр тогтвортой хийдэг вэ?";
  assert.throws(() => buildTailoredQuestionSet(namedRank), /forbidden_topic/);

  const obfuscatedBrand = validSections();
  obfuscatedBrand[0].scales[0].prompt = "in-Cruises компанийн ажлаа хэр тогтвортой хийдэг вэ?";
  assert.throws(() => buildTailoredQuestionSet(obfuscatedBrand), /forbidden_topic/);

  const healthProbe = validSections();
  healthProbe[0].reflections[0].prompt = "Эрүүл мэндийн асуудлаа дэлгэрэнгүй тайлбарлаж бичнэ үү.";
  assert.throws(() => buildTailoredQuestionSet(healthProbe), /forbidden_topic/);
});

test("AI assessment persistence is leased, service-only and has deterministic fallback", async () => {
  const [ai, generation, server, migration] = await Promise.all([
    readFile(new URL("../lib/ai/assessment.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/assessment/generation.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/assessment/server.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260906101838_ai_tailored_assessment_v2.sql", import.meta.url), "utf8"),
  ]);

  assert.match(ai, /Promise\.all\(pairs\.map/);
  assert.match(ai, /zeroDataRetention:\s*true/);
  assert.match(ai, /system: ASSESSMENT_SYSTEM_PROMPT/);
  assert.match(ai, /replaceAll\("<", "\\\\u003c"\)/);
  assert.match(ai, /Output\.object/);
  assert.doesNotMatch(ai, /generateObject/);
  assert.match(generation, /claim_ai_tailored_generation/);
  assert.match(generation, /finalize_ai_tailored_question_snapshot/);
  assert.match(server, /snapshot_onboarding_tailored_questions/);
  assert.match(migration, /Exactly 100 tailored questions are required/);
  assert.match(migration, /Every dimension requires eight scales and two reflections/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
  assert.match(migration, /create or replace function private\.claim_ai_tailored_generation[\s\S]+?security definer/);
  assert.match(migration, /create or replace function private\.finalize_ai_tailored_question_snapshot[\s\S]+?security definer/);
  assert.match(migration, /create or replace function public\.claim_ai_tailored_generation[\s\S]+?security invoker/);
  assert.match(migration, /create or replace function public\.finalize_ai_tailored_question_snapshot[\s\S]+?security invoker/);
  assert.match(migration, /member_privacy_cancel_running_assessment_generations/);
  assert.match(migration, /insuccess-member-state:/);
  assert.match(migration, /question\."helpText" ~\*/);
  assert.equal(migration.includes("board[[:space:]_-]+director"), true);
  assert.match(migration, /revoke all on table private\.assessment_generation_runs[\s\S]+service_role/);
  assert.match(migration, /grant execute[\s\S]+to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]+to authenticated/);
});
