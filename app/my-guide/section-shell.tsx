import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "../brand";
import styles from "./section-shell.module.css";

type SectionShellProps = {
  active: "guide" | "assistant";
  userName: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function SectionShell({ active, userName, eyebrow, title, description, children }: SectionShellProps) {
  const initial = userName.trim().charAt(0).toUpperCase() || "I";

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#section-content">
        Үндсэн хэсэг рүү очих
      </a>

      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={`${BRAND_NAME} хяналтын төв рүү очих`}>
          <span className={styles.brandMark} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>{BRAND_NAME}</strong>
            <small>{PRODUCT_DESCRIPTOR}</small>
          </span>
        </Link>

        <nav className={styles.navigation} aria-label="Хувийн хөгжлийн цэс">
          <Link href="/">Хяналтын төв</Link>
          <Link href="/my-guide" aria-current={active === "guide" ? "page" : undefined}>
            Миний зам
          </Link>
          <Link href="/assistant" aria-current={active === "assistant" ? "page" : undefined}>
            Дижитал ментор
          </Link>
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

      <main id="section-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="section-title">
          <p>{eyebrow}</p>
          <h1 id="section-title">{title}</h1>
          <span>{description}</span>
        </section>
        {children}
      </main>
    </div>
  );
}
