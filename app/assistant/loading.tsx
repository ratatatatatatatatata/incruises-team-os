import styles from "./assistant.module.css";

export default function AssistantLoading() {
  return (
    <main className={styles.stateCard} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.loader} aria-hidden="true" />
      <h1>Дижитал менторыг нээж байна</h1>
      <p>Түр хүлээнэ үү.</p>
    </main>
  );
}
