import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../brand";
import styles from "./academy.module.css";

export function AcademyShell({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const initial = userName.trim().charAt(0).toUpperCase() || "I";

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#academy-content">
        Хичээлүүд рүү очих
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={`${BRAND_NAME} хяналтын төв рүү очих`}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>{BRAND_NAME}</strong>
            <small>{PRODUCT_DESCRIPTOR}</small>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Academy цэс">
          <Link href="/">Хяналтын төв</Link>
          <Link href="/my-guide">Миний Guide</Link>
          <Link href="/assistant">AI туслах</Link>
          <Link href="/academy" aria-current="page">Academy</Link>
          <Link href="/workspace">Team OS</Link>
          <Link href="/privacy">Нууцлал</Link>
        </nav>
        <div className={styles.account}>
          <span aria-hidden="true">{initial}</span>
          <strong>{userName}</strong>
          <form action="/auth/signout" method="post">
            <button type="submit">Гарах</button>
          </form>
        </div>
      </header>
      <main id="academy-content" className={styles.main}>{children}</main>
    </div>
  );
}
