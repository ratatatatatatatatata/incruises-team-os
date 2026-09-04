import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { passwordRecoveryOrigin, passwordRecoveryRedirectUrl } from "../app/auth/recovery-url.mjs";

test("password recovery accepts only operator-controlled callback origins", () => {
  assert.equal(passwordRecoveryOrigin({ PASSWORD_RESET_ORIGIN: "https://team.example", NODE_ENV: "production" }), "https://team.example");
  assert.equal(passwordRecoveryOrigin({ PASSWORD_RESET_ORIGIN: "http://evil.example", NODE_ENV: "production" }), null);
  assert.equal(passwordRecoveryOrigin({ PASSWORD_RESET_ORIGIN: "https://team.example/path", NODE_ENV: "production" }), null);
  assert.equal(
    passwordRecoveryOrigin({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "team.vercel.app", VERCEL_URL: "deployment.vercel.app", NODE_ENV: "production" }),
    "https://team.vercel.app",
  );
  assert.equal(
    passwordRecoveryRedirectUrl({ PASSWORD_RESET_ORIGIN: "https://team.example", NODE_ENV: "production" }),
    "https://team.example/auth/confirm?next=%2Fauth%2Fset-password%3Fflow%3Drecovery",
  );
});

test("login ships an account-enumeration-safe Supabase password recovery flow", async () => {
  const [login, forgotAction, confirmRoute, setPassword] = await Promise.all([
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/forgot-password/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/confirm/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/actions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(login, /href="\/auth\/forgot-password"/);
  assert.match(forgotAction, /resetPasswordForEmail/);
  assert.match(forgotAction, /Хэрэв энэ имэйлд бүртгэл байгаа бол/);
  assert.doesNotMatch(forgotAction, /error\.message|console\.(log|error|warn)\(.*email/);
  assert.match(confirmRoute, /exchangeCodeForSession/);
  assert.match(confirmRoute, /verifyOtp/);
  assert.match(confirmRoute, /type === "recovery"/);
  assert.match(setPassword, /updateUser\(\{ password \}\)/);
  assert.match(setPassword, /is_anonymous/);
});
