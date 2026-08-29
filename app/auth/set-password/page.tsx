import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../../brand";
import { getCurrentTeamOsUser } from "../../current-user";
import { setPassword } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Нууц үг тохируулах" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  const params = await searchParams;

  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="eyebrow">INVITE SETUP</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">Урилгын session баталгаажлаа. Team OS-д дараагийн удаа нэвтрэх хүчтэй нууц үгээ тохируулна уу.</p>
        {params.error && <p className="auth-message error">{params.error}</p>}
        <form className="signin-form">
          <label>Шинэ нууц үг<input name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
          <label>Нууц үг давтах<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} /></label>
          <div className="signin-actions">
            <button className="primary-button" formAction={setPassword}>Нууц үг хадгалах</button>
          </div>
        </form>
        <p className="signin-note">Имэйл: {user.email}</p>
      </section>
    </main>
  );
}
