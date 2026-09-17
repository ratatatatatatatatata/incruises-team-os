import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../brand";

export const metadata: Metadata = { title: "Бүртгүүлэх" };

export default function SignupPage() {
  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="eyebrow">INVITE-ONLY ACCESS</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">inSuccess нь хаалттай багийн орчин. Хүссэн хүн өөрөө бүртгүүлэх боломжгүй бөгөөд админ таны имэйл рүү урилга илгээсний дараа л эрх нээгдэнэ.</p>
        <p className="auth-message success" role="status">Урилга ирсэн бол имэйл дэх холбоосоор 8 оронтой PIN кодоо тохируулна уу.</p>
        <div className="signin-actions"><Link className="primary-button" href="/login">Нэвтрэх хуудас руу буцах</Link></div>
      </section>
    </main>
  );
}
