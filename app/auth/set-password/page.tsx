import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../../brand";
import { setPassword } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Нууц үг тохируулах" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; flow?: string }>;
}) {
  const params = await searchParams;
  const recoveryFlow = params.flow === "recovery";
  if (!isSupabaseConfigured()) redirect("/login?error=Supabase project тохируулаагүй байна.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const isAnonymous = claims?.is_anonymous === true || claims?.is_anonymous === "true";
  if (error || !claims?.sub || !email || isAnonymous) {
    redirect("/login?error=Нууц үг тохируулах холбоос хүчингүй эсвэл хугацаа дууссан байна.");
  }

  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="eyebrow">{recoveryFlow ? "PASSWORD RECOVERY" : "INVITE SETUP"}</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">{recoveryFlow ? "Сэргээх холбоос баталгаажлаа. Шинэ нууц үгээ тохируулна уу." : "Урилгын session баталгаажлаа. Шинэ нууц үгээ тохируулна уу."}</p>
        {params.error && <p className="auth-message error" role="alert">{params.error}</p>}
        <form className="signin-form">
          <input type="hidden" name="flow" value={recoveryFlow ? "recovery" : "invite"} />
          <label>Шинэ нууц үг<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
          <label>Нууц үг давтах<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
          <div className="signin-actions"><button className="primary-button" formAction={setPassword}>Нууц үг хадгалах</button></div>
        </form>
        <p className="signin-note">Имэйл: {email}</p>
      </section>
    </main>
  );
}
