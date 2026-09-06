import styles from "./route-state.module.css";

export default function AppLoading() {
  return (
    <main className={styles.shell} role="status" aria-live="polite" aria-busy="true">
      <section className={styles.card} aria-labelledby="app-loading-title">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.eyebrow}>INSUCCESS</p>
        <h1 id="app-loading-title">Таны хэсгийг нээж байна</h1>
        <p>Түр хүлээнэ үү.</p>
      </section>
    </main>
  );
}
