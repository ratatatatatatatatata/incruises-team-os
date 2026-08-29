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
