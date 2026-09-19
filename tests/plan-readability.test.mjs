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

test("real Academy catalog matches the selected focus and respects a declined lesson", () => {
  const catalog = [
    { id: "l0-1", levelId: "l0", title: "inCruises-ийн философи ба зорилго", minutes: 8 },
    { id: "l0-3", levelId: "l0", title: "Амлалт өгөхгүй зөв тайлбарлах", minutes: 12 },
    { id: "l1-4", levelId: "l1", title: "L1 teach-back", minutes: 10 },
    { id: "l2-1", levelId: "l2", title: "Discovery асуултын бүтэц", minutes: 10 },
    { id: "l2-3", levelId: "l2", title: "Follow-up-ийн 3 алхам", minutes: 15 },
    { id: "l3-3", levelId: "l3", title: "Builder-ийн долоо хоногийн хэмнэл", minutes: 22 },
  ];

  const speakingPlan = createStarterPlan({
    currentContext: "Би шинээр эхэлж байгаа бөгөөд санаагаа бусдад ойлгомжтой хэлж сурахыг хүсэж байна.",
    goal30Day: "Хурлын үеэр хоёр минут тасралтгүй, ойлгомжтой ярьдаг болно.",
    weeklyCapacity: "15 минут",
    primaryBlocker: "Яриагаа яаж эхлэхээ мэдэхгүй, бүтэц дээр хамгийн их гацдаг.",
    growthPreferences: "Нэг удаад нэг богино ярих дасгал хиймээр байна.",
  }, catalog);
  assert.equal(speakingPlan.academyRecommendation?.lessonId, "l1-4");
  assert.notEqual(speakingPlan.academyRecommendation?.lessonId, "l0-1");

  const followUpPlan = createStarterPlan({
    ...baseAnswers,
    goal30Day: "Хариу хүлээж буй хүмүүстэй дарамтгүй эргэж холбогддог болно.",
    primaryBlocker: "Өмнөх ярианаас хойш ямар мессеж бичихээ тодорхой мэдэхгүй байна.",
    growthPreferences: "Follow-up хийх нэг жижиг ажил, бодит мессежийн жишээ хэрэгтэй.",
  }, catalog);
  assert.equal(followUpPlan.academyRecommendation?.lessonId, "l2-3");

  const contentPlan = createStarterPlan(baseAnswers, catalog);
  assert.equal(contentPlan.academyRecommendation?.lessonId, "l0-3");

  const mixedPlanWithoutContentLesson = createStarterPlan(baseAnswers, [catalog.at(-1)]);
  assert.equal(mixedPlanWithoutContentLesson.academyRecommendation, null);

  const declinedLessonPlan = createStarterPlan({
    ...baseAnswers,
    growthPreferences: "Нэг удаад нэг жижиг контентын ажил өг. Academy сургалт хэрэггүй.",
  }, catalog);
  assert.equal(declinedLessonPlan.academyRecommendation, null);
});
