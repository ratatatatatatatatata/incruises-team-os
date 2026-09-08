import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../brand";
import { signup } from "./actions";

export const metadata: Metadata = { title: "Бүртгүүлэх" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="eyebrow">CREATE YOUR ACCOUNT</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">Багийн сургалт, ажлын явц болон хэрэглэгчийн мэдээллээ нэг дор удирдах бүртгэлээ үүсгэнэ үү.</p>
        {!configured && <p className="auth-message error" role="alert">Supabase environment variable тохируулаагүй байна.</p>}
        {params.error && <p className="auth-message error" role="alert">{params.error}</p>}
        <form className="signin-form">
          <label>Овог нэр<input name="displayName" autoComplete="name" required maxLength={80} placeholder="Таны нэр" /></label>
          <label>Имэйл<input name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></label>
          <label>Нууц үг<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
          <label>Нууц үг давтах<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} /></label>
          <div className="signin-actions"><button className="primary-button" formAction={signup} disabled={!configured}>Бүртгүүлэх</button></div>
        </form>
        <p className="signin-switch">Бүртгэлтэй юу? <Link href="/login">Нэвтрэх</Link></p>
      </section>
    </main>
  );
}
