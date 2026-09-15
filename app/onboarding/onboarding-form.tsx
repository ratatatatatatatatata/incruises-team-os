"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarterAnswers } from "@/lib/success-map/contracts";

const EMPTY_ANSWERS: StarterAnswers = {
  currentContext: "",
  goal30Day: "",
  weeklyCapacity: "",
  primaryBlocker: "",
  growthPreferences: "",
};

const QUESTIONS: Array<{
  key: keyof StarterAnswers;
  title: string;
  helper: string;
  placeholder: string;
  min: number;
}> = [
  {
    key: "currentContext",
    title: "1. Та одоо ямар нөхцөл, үүрэг, туршлагатай байна вэ?",
    helper: "Таны ажил, багийн үе шат, энэ чиглэлээр хийж байсан зүйлээ товч бичнэ үү.",
    placeholder: "Жишээ: Би шинээр эхэлж байгаа, одоогоор 3 хүний багтай...",
    min: 10,
  },
  {
    key: "goal30Day",
    title: "2. Ирэх 30 хоногт ямар бодит үр дүнд хүрэх вэ?",
    helper: "Амжилтыг хэмжих тоо эсвэл ажиглагдах үр дүнгээ хамт бичнэ үү.",
    placeholder: "Жишээ: 10 discovery уулзалт хийж, 3 шинэ member onboarding хийх...",
    min: 10,
  },
  {
    key: "weeklyCapacity",
    title: "3. Долоо хоногт хэдий хугацаа, ямар хэмнэлээр ажиллах боломжтой вэ?",
    helper: "Өдөр, цаг, илүү төвлөрч чаддаг үеэ бичнэ үү.",
    placeholder: "Жишээ: Даваа–Баасан өдөр бүр 45 минут, Бямба 2 цаг...",
    min: 3,
  },
  {
    key: "primaryBlocker",
    title: "4. Одоогийн хамгийн том саад юу вэ, өмнө нь юуг туршсан бэ?",
    helper: "Хугацаа, ур чадвар, систем, контент, баг зэрэг бодит саадыг хэлнэ үү.",
    placeholder: "Жишээ: Follow-up тогтмол хийж чаддаггүй, calendar ашиглаж үзсэн...",
    min: 10,
  },
  {
    key: "growthPreferences",
    title: "5. Контент ба management-д танд яг ямар тусламж хэрэгтэй вэ?",
    helper: "Үзэгч, ашиглах суваг, багийн нөхцөл, хүссэн зөвлөгөөний хэв маягаа хамтад нь бичнэ үү.",
    placeholder: "Жишээ: Facebook-д шинэ хэрэглэгчдэд зориулсан контент, багтаа долоо хоногийн review...",
    min: 10,
  },
];

export function OnboardingForm({ displayName, initialAnswers, initialAiConsent }: {
  displayName: string;
  initialAnswers: StarterAnswers | null;
  initialAiConsent: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initialAnswers ?? EMPTY_ANSWERS);
  const [aiConsent, setAiConsent] = useState(initialAiConsent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const completed = useMemo(
    () => QUESTIONS.filter((question) => answers[question.key].trim().length >= question.min).length,
    [answers],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (completed !== QUESTIONS.length) {
      setError("5 асуултад бүгдэд нь тодорхой хариулна уу.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus(aiConsent ? "Personal AI төлөвлөгөөг боловсруулж байна..." : "Төлөвлөгөөг боловсруулж байна...");
    try {
      const response = await fetch("/api/success-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, aiConsent }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; aiFallbackReason?: string | null };
      if (!response.ok) throw new Error(result.error ?? "Төлөвлөгөөг хадгалж чадсангүй.");
      if (result.aiFallbackReason) setStatus(result.aiFallbackReason);
      router.push("/?section=my-path");
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Төлөвлөгөөг хадгалж чадсангүй.");
      setStatus("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-header">
        <p className="eyebrow cyan">2 МИНУТ · STARTER SUCCESS MAP</p>
        <h1>Сайн байна уу, {displayName}.</h1>
        <p>Эдгээр 5 хариултаар таны эхний 7/30 хоногийн content ба management төлөвлөгөөг гаргана. Энэ нь засварлаж болдог ажлын эхлэл болохоос зан төлөвийн онош биш.</p>
        <div className="onboarding-progress" aria-label={`${completed}/5 асуулт бөглөгдсөн`}>
          <span style={{ width: `${(completed / QUESTIONS.length) * 100}%` }} />
        </div>
        <strong>{completed}/5 бөглөгдсөн</strong>
      </section>

      <form className="onboarding-form" onSubmit={submit}>
        {QUESTIONS.map((question) => (
          <label className="onboarding-question" key={question.key}>
            <span>{question.title}</span>
            <small>{question.helper}</small>
            <textarea
              value={answers[question.key]}
              onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
              placeholder={question.placeholder}
              minLength={question.min}
              maxLength={question.key === "weeklyCapacity" ? 800 : 1600}
              required
            />
          </label>
        ))}

        <label className="ai-consent-card">
          <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
          <span><strong>Personal AI-аар илүү нарийвчлуулах</strong><small>Зөвшөөрвөл зөвхөн дээрх 5 хариулт, хамаарах Academy хичээлийн нэр AI Gateway руу явна. Имэйл, хэрэглэгчийн ID явуулахгүй. Зөвшөөрөхгүй бол дүрэмд суурилсан бүрэн төлөвлөгөө гарна.</small></span>
        </label>

        {error && <p className="auth-message error" role="alert">{error}</p>}
        {status && <p className="auth-message success" role="status">{status}</p>}
        <div className="onboarding-actions">
          {initialAnswers && <button className="secondary-button" type="button" onClick={() => router.push("/?section=my-path")}>Өөрчлөлтгүй буцах</button>}
          <button className="primary-button" type="submit" disabled={saving || completed !== QUESTIONS.length}>
            {saving ? "Боловсруулж байна..." : initialAnswers ? "Төлөвлөгөөг шинэчлэх" : "Миний төлөвлөгөөг үүсгэх"}
          </button>
        </div>
      </form>
    </main>
  );
}
