"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classifySetPasswordError, safeAuthErrorLog } from "../auth-errors.mjs";
import { authMessageRedirectPath } from "../message-redirect.mjs";
import { isEightDigitPin } from "../pin-policy.mjs";

function setPasswordErrorRedirect(recoveryFlow: boolean, message: string): never {
  const path = recoveryFlow ? "/auth/set-password?flow=recovery" : "/auth/set-password";
  redirect(authMessageRedirectPath(path, "error", message));
}

export async function setPassword(formData: FormData) {
  const recoveryFlow = formData.get("flow") === "recovery";
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!isEightDigitPin(password)) {
    setPasswordErrorRedirect(recoveryFlow, "PIN код хадгалагдсангүй. PIN код яг 8 оронтой, зөвхөн тоо байна.");
  }
  if (password !== confirmation) {
    setPasswordErrorRedirect(recoveryFlow, "PIN код хадгалагдсангүй. PIN кодын давталт таарахгүй байна.");
  }

  const supabase = await createClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (!claims?.sub || isAnonymous) {
    console.warn(
      "Auth provider rejected operation",
      safeAuthErrorLog("set_password_session_validation", claimsError ?? { code: "session_not_found", status: 401 }),
    );
    const failure = classifySetPasswordError(claimsError ?? { code: "session_not_found", status: 401 });
    redirect(authMessageRedirectPath("/auth/forgot-password", "error", failure.message));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const failure = classifySetPasswordError(error);
    if (failure.reason === "already_saved") {
      console.info("Auth operation already completed", safeAuthErrorLog("set_password", error));
      redirect("/");
    }
    console.warn("Auth provider rejected operation", safeAuthErrorLog("set_password", error));
    if (failure.reason === "expired_session") {
      redirect(authMessageRedirectPath("/auth/forgot-password", "error", failure.message));
    }
    setPasswordErrorRedirect(recoveryFlow, failure.message);
  }
  redirect("/");
}
