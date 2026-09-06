import Link from "next/link";
import styles from "./route-state.module.css";

export default function NotFound() {
  return (
    <main className={styles.shell} aria-labelledby="not-found-title">
      <section className={styles.card}>
        <span className={styles.errorMark} aria-hidden="true">?</span>
        <p className={styles.eyebrow}>404</p>
        <h1 id="not-found-title">Энэ хэсэг олдсонгүй</h1>
        <p>Холбоос өөрчлөгдсөн эсвэл хичээл хараахан нийтлэгдээгүй байж болно.</p>
        <div className={styles.actions}>
          <Link href="/">Миний зам руу буцах</Link>
          <Link href="/academy">Academy нээх</Link>
        </div>
      </section>
    </main>
  );
}
