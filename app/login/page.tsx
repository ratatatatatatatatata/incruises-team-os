import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { login, signup } from "./actions";

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
        <p className="eyebrow">SUPABASE SECURE ACCESS</p>
        <h1>inCruises<br />TEAM OS</h1>
        <p className="signin-copy">Сургалт, зөвшөөрөгдсөн контент, гишүүний амжилтыг нэг стандартын дагуу удирдана.</p>

        {!configured && <p className="auth-message error">Supabase environment variable тохируулаагүй байна.</p>}
        {params.error && <p className="auth-message error">{params.error}</p>}
        {params.message && <p className="auth-message success">{params.message}</p>}

        <form className="signin-form">
          <label>Нэр<input name="fullName" type="text" autoComplete="name" placeholder="Бүтэн нэр" /></label>
          <label>Имэйл<input name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></label>
          <label>Нууц үг<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
          <div className="signin-actions">
            <button className="primary-button" formAction={login} disabled={!configured}>Нэвтрэх</button>
            <button className="secondary-button" formAction={signup} disabled={!configured}>Бүртгүүлэх</button>
          </div>
        </form>
        <p className="signin-note">Хэрэглэгчийн session cookie болон өгөгдлийн эрхийг Supabase Auth + RLS хамгаална.</p>
      </section>
    </main>
  );
}
