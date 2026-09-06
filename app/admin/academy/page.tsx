import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loginPath } from "../../auth/login-path.mjs";
import { getCurrentTeamOsUser } from "../../current-user";
import { AdminAcademyCatalog } from "./admin-academy-catalog";
import styles from "./admin-academy.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Academy admin" };

function SetupState({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.stateShell}>
      <section className={styles.statePanel}>
        <p className={styles.eyebrow}>ACADEMY ADMIN</p>
        <h1>Video catalog</h1>
        {children}
        <Link href="/admin">Admin руу буцах</Link>
      </section>
    </main>
  );
}

export default async function AdminAcademyPage() {
  if (!isSupabaseConfigured()) {
    return <SetupState><p>Supabase public environment тохируулаагүй байна.</p></SetupState>;
  }

  const user = await getCurrentTeamOsUser();
  if (!user) redirect(loginPath("/admin/academy"));
  if (user.access !== "active") redirect("/access-pending");
  if (user.role !== "admin") redirect("/");

  if (!isSupabaseAdminConfigured()) {
    return <SetupState><p>Server-only <code>SUPABASE_SECRET_KEY</code> тохируулсны дараа catalog удирдлага нээгдэнэ.</p></SetupState>;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PRIVATE VIDEO CATALOG</p>
          <h1>Academy удирдлага</h1>
          <p>Видео upload хийхгүй. Mux дээр бэлэн болсон playback ID-г draft хичээлтэй холбож, дараа нь нийтэлнэ.</p>
        </div>
        <nav aria-label="Admin цэс">
          <Link href="/admin">Гишүүд</Link>
          <Link href="/academy">Academy харах</Link>
          <Link href="/">Нүүр</Link>
        </nav>
      </header>
      <AdminAcademyCatalog />
    </main>
  );
}
