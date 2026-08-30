import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getCurrentTeamOsUser } from "../current-user";
import { AdminConsole } from "./admin-console";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access admin" };

function ConfigurationPanel({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.stateShell}>
      <section className={styles.statePanel}>
        <p className={styles.eyebrow}>PRIVATE ADMIN ACCESS</p>
        <h1>Access console</h1>
        {children}
        <Link className={styles.secondaryLink} href="/">
          Workspace руу буцах
        </Link>
      </section>
    </main>
  );
}

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <ConfigurationPanel>
        <p className={styles.stateCopy}>Supabase public environment тохируулаагүй тул admin console ажиллахгүй байна.</p>
      </ConfigurationPanel>
    );
  }

  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  if (user.access !== "active") redirect("/access-pending");

  if (user.role !== "admin") {
    return (
      <ConfigurationPanel>
        <p className={styles.stateCopy}>Энэ хэсэгт зөвхөн идэвхтэй admin нэвтэрнэ.</p>
        <p className={styles.identity}>{user.email}</p>
      </ConfigurationPanel>
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return (
      <ConfigurationPanel>
        <p className={styles.stateCopy}>
          Admin console-ийн server-only credential тохируулаагүй байна. Hosting environment-д
          <code>SUPABASE_SECRET_KEY</code> нэмсний дараа энэ хуудсыг дахин ачаална уу.
        </p>
        <p className={styles.safetyNote}>Secret key-г <code>NEXT_PUBLIC_</code> нэртэй хувьсагчид эсвэл browser кодод хийж болохгүй.</p>
      </ConfigurationPanel>
    );
  }

  return (
    <main className={styles.adminShell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PRIVATE ADMIN ACCESS</p>
          <h1>Гишүүн ба эрхийн удирдлага</h1>
          <p>Invite, role, activation өөрчлөлт бүр server дээр шалгагдаж, membership audit-д бүртгэгдэнэ.</p>
        </div>
        <div className={styles.headerActions}>
          <span>{user.email}</span>
          <Link className={styles.secondaryLink} href="/">
            Workspace
          </Link>
        </div>
      </header>

      <AdminConsole />
    </main>
  );
}
