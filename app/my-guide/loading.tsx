import styles from "./my-guide.module.css";

export default function MyGuideLoading() {
  return (
    <main className={styles.stateCard} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.loader} aria-hidden="true" />
      <h1>Миний амжилтын замыг нээж байна</h1>
      <p>Түр хүлээнэ үү.</p>
    </main>
  );
}
