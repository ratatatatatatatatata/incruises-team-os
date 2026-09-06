"use client";

import { useEffect, useState } from "react";
import styles from "./pwa-register.module.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setDismissed(false);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // The browser's normal install menu remains available if its prompt fails.
    }
  }

  if (!installPrompt || dismissed) return null;

  return (
    <aside className={styles.prompt} role="status" aria-live="polite" aria-labelledby="pwa-install-title">
      <span className={styles.mark} aria-hidden="true">＋</span>
      <div>
        <strong id="pwa-install-title">inSuccess-ийг апп болгох</strong>
        <p>Нүүр дэлгэцээсээ нэг даралтаар нээгээрэй.</p>
      </div>
      <button className={styles.install} type="button" onClick={() => void install()}>
        Суулгах
      </button>
      <button
        className={styles.dismiss}
        type="button"
        aria-label="Суулгах саналыг хаах"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </aside>
  );
}
