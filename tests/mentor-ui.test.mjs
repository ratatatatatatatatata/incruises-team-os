import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { createMentorAction } from "../lib/success-map/mentor.ts";
import { createStarterPlan } from "../lib/success-map/planner.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const appPath = new URL("../app/team-os-app.tsx", import.meta.url);
const appSource = readFileSync(appPath, "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function loadComponentModule(react = React, globals = {}) {
  function compile(path, extra = "") {
    const source = readFileSync(path, "utf8") + extra;
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      fileName: fileURLToPath(path),
    }).outputText;
    const compiledModule = { exports: {} };
    const localRequire = (name) => {
      if (name === "react") return react;
      if (name === "./brand") return compile(new URL("../app/brand.ts", import.meta.url));
      if (name === "./team-os-data") return compile(new URL("../app/team-os-data.ts", import.meta.url));
      if (name === "./admin-invitations") return { AdminInvitations: () => null };
      if (name === "@/lib/success-map/presentation") return compile(new URL("../lib/success-map/presentation.ts", import.meta.url));
      return require(name);
    };
    vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: localRequire, Date, console, ...globals });
    return compiledModule.exports;
  }
  return compile(appPath, "\nexport { MemberActionCard, SuccessMapPanel, LessonDialog, SupportMemberCard, MemberPracticeCard, WeeklyCheckinPanel };");
}

const { MemberActionCard, SuccessMapPanel, LessonDialog, SupportMemberCard, MemberPracticeCard } = loadComponentModule();
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const answers = {
  currentContext: "Ажил, гэр бүлийн ажлаа зэрэг амжуулдаг.",
  goal30Day: "Facebook дээр хэрэгтэй пост бичиж сурах.",
  weeklyCapacity: "15 минут",
  primaryBlocker: "Яаж эхлэхээ тодруулах хэрэгтэй.",
  growthPreferences: "Богино контент бэлдэх дадлага хэрэгтэй.",
};
const plan = createStarterPlan(answers, []);
const checkin = { progressSummary: "Нэг ноорог бичсэн.", blocker: "", helpRequest: "", nextFocus: "Хувийн ажлынхаа цагийг цэгцлэх", progressPercent: 50, needsHelp: false };
const suggestion = createMentorAction(answers, plan, checkin);
assert.ok(suggestion);
const action = { ...suggestion, id: "action-fixture", status: "proposed", sourceCheckinId: 123, plannedFor: null, resourceLessonId: null };
const cardProps = { activeAction: action, fallbackAction: plan.todayAction, goal30Day: answers.goal30Day, currentSupportRequest: null, resourceTitle: null, resourceReason: null, first30DayEnabled: true, mentorLoopEnabled: true, saving: false, onAction: async () => true };

function visibleText(value) {
  return value.replace(/<[^>]*>/gu, " ").replace(/&quot;/gu, '"').replace(/&#x27;|&#39;/gu, "'").replace(/&amp;/gu, "&").replace(/\s+/gu, " ").trim();
}

function sameMeaning(value) {
  return visibleText(value).toLocaleLowerCase("mn-MN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

test("mentor action renders its check-in reason separately and starts with the first real step", () => {
  for (const change of [checkin, { ...checkin, needsHelp: true, blocker: "Цаг хүрэхгүй байна" }, { ...checkin, progressPercent: 100 }]) {
    const next = createMentorAction(answers, plan, change);
    const html = render(MemberActionCard, { ...cardProps, activeAction: { ...action, ...next } });
    const reason = html.match(/class="action-reason"[\s\S]*?<p>([\s\S]*?)<\/p>/u)?.[1];
    const firstStep = html.match(/class="action-step-list"[\s\S]*?<li>([\s\S]*?)<\/li>/u)?.[1];
    const simpleStep = html.match(/<summary>Илүү энгийнээр<\/summary>[\s\S]*?<strong>([\s\S]*?)<\/strong>/u)?.[1];
    assert.ok(reason && firstStep && simpleStep);
    assert.equal(sameMeaning(reason), sameMeaning(next.why));
    assert.equal(sameMeaning(firstStep), sameMeaning(next.steps[0]));
    assert.equal(sameMeaning(simpleStep), sameMeaning(next.steps[0]));
    assert.notEqual(sameMeaning(firstStep), sameMeaning(next.why));
    assert.doesNotMatch(visibleText(reason), /Facebook|пост/u);
  }
});

test("legacy detail keeps its first step and malformed mentor detail is not presented as an instruction", () => {
  const legacy = render(MemberActionCard, { ...cardProps, activeAction: { ...action, sourceCheckinId: null, detail: "Нэг сэдэв сонго. Гурван өгүүлбэр бич." } });
  assert.match(legacy, /<li>Нэг сэдэв сонго\.<\/li>/u);
  const malformed = render(MemberActionCard, { ...cardProps, activeAction: { ...action, detail: "Сүүлийн явцад тулгуурласан шалтгаан." } });
  assert.match(malformed, /Ажлын алхам дутуу байна/u);
  assert.doesNotMatch(malformed, /<li>Сүүлийн явцад/u);
});

const oldLesson = { id: "old-lesson", levelId: "l1", title: "Хуучин зорилгын тусгай хичээл", minutes: 10 };
const oldReason = "Хуучин зорилгод зориулсан хичээлийн шалтгаан.";
const mapProps = {
  successMap: { answers, plan: { ...plan, academyRecommendation: { ...oldLesson, lessonId: oldLesson.id, reason: oldReason } }, planSource: "deterministic", supportSummaryConsent: false, updatedAt: "2026-09-24T00:00:00Z" },
  activeAction: action, actionHistory: [], supportRequests: [], academyPractices: [], lessons: [oldLesson], first30DayEnabled: true, mentorLoopEnabled: true, checkins: [], coachNotes: [], saving: false, onAction: async () => true,
};

test("an active canonical action without a lesson never inherits the old plan lesson", () => {
  const current = render(SuccessMapPanel, mapProps);
  assert.ok(!current.includes(oldLesson.title));
  assert.ok(!current.includes(oldReason));
  const legacyFallback = render(SuccessMapPanel, { ...mapProps, activeAction: null, first30DayEnabled: false });
  assert.ok(legacyFallback.includes(oldLesson.title));
  assert.ok(legacyFallback.includes(oldReason));
  const newLesson = { ...oldLesson, id: "new-lesson", title: "Одоогийн ажлын хичээл" };
  const selected = render(SuccessMapPanel, { ...mapProps, activeAction: { ...action, resourceLessonId: newLesson.id }, lessons: [oldLesson, newLesson] });
  assert.ok(selected.includes(newLesson.title));
  assert.ok(!selected.includes(oldLesson.title));
  assert.ok(!selected.includes(oldReason));
});

test("normal-member mobile navigation keeps all five items in the available width; extra roles get a scroll cue", () => {
  const member = render(loadComponentModule().TeamOsApp, { user: { name: "Тест", email: "fixture@example.test", role: "user" } });
  const memberNav = member.match(/<nav class="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];
  assert.ok(memberNav);
  assert.equal((memberNav.match(/<button/gu) ?? []).length, 5);
  assert.ok(memberNav.includes("Эх сурвалж"));
  assert.match(css, /\.mobile-nav-items\s*\{[^}]*width:\s*100%;[^}]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/u);
  const admin = render(loadComponentModule().TeamOsApp, { user: { name: "Тест", email: "fixture@example.test", role: "admin" } });
  assert.match(admin, /mobile-nav mobile-nav-scrollable/u);
  assert.match(admin, /Бусад цэсийг хажуу тийш гүйлгэж харна уу/u);
  assert.match(css, /\.mobile-nav-scrollable \.mobile-nav-items\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*thin/u);
});

const lesson = { id: "lesson-fixture", title: "Туршилтын хичээл", type: "Хичээл", minutes: 5, content: "Нэг өгүүлбэр.", isPublished: true };
const lessonProps = { lesson, done: false, isAdmin: false, saving: false, onClose: () => {}, onToggle: async () => true, onSave: async () => true };

test("lesson uses a native modal with initial focus, Escape callback and focus restoration", () => {
  const markup = render(LessonDialog, lessonProps);
  assert.match(markup, /^<dialog[^>]*aria-modal="true"[^>]*aria-labelledby="lesson-dialog-title"/u);
  assert.match(markup, /<h2 tabindex="-1" id="lesson-dialog-title"/u);
  assert.match(css, /dialog\.dialog-backdrop:not\(\[open\]\)\s*\{\s*display:\s*none/u);

  const events = [];
  class FakeElement {
    isConnected = true;
    focus() { events.push("restore"); }
  }
  const previousFocus = new FakeElement();
  const dialog = { open: false, showModal() { this.open = true; events.push("showModal"); }, close() { this.open = false; events.push("close"); } };
  const title = { focus() { events.push("titleFocus"); } };
  const refs = [dialog, title];
  const effects = [];
  const fakeReact = { ...React, useState: (value) => [value, () => {}], useRef: () => ({ current: refs.shift() }), useEffect: (effect) => { effects.push(effect); } };
  const isolated = loadComponentModule(fakeReact, { document: { activeElement: previousFocus }, HTMLElement: FakeElement });
  let closed = false;
  const tree = isolated.LessonDialog({ ...lessonProps, onClose: () => { closed = true; } });
  const cleanup = effects[0]();
  assert.deepEqual(events, ["showModal", "titleFocus"]);
  let prevented = false;
  tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(closed, true);
  cleanup();
  assert.deepEqual(events, ["showModal", "titleFocus", "close", "restore"]);
  // showModal provides the browser's modal focus containment/Tab cycle, not a role-only overlay.
  assert.ok(dialog.open === false);
});

test("supporter and practice disclosures name the four answers shared as written", () => {
  const member = { id: "member-fixture", displayName: "Тест", teamName: "Тест баг", role: "user", sponsorName: "Тест хүн", coachName: null, onboardingRequired: false, summary: null, latestCheckin: null };
  const supporter = render(SupportMemberCard, { member, notes: [], requests: [], practices: [], saving: false, onAction: async () => true });
  const practice = { id: "practice-fixture", status: "assigned", prompt: "Нэг асуулт бичээрэй.", submission: "" };
  for (const html of [supporter, render(MemberPracticeCard, { practice, supportSummaryConsent: true, saving: false, onAction: async () => true }), render(MemberPracticeCard, { practice, supportSummaryConsent: false, saving: false, onAction: async () => true })]) {
    const text = visibleText(html);
    assert.match(text, /зорилго, боломжит цаг, гол саад, хүссэн тусламжийн 4 хариултыг бичсэнээр нь/u);
    assert.match(text, /Одоогийн нөхцөлийн хариулт болон хувийн хиймэл оюуны ярианы түүхийг хуваалцахгүй/u);
    assert.doesNotMatch(text, /товч мэдээлэл/u);
  }
  assert.doesNotMatch(appSource, /Товч мэдээллээ хуваалцах/u);
});

test("weekly help records a need but never implies routing or notifications, with either consent choice", () => {
  for (const supportSummaryConsent of [true, false]) {
    for (const needsHelp of [true, false]) {
      const fakeReact = { ...React, useState: (value) => [{ ...value, needsHelp }, () => {}] };
      const { WeeklyCheckinPanel } = loadComponentModule(fakeReact);
      const html = render(WeeklyCheckinPanel, { checkins: [], canProposeNext: true, supportSummaryConsent, saving: false, onAction: async () => true });
      const text = visibleText(html);
      assert.match(text, /Тусламж хэрэгтэй байгаагаа тэмдэглэе/u);
      assert.match(text, /тусламж хэрэгтэй байгааг л хадгална/u);
      assert.match(text, /Хуваалцах зөвшөөрөлтэй байсан ч тусламжийн хүсэлт үүсгэхгүй, хүнд мэдэгдэл илгээхгүй/u);
      assert.match(text, /Хүсэлт илгээх бол одоогийн ажлын “Хүнээс тусламж авъя” товчийг ашиглаарай/u);
      if (!supportSummaryConsent && needsHelp) assert.match(text, /Зөвшөөрлийг асаах нь өөрөө тусламжийн хүсэлт илгээхгүй/u);
    }
  }
});
