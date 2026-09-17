import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isEightDigitPin, PIN_LENGTH } from "../app/auth/pin-policy.mjs";
import { passwordRecoveryOrigin, passwordRecoveryRedirectUrl } from "../app/auth/recovery-url.mjs";

test("new PIN policy accepts exactly eight ASCII digits", () => {
  assert.equal(PIN_LENGTH, 8);
  assert.equal(isEightDigitPin("48273195"), true);
  assert.equal(isEightDigitPin("00000000"), true);
  assert.equal(isEightDigitPin("4827319"), false);
  assert.equal(isEightDigitPin("482731950"), false);
  assert.equal(isEightDigitPin("4827a195"), false);
  assert.equal(isEightDigitPin(" 48273195"), false);
  assert.equal(isEightDigitPin("４８２７３１９５"), false);
});

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
  const [login, loginCredential, forgotAction, confirmRoute, setPassword, setPasswordPage] = await Promise.all([
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/login-credential-field.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/forgot-password/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/confirm/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(login, /href="\/auth\/forgot-password"/);
  assert.match(loginCredential, /inputMode="numeric"/);
  assert.match(loginCredential, /pattern="\[0-9\]\{8\}"/);
  assert.match(loginCredential, /Хуучин нууц үгээр нэвтрэх/);
  assert.match(forgotAction, /resetPasswordForEmail/);
  assert.match(forgotAction, /Хэрэв энэ имэйлд бүртгэл байгаа бол/);
  assert.doesNotMatch(forgotAction, /error\.message|console\.(log|error|warn)\(.*email/);
  assert.match(confirmRoute, /exchangeCodeForSession/);
  assert.match(confirmRoute, /verifyOtp/);
  assert.match(confirmRoute, /type === "recovery"/);
  assert.match(setPassword, /updateUser\(\{ password \}\)/);
  assert.match(setPassword, /is_anonymous/);
  assert.match(setPassword, /isEightDigitPin\(password\)/);
  assert.match(setPasswordPage, /inputMode="numeric"/);
  assert.match(setPasswordPage, /pattern="\[0-9\]\{8\}"/);
  assert.match(setPasswordPage, /minLength=\{8\}/);
  assert.match(setPasswordPage, /maxLength=\{8\}/);
});
