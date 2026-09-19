"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeAuthErrorLog } from "@/app/auth/auth-errors.mjs";
import { authMessageRedirectPath } from "@/app/auth/message-redirect.mjs";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function loginRedirect(kind: "error" | "message", message: string): never {
  redirect(authMessageRedirectPath("/login", kind, message));
}

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) loginRedirect("error", "Supabase project тохируулаагүй байна.");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) loginRedirect("error", "Имэйл болон нууц үгээ оруулна уу.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn("Auth provider rejected operation", safeAuthErrorLog("password_login", error));
    loginRedirect("error", "Нэвтрэх мэдээлэл буруу эсвэл бүртгэл баталгаажаагүй байна.");
  }

  revalidatePath("/", "layout");
  redirect("/");
}
