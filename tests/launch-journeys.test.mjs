import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loginPath } from "../app/auth/login-path.mjs";

test("preserves safe member and admin destinations through sign-in", () => {
  assert.equal(loginPath("/academy?level=one#lesson"), "/login?next=%2Facademy%3Flevel%3Done%23lesson");
  assert.equal(loginPath("/admin"), "/login?next=%2Fadmin");
  assert.equal(loginPath("//evil.example/path"), "/login");
  assert.equal(loginPath("/%5cevil.example/path"), "/login");
  assert.equal(loginPath("https://evil.example/path"), "/login");
});

test("keeps the consent, 15 plus 100, and ready-member journey fail-closed", async () => {
  const [
    memberAccess,
    home,
    onboardingPage,
    onboardingFlow,
    accessPending,
    guidePage,
    assistantPage,
    academyPage,
    academyLessonPage,
    workspacePage,
  ] = await Promise.all([
    readFile(new URL("../app/member-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/onboarding-flow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/access-pending/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/my-guide/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/assistant/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/academy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/academy/[lessonId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/page.tsx", import.meta.url), "utf8"),
  ]);

  const disabledGate = memberAccess.indexOf('user.access === "disabled"');
  const onboardingGate = memberAccess.indexOf('user.onboarding?.status !== "completed"');
  const activeGate = memberAccess.indexOf('user.access !== "active" || !user.role');
  assert.ok(disabledGate >= 0 && disabledGate < onboardingGate && onboardingGate < activeGate);
  assert.match(memberAccess, /redirect\(loginPath\(options\.returnTo\)\)/);
  assert.match(memberAccess, /requireAssessmentConsent/);

  assert.match(home, /requireReadyMember/);
  assert.match(home, /requireAssessmentConsent: true/);
  assert.match(guidePage, /returnTo: "\/my-guide"/);
  assert.match(guidePage, /requireAssessmentConsent: true/);
  assert.match(assistantPage, /returnTo/);
  assert.match(assistantPage, /requireAssessmentConsent: true/);
  assert.match(academyPage, /requireReadyMember/);
  assert.match(academyLessonPage, /requireReadyMember/);
  assert.match(workspacePage, /requireReadyMember/);

  assert.match(onboardingPage, /pauseHref="\/access-pending"/);
  assert.match(onboardingFlow, /BASELINE_TOTAL = 15/);
  assert.match(onboardingFlow, /TAILORED_TOTAL = 100/);
  assert.match(onboardingFlow, /accept_assessment/);
  assert.match(accessPending, /activeAssessmentPause/);
  assert.match(accessPending, /яг зогссон газраасаа үргэлжлүүлнэ үү/);
});

test("offers consistent member navigation and accessible fallback states", async () => {
  const [memberHome, sectionShell, academyShell, loading, error, notFound] = await Promise.all([
    readFile(new URL("../app/member-home.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/my-guide/section-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/academy/academy-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/not-found.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [memberHome, sectionShell, academyShell]) {
    assert.match(source, /href="\/my-guide"/);
    assert.match(source, /href="\/assistant"/);
    assert.match(source, /href="\/academy"/);
    assert.match(source, /href="\/workspace"/);
  }

  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /"use client"/);
  assert.match(error, /role="alert"/);
  assert.match(error, /onClick=\{reset\}/);
  assert.match(notFound, /id="not-found-title"/);
  assert.match(notFound, /href="\/academy"/);
});

test("ships an installable private PWA shell without caching member pages", async () => {
  const [manifest, register, serviceWorker] = await Promise.all([
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/pwa-register.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(manifest, /id: "\/"/);
  assert.match(manifest, /scope: "\/"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /orientation: "any"/);
  assert.match(manifest, /shortcuts:/);
  assert.match(manifest, /sizes: "any"/);
  assert.match(register, /beforeinstallprompt/);
  assert.match(register, /appinstalled/);
  assert.match(register, /updateViaCache: "none"/);
  assert.match(register, /Суулгах саналыг хаах/);
  assert.match(serviceWorker, /insuccess-shell-v4/);
  assert.match(serviceWorker, /STATIC_ASSETS\.includes\(url\.pathname\)/);
  assert.doesNotMatch(serviceWorker, /cache\.put|request\.mode\s*===\s*["']navigate["']/);
});

test("keeps member invitation and Academy management behind active admin checks", async () => {
  const [adminPage, memberApi, adminAcademyPage, adminAcademyApi, adminAcademyClient] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/members/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/academy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/academy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/academy/admin-academy-catalog.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(adminPage, /redirect\(loginPath\("\/admin"\)\)/);
  assert.match(adminPage, /user\.role !== "admin"/);
  assert.match(adminPage, /href="\/admin\/academy"/);
  assert.match(memberApi, /requireActiveAdmin/);
  assert.match(memberApi, /inviteUserByEmail/);
  assert.match(memberApi, /admin_register_invited_member/);
  assert.match(memberApi, /admin_update_team_member/);
  assert.match(memberApi, /await request\.text\(\)/);
  assert.match(memberApi, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength/);
  assert.match(memberApi, /Array\.isArray\(body\)/);
  assert.match(adminAcademyPage, /redirect\(loginPath\("\/admin\/academy"\)\)/);
  assert.match(adminAcademyPage, /user\.role !== "admin"/);
  assert.match(adminAcademyApi, /requireActiveAdmin/);
  assert.match(adminAcademyClient, /Mux playback ID/);
  assert.doesNotMatch(adminAcademyApi + adminAcademyClient, /directUpload|delete\(/i);
});
