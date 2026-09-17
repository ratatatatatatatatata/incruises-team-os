"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEightDigitPin } from "../pin-policy.mjs";

export async function setPassword(formData: FormData) {
  const recoveryFlow = formData.get("flow") === "recovery";
  const errorPath = recoveryFlow ? "/auth/set-password?flow=recovery&error=" : "/auth/set-password?error=";
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (!isEightDigitPin(password)) {
    redirect(`${errorPath}${encodeURIComponent("PIN код яг 8 оронтой, зөвхөн тоо байна.")}`);
  }
  if (password !== confirmation) redirect(`${errorPath}${encodeURIComponent("PIN кодын давталт таарахгүй байна.")}`);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (!claims?.sub || isAnonymous) redirect("/login?error=PIN код тохируулах session хүчингүй эсвэл хугацаа дууссан байна.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`${errorPath}${encodeURIComponent("PIN кодыг хадгалж чадсангүй. Өөр 8 оронтой тоо сонгоно уу.")}`);
  redirect("/");
}
