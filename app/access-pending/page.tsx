import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../brand";
import { getCurrentTeamOsUser } from "../current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Эрх хүлээгдэж байна" };

export default async function AccessPendingPage() {
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  if (user.access === "active" && user.role) redirect("/");

  const disabled = user.access === "disabled";
  const canResumeOnboarding = !disabled && user.onboarding?.status !== "completed";

  return (
    <main className="signin-shell">
      <section className="signin-panel">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="eyebrow">PRIVATE TEAM ACCESS</p>
        <h1>{BRAND_NAME}<br />{PRODUCT_DESCRIPTOR}</h1>
        <p className="signin-copy">
          {disabled
            ? "Таны Team OS эрх түр хаалттай байна. Багийн админтай холбогдоно уу."
            : "Нэвтрэлт баталгаажсан. Team OS-ийн багийн эрхийг админ идэвхжүүлсний дараа workspace нээгдэнэ."}
        </p>
        <p className="auth-message success">{user.email}</p>
        <div className="signin-actions">
          {canResumeOnboarding ? (
            <Link className="primary-button" href="/onboarding">Амжилтын зураглалаа үргэлжлүүлэх</Link>
          ) : (
            <Link className="primary-button" href="/auth/set-password">Нууц үг тохируулах</Link>
          )}
        </div>
        <form action="/auth/signout" method="post">
          <button className="secondary-button" type="submit">Гарах</button>
        </form>
      </section>
    </main>
  );
}
