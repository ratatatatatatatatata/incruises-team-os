"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function signupRedirect(kind: "error" | "message", message: string): never {
  redirect(`/signup?${kind}=${encodeURIComponent(message)}`);
}

export async function signup(formData: FormData) {
  if (!isSupabaseConfigured()) signupRedirect("error", "Supabase project тохируулаагүй байна.");

  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!displayName || !email) signupRedirect("error", "Нэр болон имэйлээ бүрэн оруулна уу.");
  if (password.length < 8) signupRedirect("error", "Нууц үг хамгийн багадаа 8 тэмдэгт байна.");
  if (password !== confirmPassword) signupRedirect("error", "Нууц үгийн давталт тохирохгүй байна.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName } },
  });

  if (error) signupRedirect("error", error.message.includes("already") ? "Энэ имэйл бүртгэлтэй байна." : "Бүртгэл үүсгэж чадсангүй. Дахин оролдоно уу.");
  if (data.session) redirect("/");
  redirect(`/login?message=${encodeURIComponent("Бүртгэл үүслээ. Имэйлээр ирсэн холбоосоор бүртгэлээ баталгаажуулна уу.")}`);
}
