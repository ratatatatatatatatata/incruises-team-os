"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { passwordRecoveryRedirectUrl } from "../recovery-url.mjs";

function forgotPasswordRedirect(kind: "error" | "message", message: string): never {
  redirect(`/auth/forgot-password?${kind}=${encodeURIComponent(message)}`);
}

export async function requestPasswordReset(formData: FormData) {
  if (!isSupabaseConfigured()) {
    forgotPasswordRedirect("error", "Нууц үг сэргээх үйлчилгээ одоогоор тохируулагдаагүй байна.");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) {
    forgotPasswordRedirect("error", "Зөв имэйл хаяг оруулна уу.");
  }

  const redirectTo = passwordRecoveryRedirectUrl();
  if (!redirectTo) {
    forgotPasswordRedirect("error", "Нууц үг сэргээх буцах хаяг тохируулагдаагүй байна.");
  }

  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      console.warn("Password recovery provider rejected a request", {
        code: error.code ?? "unknown",
        status: error.status ?? 500,
      });
    }
  } catch {
    console.warn("Password recovery provider request failed before a response");
  }

  forgotPasswordRedirect(
    "message",
    "Хүсэлтийг хүлээн авлаа. Хэрэв энэ имэйлд бүртгэл байгаа бол холбоос очно. Inbox болон spam хавтсаа шалгана уу.",
  );
}
