"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authMessagePath } from "../redirects.mjs";

export async function setPassword(formData: FormData) {
  const recoveryFlow = formData.get("flow") === "recovery";
  const errorPath = recoveryFlow ? "/auth/set-password?flow=recovery" : "/auth/set-password";
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 12 || password.length > 128) {
    redirect(authMessagePath(errorPath, "error", "Нууц үг 12–128 тэмдэгт байна."));
  }
  if (password !== confirmation) {
    redirect(authMessagePath(errorPath, "error", "Нууц үгийн давталт таарахгүй байна."));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (!claims?.sub || isAnonymous) {
    redirect(authMessagePath("/login", "error", "Нууц үг тохируулах session хүчингүй эсвэл хугацаа дууссан байна."));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(authMessagePath(errorPath, "error", "Нууц үгийг хадгалж чадсангүй. Өөр хүчтэй нууц үг сонгоно уу."));
  }

  if (recoveryFlow) redirect("/");
  redirect("/onboarding");
}
