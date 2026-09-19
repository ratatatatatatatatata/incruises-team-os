const SAFE_AUTH_CODE = /^[a-z0-9_]{1,80}$/;
const SAFE_OPERATION = /^[a-z0-9_]{1,80}$/;

const SESSION_ERROR_CODES = new Set([
  "bad_jwt",
  "invalid_jwt",
  "jwt_expired",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
]);

function authErrorCode(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && SAFE_AUTH_CODE.test(code) ? code : "unknown";
}

function authErrorStatus(error) {
  const status = error && typeof error === "object" && "status" in error ? error.status : null;
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

/**
 * Return the only fields that may be written to server logs for an auth error.
 * In particular, provider messages, email addresses, and credentials are never
 * copied into the result.
 */
export function safeAuthErrorLog(operation, error) {
  return {
    operation: typeof operation === "string" && SAFE_OPERATION.test(operation) ? operation : "unknown_operation",
    code: authErrorCode(error),
    status: authErrorStatus(error),
  };
}

export function classifySetPasswordError(error) {
  const code = authErrorCode(error);
  const status = authErrorStatus(error);

  if (code === "same_password") {
    return {
      reason: "already_saved",
      message: "PIN код өмнө нь амжилттай хадгалагдсан байна.",
    };
  }

  if (code === "weak_password") {
    return {
      reason: "pin_policy_conflict",
      message:
        "PIN код хадгалагдсангүй. Аль ч 8 оронтой тоог зөвшөөрөх системийн тохиргоотой зөрчил илэрлээ. Дахин дахин оролдохгүйгээр админд мэдэгдэнэ үү.",
    };
  }

  if (SESSION_ERROR_CODES.has(code) || (code === "unknown" && status === 401)) {
    return {
      reason: "expired_session",
      message:
        "PIN код хадгалагдсангүй. Баталгаажуулах холбоосын хугацаа дууссан байна. Бүртгэлтэй имэйлээ оруулж шинэ холбоос авна уу.",
    };
  }

  return {
    reason: "provider_error",
    message: "PIN код хадгалагдсангүй. Түр алдаа гарлаа. Дахин оролдоод болохгүй бол шинэ сэргээх холбоос авна уу.",
  };
}
