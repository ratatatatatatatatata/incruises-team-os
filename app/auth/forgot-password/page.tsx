import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../../brand";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Нууц үг сэргээх" };

export default async function ForgotPasswordPage({
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
        <p className="eyebrow">PASSWORD RECOVERY</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">
          Бүртгэлтэй имэйлээ оруулна уу. Бид шинэ нууц үг тохируулах нэг удаагийн холбоос илгээнэ.
        </p>

        {!configured && <p className="auth-message error" role="alert">Supabase environment variable тохируулаагүй байна.</p>}
        {params.error && <p className="auth-message error" role="alert">{params.error}</p>}
        {params.message && <p className="auth-message success" role="status">{params.message}</p>}

        <form className="signin-form" action={requestPasswordReset}>
          <label>
            Имэйл
            <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="name@example.com" />
          </label>
          <div className="signin-actions">
            <button className="primary-button" type="submit" disabled={!configured}>Сэргээх холбоос авах</button>
          </div>
        </form>

        <Link className="signin-link signin-link-back" href="/login">Нэвтрэх хэсэг рүү буцах</Link>
        <p className="signin-note">Аюулгүй байдлын үүднээс тухайн имэйл бүртгэлтэй эсэхийг дэлгэцээр харуулахгүй.</p>
      </section>
    </main>
  );
}
