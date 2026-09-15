"use server";

import { redirect } from "next/navigation";

export async function signup() {
  redirect(`/login?error=${encodeURIComponent("Өөрөө бүртгүүлэх боломжгүй. Багийн админаас имэйл урилга авна уу.")}`);
}
