import assert from "node:assert/strict";
import test from "node:test";
import { actionSteps, plainMongolianText, readableAnswerExcerpt } from "../lib/success-map/presentation.ts";
import { createStarterPlan } from "../lib/success-map/planner.ts";

const baseAnswers = {
  currentContext: "Борлуулалтын ажлынхаа хажуугаар сошиал контент хийж эхэлж байна.",
  goal30Day: "7honogt neg reel togtmol hiideg boloh",
  weeklyCapacity: "30 минут",
  primaryBlocker: "Ямар асуултаар эхний reel-ээ хийхээ сайн тодорхойлоогүй байна.",
  growthPreferences: "Нэг удаад нэг жижиг reel-ийн ажил өгвөл хамгийн хэрэгтэй.",
};

test("screenshot-style content input becomes a plain, specific action", () => {
  const plan = createStarterPlan(baseAnswers, []);
  const visible = plainMongolianText(`${plan.todayAction.title} ${plan.todayAction.detail} ${plan.todayAction.doneWhen}`);

  assert.match(plan.todayAction.title, /reel/i);
  assert.match(plan.todayAction.detail, /5–7 өгүүлбэр/);
  assert.equal(actionSteps(plan.todayAction.detail).length, 3);
  assert.doesNotMatch(visible, /review|feedback|focus|check-in|discovery|claim/i);
  assert.doesNotMatch(visible, /7honogt|togtmol|hiideg/i);
});

test("known content format changes the deterministic action", () => {
  const reel = createStarterPlan(baseAnswers, []).todayAction.title;
  const post = createStarterPlan({
    ...baseAnswers,
    goal30Day: "Долоо хоног бүр нэг хэрэгтэй Facebook пост бичдэг болох.",
    growthPreferences: "Нэг удаад нэг жижиг постын ажил өгвөл хамгийн хэрэгтэй.",
  }, []).todayAction.title;

  assert.notEqual(reel, post);
  assert.match(post, /пост/);
});

test("member-facing legacy text is simplified without exposing unreadable latin answers", () => {
  assert.equal(plainMongolianText("Review-д өгөөд дараагийн check-in focus-оо сонго."), "хүнээр хянуулахад өгөөд дараагийн явцын тэмдэглэл гол ажлаа сонго.");
  assert.equal(readableAnswerExcerpt("7honogt neg reel togtmol hiideg boloh"), null);
  assert.match(readableAnswerExcerpt("7 хоногт нэг reel тогтмол хийдэг болох") ?? "", /7 хоногт/);
});

test("Academy lesson is optional and shown only with a relevant plain-language reason", () => {
  const unrelatedPlan = createStarterPlan(baseAnswers, [{
    id: "lesson-unrelated",
    levelId: "L4",
    title: "Санхүүгийн дотоод тайлангийн бүтэц",
    minutes: 40,
  }]);
  assert.equal(unrelatedPlan.academyRecommendation, null);

  const relevantPlan = createStarterPlan(baseAnswers, [{
    id: "lesson-relevant",
    levelId: "L1",
    title: "Санаагаа ойлгомжтой тайлбарлах яриа",
    minutes: 15,
  }]);
  assert.equal(relevantPlan.academyRecommendation?.lessonId, "lesson-relevant");
  assert.match(relevantPlan.academyRecommendation?.reason ?? "", /нэмэлт хичээл/);
  assert.doesNotMatch(relevantPlan.academyRecommendation?.reason ?? "", /review|feedback|focus|check-in/i);
});
