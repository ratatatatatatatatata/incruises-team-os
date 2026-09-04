"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setPassword(formData: FormData) {
  const recoveryFlow = formData.get("flow") === "recovery";
  const errorPath = recoveryFlow ? "/auth/set-password?flow=recovery&error=" : "/auth/set-password?error=";
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 12 || password.length > 128) {
    redirect(`${errorPath}${encodeURIComponent("Нууц үг 12–128 тэмдэгт байна.")}`);
  }
  if (password !== confirmation) redirect(`${errorPath}${encodeURIComponent("Нууц үгийн давталт таарахгүй байна.")}`);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (!claims?.sub || isAnonymous) redirect("/login?error=Нууц үг тохируулах session хүчингүй эсвэл хугацаа дууссан байна.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`${errorPath}${encodeURIComponent("Нууц үгийг хадгалж чадсангүй. Өөр хүчтэй нууц үг сонгоно уу.")}`);
  redirect("/");
}
