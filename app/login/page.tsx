import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../brand";
import { login } from "./actions";

export const metadata: Metadata = { title: "Нэвтрэх" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="eyebrow">PRIVATE TEAM ACCESS</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">Багийн сургалт, контентын хяналт, гишүүний дараагийн алхмыг нэг дор удирдана.</p>

        {!configured && <p className="auth-message error" role="alert">Supabase environment variable тохируулаагүй байна.</p>}
        {params.error && <p className="auth-message error" role="alert">{params.error}</p>}
        {params.message && <p className="auth-message success" role="status">{params.message}</p>}

        <form className="signin-form">
          <label>Имэйл<input name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></label>
          <label>Нууц үг<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
          <Link href="/auth/forgot-password">Нууц үгээ мартсан уу?</Link>
          <div className="signin-actions">
            <button className="primary-button" formAction={login} disabled={!configured}>Нэвтрэх</button>
          </div>
        </form>
        <p className="signin-switch">Шинэ хэрэглэгч үү? <Link href="/signup">Бүртгүүлэх</Link></p>
        <p className="signin-note">Бүртгүүлсний дараа имэйлээ баталгаажуулаад нэвтэрнэ.</p>
      </section>
    </main>
  );
}
