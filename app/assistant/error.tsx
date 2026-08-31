"use client";

import styles from "./assistant.module.css";

export default function AssistantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={`${styles.stateCard} ${styles.errorState}`} role="alert">
      <span className={styles.stateIcon} aria-hidden="true">!</span>
      <h1>Дижитал ментор нээгдсэнгүй</h1>
      <p>Холболтоо шалгаад дахин оролдоно уу.</p>
      <div className={styles.stateActions}>
        <button type="button" onClick={reset}>Дахин оролдох</button>
      </div>
    </main>
  );
}
