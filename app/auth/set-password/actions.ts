"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 12) redirect("/auth/set-password?error=Нууц үг хамгийн багадаа 12 тэмдэгт байна.");
  if (password !== confirmation) redirect("/auth/set-password?error=Нууц үгийн давталт таарахгүй байна.");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?error=Урилгын session хүчингүй эсвэл хугацаа дууссан байна.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/auth/set-password?error=Нууц үгийг хадгалж чадсангүй. Өөр хүчтэй нууц үг сонгоно уу.");

  redirect("/");
}
