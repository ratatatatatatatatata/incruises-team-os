"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authMessagePath, safeNextPath } from "../auth/redirects.mjs";

const LOGIN_ORIGIN = "https://login.insuccess.invalid";

function loginRedirect(kind: "error" | "message", message: string, next: string): never {
  const destination = new URL(authMessagePath("/login", kind, message), LOGIN_ORIGIN);
  if (next !== "/") destination.searchParams.set("next", next);
  redirect(`${destination.pathname}${destination.search}`);
}

export async function login(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? ""), LOGIN_ORIGIN);
  if (!isSupabaseConfigured()) loginRedirect("error", "Supabase project тохируулаагүй байна.", next);

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) loginRedirect("error", "Имэйл болон нууц үгээ оруулна уу.", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) loginRedirect("error", "Нэвтрэх мэдээлэл буруу эсвэл бүртгэл баталгаажаагүй байна.", next);

  revalidatePath("/", "layout");
  redirect(next);
}
