"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./privacy.module.css";

type SharingLevel = "private" | "summary" | "detailed";

type Preferences = {
  assessmentConsent: boolean;
  consentVersion: string | null;
  consentedAt: string | null;
  sharingLevel: SharingLevel;
  assistantMemory: boolean;
};

function parsePreferences(value: unknown): Preferences {
  const envelope = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const raw = envelope.preferences && typeof envelope.preferences === "object"
    ? (envelope.preferences as Record<string, unknown>)
    : {};
  const sharing = raw.sharingLevel;
  return {
    assessmentConsent: raw.assessmentConsent === true,
    consentVersion: typeof raw.consentVersion === "string" ? raw.consentVersion : null,
    consentedAt: typeof raw.consentedAt === "string" ? raw.consentedAt : null,
    sharingLevel: sharing === "summary" || sharing === "detailed" ? sharing : "private",
    assistantMemory: raw.assistantMemory !== false,
  };
}

async function requestPreferences(signal?: AbortSignal): Promise<Preferences> {
  const response = await fetch("/api/privacy", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Нууцлалын сонголтыг нээж чадсангүй.");
  return parsePreferences(await response.json());
}

export function PrivacyClient({ userName }: { userName: string }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [sharingLevel, setSharingLevel] = useState<SharingLevel>("private");
  const [assistantMemory, setAssistantMemory] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestPreferences(controller.signal)
      .then((next) => {
        setPreferences(next);
        setSharingLevel(next.sharingLevel);
        setAssistantMemory(next.assistantMemory);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Нууцлалын сонголтыг нээж чадсангүй.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/privacy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update_preferences", sharingLevel, assistantMemory }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        throw new Error(typeof row.error === "string" ? row.error : "Сонголтыг хадгалж чадсангүй.");
      }
      const next = parsePreferences(body);
      setPreferences(next);
      setNotice("Таны нууцлалын сонголт хадгалагдлаа.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Сонголтыг хадгалж чадсангүй.");
    } finally {
      setSaving(false);
    }
  }

  async function changeAssessmentConsent(action: "accept_assessment" | "withdraw_assessment") {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/privacy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        throw new Error(typeof row.error === "string" ? row.error : "Зөвшөөрлийн сонголтыг хадгалж чадсангүй.");
      }
      const next = parsePreferences(body);
      setPreferences(next);
      setSharingLevel(next.sharingLevel);
      setAssistantMemory(next.assistantMemory);
      setNotice(
        next.assessmentConsent
          ? "Success Map-ийн зөвшөөрөл дахин идэвхжлээ."
          : "Зөвшөөрөл цуцлагдлаа. Шинэ хүсэлт болон app дахь хүлээгдэж буй AI хадгалалт зогслоо.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Зөвшөөрлийн сонголтыг хадгалж чадсангүй.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/">← Миний зам</Link>
        <span>{userName}</span>
      </header>
      <section className={styles.hero}>
        <p>MY DATA · MY CHOICE</p>
        <h1>Миний нууцлал</h1>
        <span>Таны raw хариулт default-аар зөвхөн танд харагдана. Энд AI-ийн санах ой болон хуваалцах түвшний сонголтоо удирдана.</span>
      </section>

      {loading ? (
        <section className={styles.state} role="status" aria-live="polite"><i aria-hidden="true" /><h2>Сонголтыг нээж байна</h2></section>
      ) : error && !preferences ? (
        <section className={styles.state} role="alert"><strong>!</strong><h2>{error}</h2><button type="button" onClick={retry}>Дахин оролдох</button></section>
      ) : (
        <form className={styles.form} onSubmit={save}>
          <section className={styles.card}>
            <div className={styles.cardHeading}><span>01</span><div><h2>Profile хуваалцах түвшин</h2><p>Энэ сонголт нь зөвшөөрлийн хүрээг хадгална. Raw хариултыг coach-д автоматаар нээхгүй.</p></div></div>
            <fieldset>
              <legend className={styles.srOnly}>Хуваалцах түвшин</legend>
              <label><input type="radio" name="sharing" checked={sharingLevel === "private"} onChange={() => setSharingLevel("private")} /><span><strong>Зөвхөн надад</strong><small>Profile, guide, raw хариулт private.</small></span></label>
              <label><input type="radio" name="sharing" checked={sharingLevel === "summary"} onChange={() => setSharingLevel("summary")} /><span><strong>Дүгнэлт хуваалцаж болно</strong><small>Raw answers биш, зөвхөн таны зөвшөөрсөн товч summary.</small></span></label>
              <label><input type="radio" name="sharing" checked={sharingLevel === "detailed"} onChange={() => setSharingLevel("detailed")} /><span><strong>Дэлгэрэнгүй guide хуваалцаж болно</strong><small>Зөвшөөрөгдсөн coach-д guide түвшний мэдээлэл; raw answer биш.</small></span></label>
            </fieldset>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeading}><span>02</span><div><h2>AI-ийн conversation memory</h2><p>Унтраавал өмнөх яриаг дараагийн хариултын context-д ашиглахгүй. Generation record нь хувийн history, зардал, алдааны хяналтад хадгалагдана.</p></div></div>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={assistantMemory} onChange={(event) => setAssistantMemory(event.target.checked)} />
              <span aria-hidden="true" />
              <strong>{assistantMemory ? "Өмнөх яриаг сануулгад ашиглана" : "Яриа бүр шинэ context-оор эхэлнэ"}</strong>
            </label>
          </section>

          <section className={styles.consentCard}>
            <div><strong>Success Map зөвшөөрөл</strong><span>{preferences?.assessmentConsent ? "Идэвхтэй" : "Баталгаажаагүй"}</span></div>
            <p>Зорилго, дадал, ур чадварын хариултыг зөвхөн хувийн Success Map ба guide үүсгэхэд ашиглана. Энэ нь онош эсвэл амжилтын баталгаа биш.</p>
            <p>Зөвшөөрөл цуцлах нь хадгалсан өгөгдлийг автоматаар устгахгүй. Цуцалсны дараа шинэ assessment, guide, assistant хүсэлт эхлэхгүй бөгөөд хүлээгдэж буй AI хариуг app-д хадгалахгүй. Харин цуцлах үйлдэлтэй зэрэгцэн AI provider руу аль хэдийн илгээгдэж эхэлсэн хүсэлтийг буцаан татах боломжгүй байж болно.</p>
            <button
              className={preferences?.assessmentConsent ? styles.withdraw : styles.restore}
              type="button"
              disabled={saving}
              onClick={() => void changeAssessmentConsent(preferences?.assessmentConsent ? "withdraw_assessment" : "accept_assessment")}
            >
              {preferences?.assessmentConsent ? "Success Map зөвшөөрлөө цуцлах" : "Success Map зөвшөөрлөө дахин идэвхжүүлэх"}
            </button>
          </section>

          <section className={styles.deletionCard}>
            <div>
              <strong>Account ба өгөгдөл устгах хүсэлт</strong>
              <p>Account deletion хүсэлтээ app дотроос эхлүүлж, төлөвийг харах эсвэл боловсруулалт эхлэхээс өмнө цуцална.</p>
            </div>
            <Link href="/account-deletion#manage">Хүсэлтээ удирдах →</Link>
          </section>

          {notice && <p className={styles.success} role="status">{notice}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.save} type="submit" disabled={saving || !preferences?.assessmentConsent}>{saving ? "Хадгалж байна…" : "Сонголтоо хадгалах"}</button>
        </form>
      )}
    </main>
  );
}
