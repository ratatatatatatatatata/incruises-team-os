import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifySetPasswordError, safeAuthErrorLog } from "../app/auth/auth-errors.mjs";
import { authMessageRedirectPath } from "../app/auth/message-redirect.mjs";
import { isEightDigitPin, PIN_LENGTH } from "../app/auth/pin-policy.mjs";
import { passwordRecoveryOrigin, passwordRecoveryRedirectUrl } from "../app/auth/recovery-url.mjs";

test("new PIN policy accepts exactly eight ASCII digits", () => {
  assert.equal(PIN_LENGTH, 8);
  assert.equal(isEightDigitPin("48273195"), true);
  assert.equal(isEightDigitPin("00000000"), true);
  assert.equal(isEightDigitPin("11111111"), true);
  assert.equal(isEightDigitPin("12345678"), true);
  assert.equal(isEightDigitPin("4827319"), false);
  assert.equal(isEightDigitPin("482731950"), false);
  assert.equal(isEightDigitPin("4827a195"), false);
  assert.equal(isEightDigitPin(" 48273195"), false);
  assert.equal(isEightDigitPin("４８２７３１９５"), false);
});

test("auth message redirects percent-encode Mongolian text into an ASCII-safe Location value", () => {
  const message = "PIN код хадгалагдсангүй. Холбоосын хугацаа дууссан байна.";
  const redirectPath = authMessageRedirectPath("/auth/set-password?flow=recovery", "error", message);
  const parsed = new URL(redirectPath, "https://team.example");

  assert.equal(parsed.pathname, "/auth/set-password");
  assert.equal(parsed.searchParams.get("flow"), "recovery");
  assert.equal(parsed.searchParams.get("error"), message);
  assert.equal([...redirectPath].every((character) => character.charCodeAt(0) <= 0x7f), true);
  assert.throws(() => authMessageRedirectPath("https://evil.example/login", "error", message), /current origin/);
});

test("set-password auth errors distinguish an idempotent save, provider policy drift, and expired session", () => {
  const alreadySaved = classifySetPasswordError({ code: "same_password", status: 422 });
  assert.equal(alreadySaved.reason, "already_saved");

  const weakPin = classifySetPasswordError({ code: "weak_password", status: 422 });
  assert.equal(weakPin.reason, "pin_policy_conflict");
  assert.match(weakPin.message, /PIN код хадгалагдсангүй/);
  assert.match(weakPin.message, /Аль ч 8 оронтой тоог зөвшөөрөх/);
  assert.match(weakPin.message, /админд мэдэгдэнэ үү/);

  const pwnedPin = classifySetPasswordError({ code: "weak_password", status: 422, reasons: ["pwned"] });
  assert.equal(pwnedPin.reason, "pin_policy_conflict");

  const policyConflict = classifySetPasswordError({ code: "weak_password", status: 422, reasons: ["characters"] });
  assert.equal(policyConflict.reason, "pin_policy_conflict");
  assert.match(policyConflict.message, /админд мэдэгдэнэ үү/);

  const lengthConflict = classifySetPasswordError({ code: "weak_password", status: 422, reasons: ["length"] });
  assert.equal(lengthConflict.reason, "pin_policy_conflict");

  const expiredSession = classifySetPasswordError({ code: "session_not_found", status: 403 });
  assert.equal(expiredSession.reason, "expired_session");
  assert.match(expiredSession.message, /PIN код хадгалагдсангүй/);
  assert.match(expiredSession.message, /шинэ холбоос/);

  const explicitlyExpiredSession = classifySetPasswordError({ code: "session_expired", status: 403 });
  assert.equal(explicitlyExpiredSession.reason, "expired_session");

  const statusOnlySession = classifySetPasswordError({ status: 401 });
  assert.equal(statusOnlySession.reason, "expired_session");

  const providerFailure = classifySetPasswordError({ code: "unexpected_failure", status: 500 });
  assert.equal(providerFailure.reason, "provider_error");
  assert.match(providerFailure.message, /PIN код хадгалагдсангүй/);
});

test("auth log fields exclude provider messages, identity, and credentials", () => {
  const fields = safeAuthErrorLog("set_password", {
    code: "weak_password",
    status: 422,
    message: "email=user@example.com password=12345678",
    email: "user@example.com",
    password: "12345678",
  });

  assert.deepEqual(fields, { operation: "set_password", code: "weak_password", status: 422 });
  assert.deepEqual(Object.keys(fields), ["operation", "code", "status"]);
  assert.equal(JSON.stringify(fields).includes("user@example.com"), false);
  assert.equal(JSON.stringify(fields).includes("12345678"), false);
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
  const [login, loginCredential, forgotAction, confirmRoute, setPassword, setPasswordPage, setPasswordSubmit] = await Promise.all([
    readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login/login-credential-field.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/forgot-password/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/confirm/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/set-password/submit-button.tsx", import.meta.url), "utf8"),
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
  assert.match(setPassword, /failure\.reason === "already_saved"/);
  assert.match(setPassword, /safeAuthErrorLog\("set_password", error\)/);
  assert.match(setPassword, /authMessageRedirectPath\("\/auth\/forgot-password"/);
  assert.match(setPassword, /is_anonymous/);
  assert.match(setPassword, /isEightDigitPin\(password\)/);
  assert.match(setPasswordPage, /inputMode="numeric"/);
  assert.match(setPasswordPage, /pattern="\[0-9\]\{8\}"/);
  assert.match(setPasswordPage, /minLength=\{8\}/);
  assert.match(setPasswordPage, /maxLength=\{8\}/);
  assert.match(setPasswordPage, /Аль ч 8 оронтой тоог PIN болгож болно/);
  assert.doesNotMatch(setPasswordPage, /бүү ашигла/);
  assert.match(setPasswordPage, /action=\{setPassword\}/);
  assert.match(setPasswordSubmit, /useFormStatus/);
  assert.match(setPasswordSubmit, /disabled=\{pending\}/);
  assert.match(setPasswordSubmit, /Хадгалж байна…/);
});
