"use client";

import styles from "./my-guide.module.css";

export default function MyGuideError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={`${styles.stateCard} ${styles.errorState}`} role="alert">
      <span className={styles.stateIcon} aria-hidden="true">!</span>
      <h1>Миний замыг нээж чадсангүй</h1>
      <p>Холболтоо шалгаад дахин оролдоно уу.</p>
      <button type="button" onClick={reset}>Дахин оролдох</button>
    </main>
  );
}
