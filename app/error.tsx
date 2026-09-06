"use client";

import Link from "next/link";
import styles from "./route-state.module.css";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.shell} role="alert" aria-labelledby="app-error-title">
      <section className={styles.card}>
        <span className={styles.errorMark} aria-hidden="true">!</span>
        <p className={styles.eyebrow}>ХОЛБОЛТ ТАСАЛДЛАА</p>
        <h1 id="app-error-title">Энэ хэсгийг нээж чадсангүй</h1>
        <p>Холболтоо шалгаад дахин оролдоно уу. Таны хадгалсан мэдээлэл устахгүй.</p>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>Дахин оролдох</button>
          <Link href="/">Миний зам руу буцах</Link>
        </div>
      </section>
    </main>
  );
}
