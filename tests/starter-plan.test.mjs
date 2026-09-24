import assert from "node:assert/strict";
import test from "node:test";
import {
  actionConflictsWithAnswers,
  actionMinutes,
  createStarterPlan,
  normalizeStarterAnswers,
  normalizeMongolianIntent,
} from "../lib/success-map/planner.ts";

const speakingAnswers = {
  currentContext: "Би шинээр эхэлж байгаа бөгөөд өөртөө итгэлтэй ярьж сурахыг хүсэж байна.",
  goal30Day: "Илтгэх чадвараа сайжруулна, business хийхгүй.",
  weeklyCapacity: "7 хоногт 15 минут гаргана.",
  primaryBlocker: "Follow-up хэрэггүй, яг юунаас эхлэхээ мэдэхгүй байна.",
  growthPreferences: "Нэг жижиг ажил, Academy дадлага ба sponsor зөвлөгөө хүсэж байна.",
};

test("latin and Cyrillic negation stay exclusions", () => {
  assert.match(normalizeMongolianIntent("follow up hereggui, business hiihgui"), /follow-up хэрэггүй, бизнес хийхгүй/);
});

test("15 minute speaking goal produces one matching action and no content calendar", () => {
  const plan = createStarterPlan(speakingAnswers, []);
  const actionText = `${plan.todayAction.title} ${plan.todayAction.detail}`;

  assert.equal(plan.version, 3);
  assert.equal(plan.todayAction.minutes, 15);
  assert.match(actionText, /илтгэл|чангаар хэлэх/i);
  assert.match(plan.todayAction.doneWhen, /өгүүлбэр/);
  assert.equal(plan.contentPlan, null);
  assert.equal(actionConflictsWithAnswers(speakingAnswers, actionText), false);
  assert.doesNotMatch(plan.todayAction.title, /follow-up|бизнес|контент/i);
});

test("available time is capped and never inflated", () => {
  assert.equal(actionMinutes("15 минут"), 15);
  assert.equal(actionMinutes("10 min"), 10);
  assert.equal(actionMinutes("15 minut"), 15);
  assert.equal(actionMinutes("5"), 5);
  assert.equal(actionMinutes("0.25 цаг"), 15);
  assert.equal(actionMinutes("2 цаг"), 45);
});

test("bare numeric capacity is canonicalized before the current RPC length guard", () => {
  const normalized = normalizeStarterAnswers({ ...speakingAnswers, weeklyCapacity: "5" });
  assert.equal(normalized.weeklyCapacity, "5 минут");
  assert.ok(normalized.weeklyCapacity.length >= 3);
});

test("today action completion criterion matches the action and cadence adds no hidden minutes", () => {
  const plan = createStarterPlan({
    currentContext: "Би ажлынхаа хажуугаар долоо хоногт багахан цаг гаргаж чадна.",
    goal30Day: "Facebook дээр нэг хэрэгтэй постын ноорог бичиж сурна.",
    weeklyCapacity: "Долоо хоногт нийт 15 минут.",
    primaryBlocker: "Юу бичихээ эхлүүлж чаддаггүй, тодорхой жишээ хэрэгтэй байна.",
    growthPreferences: "Нэг жижиг контентын ажил, дараа нь feedback хэрэгтэй.",
  }, []);

  assert.match(plan.todayAction.doneWhen, /5–7 өгүүлбэр/);
  assert.doesNotMatch(plan.todayAction.doneWhen, /3 бодит асуулт/);
  assert.equal(plan.managementPlan.cadence.some((item) => /10 минут|20 минут/.test(item)), false);
});

test("explicit content intent is required before creating a content plan", () => {
  const noContent = createStarterPlan({
    ...speakingAnswers,
    goal30Day: "Контент хийхгүй, илтгэх чадвараа сайжруулна.",
  }, []);
  assert.equal(noContent.contentPlan, null);

  const content = createStarterPlan({
    ...speakingAnswers,
    goal30Day: "7 хоногт нэг хэрэгтэй Facebook постын ноорог бичиж сурна.",
    primaryBlocker: "Юу бичихээ эхлүүлж чаддаггүй, тодорхой жишээ хэрэгтэй байна.",
  }, []);
  assert.ok(content.contentPlan);
  assert.equal(content.contentPlan.sevenDayPlan.length, 7);
});

test("a declined content calendar cannot override an explicit speaking-practice request", () => {
  const plan = createStarterPlan({
    currentContext: "Бизнес хийхгүй. Зөвхөн ярих чадвараа хөгжүүлэхийг хүсэж байна.",
    goal30Day: "30 хоногийн дотор 2 минут тасралтгүй, ойлгомжтой ярьдаг болох.",
    weeklyCapacity: "Өдөр бүр 15 минут, оройн цагаар дасгал хийнэ.",
    primaryBlocker: "Яриагаа яаж эхлэхээ мэдэхгүй, бүтэц дээр гацдаг. Өмнө нь зөвхөн бичиж бэлдэж үзсэн.",
    growthPreferences: "Follow-up болон контентын календарь хэрэггүй. Зөвхөн 15 минутын ярих дасгал, эхлэх тодорхой алхам хэрэгтэй.",
  }, []);
  const actionText = `${plan.todayAction.title} ${plan.todayAction.detail}`;

  assert.equal(plan.todayAction.minutes, 15);
  assert.match(actionText, /илтгэл|чангаар хэлэх/i);
  assert.doesNotMatch(actionText, /контент|ноорог|follow-up/i);
  assert.equal(plan.contentPlan, null);
});
