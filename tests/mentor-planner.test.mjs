import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createStarterPlan, actionConflictsWithAnswers, adviceNeedsSafetyFallback } from "../lib/success-map/planner.ts";
import { answerNeedsClarification, CLARIFICATION_GUIDANCE, firstAnswerNeedingClarification } from "../lib/success-map/clarification.ts";
import { plainMongolianText } from "../lib/success-map/presentation.ts";

const answers = {
  currentContext: "Гэр бүлийн болон өөрийн өдөр тутмын ажлаа амжуулж байна.",
  goal30Day: "Өдрийн ажлаа төлөвлөж, өөрийгөө удирдаж сурмаар байна.",
  weeklyCapacity: "Долоо хоногт нийт 15 минут гаргана.",
  primaryBlocker: "Одоогоор саад байхгүй, нэг жижиг ажлаас эхэлмээр байна.",
  growthPreferences: "Нэг удаад нэг жижиг ажил, энгийн жишээ хүсэж байна.",
};

test("an unknown goal can become an explicit goal-discovery choice", () => {
  assert.equal(firstAnswerNeedingClarification({ ...answers, goal30Day: "Мэдэхгүй байна" }), "goal30Day");
  const choice = CLARIFICATION_GUIDANCE.goal30Day.choices.find((value) => value.includes("зорилгоо мэдэхгүй"));
  assert.ok(choice);
  assert.equal(answerNeedsClarification("goal30Day", choice), false);
  const plan = createStarterPlan({ ...answers, goal30Day: choice }, []);
  assert.match(plan.todayAction.title, /Хүссэн өөрчлөлтөө/);
  assert.match(plan.todayAction.doneWhen, /өөрийн хийх нэг алхам/);
  assert.equal(plan.contentPlan, null);
});

test("no blocker is a valid choice, not an invented problem", () => {
  const choice = CLARIFICATION_GUIDANCE.primaryBlocker.choices.find((value) => value.includes("саад байхгүй"));
  assert.ok(choice);
  assert.equal(answerNeedsClarification("primaryBlocker", choice), false);
  assert.equal(firstAnswerNeedingClarification(answers), null);
});

test("self-management stays personal rather than becoming team leadership", () => {
  const plan = createStarterPlan(answers, []);
  assert.match(plan.todayAction.title, /Өдрийн нэг чухал ажлаа/);
  assert.match(plan.todayAction.detail, /Цаас эсвэл утасны тэмдэглэл/);
  assert.doesNotMatch(plan.todayAction.detail, /багийн|борлуул|элсүүл/i);
  assert.doesNotMatch(plan.managementPlan.focus.join(" "), /эзэн|багийн/);
  assert.equal(plan.contentPlan, null);
});

test("an older retired member receives the same respectful small-action guidance", () => {
  const plan = createStarterPlan({
    ...answers,
    currentContext: "Би тэтгэвэрт гарсан, 68 настай. Утасны апп сайн хэрэглэж мэдэхгүй.",
    goal30Day: "Өдрийн ажлаа төлөвлөж, нэг жижиг дадалтай болмоор байна.",
    weeklyCapacity: "5 минут",
    growthPreferences: "Цаасан дээр тэмдэглэж болно. Бизнес, контент хийхгүй.",
  }, []);
  assert.equal(plan.todayAction.minutes, 5);
  assert.match(plan.todayAction.detail, /Цаас/);
  assert.doesNotMatch(JSON.stringify(plan), /нас өндөр|чадахгүй хүн|залхуу|бага хүүхэд/);
  assert.equal(plan.contentPlan, null);
});

test("entrepreneurship is a small opted-in experiment without income promises", () => {
  const plan = createStarterPlan({ ...answers, goal30Day: "Өөрийн жижиг бизнесийн санааг туршиж үзмээр байна." }, []);
  assert.match(plan.todayAction.title, /Нэг асуудал/);
  assert.match(plan.todayAction.detail, /мөнгө зарцуулахгүйгээр/);
  assert.match(plan.weeklyActions[1].detail, /Борлуулах эсвэл элсүүлэхийг ятгалгүй/);
  assert.equal(plan.contentPlan, null);
  assert.equal(adviceNeedsSafetyFallback(JSON.stringify(plan)), false);
});

test("business exclusion in any answer prevents business and sales tracks", () => {
  const plan = createStarterPlan({
    ...answers,
    currentContext: "Бизнес хийхгүй. Өөрийн амьдралд хэрэгтэй шинэ зүйл сурмаар байна.",
    goal30Day: "Өдрийн ажлаа төлөвлөх, бизнесийн тухай асуултаа дараа үлдээх.",
    growthPreferences: "Борлуулалт, контент хэрэггүй. Нэг жижиг ажил хүсэж байна.",
  }, []);
  assert.match(plan.todayAction.title, /Өдрийн нэг чухал/);
  assert.equal(plan.contentPlan, null);
  assert.equal(actionConflictsWithAnswers({ ...answers, currentContext: "business hiihgui" }, "Бизнесийн санааг турших"), true);
  assert.equal(actionConflictsWithAnswers({ ...answers, currentContext: "business hiihgui" }, "Бизнес хийхгүй. Одоо бизнесийн санаа сонго."), true);

  const declinedContent = createStarterPlan({ ...answers, currentContext: "Контент хийхгүй, хувийн ажлаа зохицуулна.", goal30Day: "Өдөр тутмын контент төлөвлөлтөө бодож байгаа." }, []);
  assert.equal(declinedContent.contentPlan, null);
  assert.doesNotMatch(declinedContent.todayAction.title, /контент|пост|видео/);
  const listedExclusions = { ...answers, growthPreferences: "Бизнес, борлуулалт, контент хийхгүй. Өөрийгөө удирдах жижиг ажил хэрэгтэй." };
  assert.equal(actionConflictsWithAnswers(listedExclusions, "Бизнесийн санаагаа шалгах"), true);
  assert.equal(actionConflictsWithAnswers(listedExclusions, "Нэг постын контент бэлдэх"), true);
  const sameSentence = createStarterPlan({ ...answers, goal30Day: "Бизнес хийхгүй, өөрийгөө удирдаж сурмаар байна." }, []);
  assert.match(sameSentence.todayAction.title, /Өдрийн нэг чухал/);
  assert.equal(actionConflictsWithAnswers({ ...answers, growthPreferences: "Эргэж холбогдох хэрэггүй." }, "Нэг хүнтэй эргэж холбогдох"), true);
});

test("Mongolian desire-negation and long refusals block business or content", () => {
  for (const refusal of [
    "Бизнес хиймээргүй.",
    "Бизнес эхлүүлэхэд одоохондоо цаг гаргах сонирхолгүй.",
    "Бизнес хийхийг одоогоор огт хүсэхгүй байна.",
    "Biznes hiimeergui.",
  ]) {
    const declined = { ...answers, goal30Day: "Бизнесийн санаагаа туршиж үзмээр байна.", growthPreferences: refusal };
    const plan = createStarterPlan(declined, []);
    assert.doesNotMatch(plan.profileSummary, /бизнесийн санаагаа/iu, refusal);
    assert.equal(actionConflictsWithAnswers(declined, "Бизнесийн санаагаа шалгах"), true, refusal);
  }
  for (const refusal of ["Контент хиймээргүй.", "Контент бэлдэхэд одоохондоо цаг гаргах сонирхолгүй.", "Kontent hiimeergui."]) {
    const declined = { ...answers, goal30Day: "Facebook дээр нэг пост бичиж сурмаар байна.", growthPreferences: refusal };
    const plan = createStarterPlan(declined, []);
    assert.equal(plan.contentPlan, null, refusal);
    assert.doesNotMatch(plan.todayAction.title, /контент|пост|видео/iu, refusal);
    assert.equal(actionConflictsWithAnswers(declined, "Нэг контент бэлдэх"), true, refusal);
  }
  const afterRefusal = createStarterPlan({ ...answers, goal30Day: "Бизнес хиймээргүй, өөрийгөө удирдаж сурмаар байна." }, []);
  assert.match(afterRefusal.todayAction.title, /Өдрийн нэг чухал/);
});

test("business uncertainty or a blocker mention cannot become entrepreneurship opt-in", () => {
  const generic = { ...answers, goal30Day: "Өөрт хэрэгтэй нэг жижиг өөрчлөлт хийж үзмээр байна." };
  for (const primaryBlocker of [
    "Бизнес хийх шаардлагатай эсэхээ мэдэхгүй байна.",
    "Хүмүүс бизнес эхлүүлэхийг зөвлөдөг, би юу хийхээ шийдээгүй байна.",
    "Бизнес эхлүүлэхэд цаг гаргахад хэцүү байна.",
  ]) {
    const plan = createStarterPlan({ ...generic, primaryBlocker }, []);
    assert.doesNotMatch(plan.profileSummary, /бизнесийн санаагаа/iu, primaryBlocker);
    assert.doesNotMatch(plan.todayAction.title, /Нэг асуудал/iu, primaryBlocker);
  }
  for (const uncertain of ["Бизнес хийх шаардлагатай эсэхээ мэдэхгүй байна.", "Бизнес эхлэх хэрэгтэй юу?", "Бизнесийн тухай бодож байна."]) {
    const uncertainAnswers = { ...generic, growthPreferences: uncertain };
    assert.doesNotMatch(createStarterPlan(uncertainAnswers, []).profileSummary, /бизнесийн санаагаа/iu, uncertain);
    assert.equal(actionConflictsWithAnswers(uncertainAnswers, "Бизнесийн санаа сонгох"), true, uncertain);
  }
  const optedIn = createStarterPlan({ ...generic, growthPreferences: "Бизнесийн жижиг санаа туршиж үзэхэд тусламж хүсэж байна." }, []);
  assert.match(optedIn.profileSummary, /бизнесийн санаагаа/iu);
});

test("Academy recommendations never exceed the declared weekly time", () => {
  const fiveMinutes = { ...answers, weeklyCapacity: "Долоо хоногт нийт 5 минут" };
  const longLesson = { id: "long", levelId: "l1", title: "Өөрийгөө удирдах, өдөр тутмын дадал", minutes: 40 };
  const shortLesson = { id: "short", levelId: "l1", title: "Нэг жижиг дадал", minutes: 5 };
  assert.equal(createStarterPlan(fiveMinutes, [longLesson]).academyRecommendation, null);
  const recommendation = createStarterPlan(fiveMinutes, [longLesson, shortLesson]).academyRecommendation;
  assert.equal(recommendation?.lessonId, "short");
  assert.equal(recommendation?.minutes, 5);
  assert.match(recommendation?.reason ?? "", /Үлдсэн цагтаа багтахгүй бол дараагийн долоо хоногт/);
  assert.equal(createStarterPlan(fiveMinutes, [{ ...shortLesson, minutes: 6 }]).academyRecommendation, null);
});

test("Latin Mongolian personal organization and vision intents have clear Cyrillic actions", () => {
  const personal = createStarterPlan({ ...answers, goal30Day: "Ooriigoo udirdah, udroo tuluvluh dadal surmaar baina." }, []);
  assert.match(personal.todayAction.title, /Өдрийн нэг чухал/);
  const vision = createStarterPlan({ ...answers, goal30Day: "Muruudluu todorhoi bolgoj zorilgoo todorhoiloh huseltei." }, []);
  assert.match(vision.todayAction.title, /Хүссэн өөрчлөлтөө/);
  const business = createStarterPlan({ ...answers, goal30Day: "Biznes hiihgui. Ooriigoo udirdah husej baina." }, []);
  assert.match(business.todayAction.title, /Өдрийн нэг чухал/);
});

test("five-minute weekly capacity does not imply three priorities or extra daily time", () => {
  const plan = createStarterPlan({ ...answers, weeklyCapacity: "5" }, []);
  assert.equal(plan.todayAction.minutes, 5);
  assert.match(plan.whyThisPlan, /бүгдийг энэ долоо хоногт хийх албагүй/);
  assert.match(plan.managementPlan.cadence.join(" "), /Цаг дууссан бол дараагийн долоо хоногт/);
  assert.doesNotMatch(JSON.stringify(plan), /хамгийн чухал 3 ажил|дараагийн 3 ажил|15 минутын.*уулзалт/);
  for (const action of plan.weeklyActions) assert.match(action.detail, /үлдсэн цагтаа багтахгүй бол дараагийн долоо хоногт/);
  const team = createStarterPlan({ ...answers, goal30Day: "Багийн гишүүдээ дэмжиж, багаа удирдаж сурмаар байна.", weeklyCapacity: "5 минут" }, []);
  assert.equal(team.todayAction.minutes, 5);
  assert.doesNotMatch(JSON.stringify(team), /15 минутын|20 минутын/);
});

test("manifestation stays desired future plus action, never a magical guarantee", () => {
  const plan = createStarterPlan({ ...answers, goal30Day: "Manifest хийж мөрөөдлөө тодорхой болгохыг хүсэж байна." }, []);
  assert.match(plan.todayAction.title, /Хүссэн өөрчлөлтөө/);
  assert.match(plan.todayAction.detail, /өөрөө хийж чадах эхний нэг алхмаа/);
  assert.equal(adviceNeedsSafetyFallback(JSON.stringify(plan)), false);
  for (const unsafe of ["Төсөөлөхөд л хүсэл биелнэ.", "Орчлон танд мөнгө өгнө.", "Орлого баталгаатай.", "Апп өдөр бүр сануулна.", "Систем танд мэдэгдэл илгээнэ."]) {
    assert.equal(adviceNeedsSafetyFallback(unsafe), true, unsafe);
  }
  assert.equal(adviceNeedsSafetyFallback("30 минутад багтаан хийнэ.", 5), true);
  assert.equal(adviceNeedsSafetyFallback("0.5 цаг зарцуулна.", 5), true);
  assert.equal(adviceNeedsSafetyFallback("5 минутад нэг өгүүлбэр бич.", 5), false);
});

test("plain language preserves brand names while explaining generic terms", () => {
  assert.equal(plainMongolianText("inSuccess inCruises Academy Facebook Instagram"), "inSuccess inCruises Academy Facebook Instagram");
  const visible = plainMongolianText("Personal management · dream · goal · mentor · secretary · Sponsor/coach · action history");
  assert.doesNotMatch(visible, /personal|dream|goal|mentor|secretary|sponsor|coach|action history/i);
  assert.match(visible, /өөрийн ажлаа зохицуулах/);
});

test("onboarding is honest about privacy, AI scope, and notification capability", async () => {
  const form = await readFile(new URL("../app/onboarding/onboarding-form.tsx", import.meta.url), "utf8");
  const ai = await readFile(new URL("../lib/success-map/ai.ts", import.meta.url), "utf8");
  assert.equal((form.match(/title: "[1-5]\./g) ?? []).length, 5);
  assert.doesNotMatch(form, /2 МИНУТ|STARTER SUCCESS MAP|purpose-limited|Sponsor\/coach|Таны бүрэн хариулт зөвхөн танд харагдана/);
  assert.match(form, /Доор зөвшөөрсөн үед/);
  assert.match(form, /зорилго, боломжит цаг, саад, хүссэн тусламжийн 4 хариулт бичсэнээрээ харагдана/);
  assert.match(form, /Эдгээрийг автоматаар хураангуйлахгүй/);
  assert.match(form, /2–5 дахь асуултын хариулт/);
  assert.match(form, /таны бичсэнээр нь харуулна; автоматаар товчлохгүй/);
  assert.match(form, /1 дэх асуултын одоогийн нөхцөл болон хиймэл оюунтай хийсэн бүтэн яриаг хуваалцахгүй/);
  assert.match(form, /Өөрөө илгээсэн тусламжийн хүсэлт/);
  assert.match(form, /Энэ зөвшөөрөл нь цаашдын явц, ярианы түүхийг хамрахгүй/);
  assert.match(form, /өөрөө хариултдаа бичсэн хувийн мэдээлэл дамжиж болзошгүй/);
  assert.equal(CLARIFICATION_GUIDANCE.growthPreferences.choices.some((choice) => /Сануулах мэдэгдэл/.test(choice)), false);
  assert.match(ai, /adviceNeedsSafetyFallback\(JSON.stringify\(result.output\), basePlan.todayAction.minutes\)/);
  assert.match(ai, /actionConflictsWithAnswers\(answers, JSON.stringify\(result.output\)\)/);
  assert.match(ai, /энэ долоо хоногт заавал хийх 3 ажил биш/);
  assert.match(ai, /Бодол дангаараа үр дүн авчирна/);
});
