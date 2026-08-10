"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function loginRedirect(kind: "error" | "message", message: string): never {
  redirect(`/login?${kind}=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData) {
  if (!isSupabaseConfigured()) loginRedirect("error", "Supabase project тохируулаагүй байна.");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) loginRedirect("error", "Имэйл болон нууц үгээ оруулна уу.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginRedirect("error", "Нэвтрэх мэдээлэл буруу эсвэл бүртгэл баталгаажаагүй байна.");

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  if (!isSupabaseConfigured()) loginRedirect("error", "Supabase project тохируулаагүй байна.");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 120);
  if (!email || password.length < 8) loginRedirect("error", "Имэйл болон 8-аас дээш тэмдэгттэй нууц үг оруулна уу.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || email } },
  });
  if (error) loginRedirect("error", "Бүртгэл үүсгэж чадсангүй. Имэйл болон тохиргоогоо шалгана уу.");

  loginRedirect("message", "Баталгаажуулах холбоосыг имэйлээр илгээлээ.");
}
