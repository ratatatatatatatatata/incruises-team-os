"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarterAnswers } from "@/lib/success-map/contracts";
import {
  answerNeedsClarification,
  CLARIFICATION_GUIDANCE,
  clarificationMessage,
  clarificationReason,
  firstAnswerNeedingClarification,
  isStarterAnswerKey,
  type StarterAnswerKey,
} from "@/lib/success-map/clarification";

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
}> = [
  {
    key: "currentContext",
    title: "1. Та яг одоо ямар нөхцөлтэй байна вэ?",
    helper: "Ажил, амьдрал, сурч байгаа зүйл эсвэл хариуцаж буй хүмүүсээсээ хамгийн чухлыг товч бичнэ үү.",
    placeholder: "Жишээ: Би шинэ ажил эхэлсэн, цаг бага, өөртөө итгэлтэй ярьж сурмаар байна...",
  },
  {
    key: "goal30Day",
    title: "2. Ирэх 30 хоногт юу өөр болсон байгаасай гэж хүсэж байна вэ?",
    helper: "Та өөрөө хараад “боллоо” гэж мэдэх нэг бодит үр дүнг бичнэ үү.",
    placeholder: "Жишээ: Хурлын үеэр санаагаа 2 минут ойлгомжтой хэлж чаддаг болох...",
  },
  {
    key: "weeklyCapacity",
    title: "3. Энэ зорилгод долоо хоногт нийт хэдэн минут бодитоор гаргаж чадах вэ?",
    helper: "Хүссэн биш, үнэхээр гаргаж чадах нийт цагаа болон тохиромжтой өдрөө бичнэ үү.",
    placeholder: "Жишээ: Долоо хоногт нийт 45 минут; Мягмар, Пүрэв орой...",
  },
  {
    key: "primaryBlocker",
    title: "4. Юун дээр гацаж байна, өмнө нь юу туршсан бэ?",
    helper: "Ойлгохгүй байгаа зүйл, цагийн саад, айдас, дадал эсвэл бодит бэрхшээлээ энгийнээр бичнэ үү.",
    placeholder: "Жишээ: Яриагаа яаж эхлэхээ мэдэхгүй; бичиж бэлдээд үзсэн ч хэт урт болдог...",
  },
  {
    key: "growthPreferences",
    title: "5. Ямар хэлбэрийн тусламж танд хамгийн хэрэгтэй вэ?",
    helper: "Жижиг ажил, жишээ, сургалт, дадлага, сануулга эсвэл хүнтэй ярилцахын алиныг хүсэж байгаагаа бичнэ үү.",
    placeholder: "Жишээ: Нэг удаад нэг жижиг ажил, дараа нь coach-оос товч feedback авмаар байна...",
  },
];

export function OnboardingForm({ displayName, initialAnswers, initialAiConsent, initialSupportSummaryConsent }: {
  displayName: string;
  initialAnswers: StarterAnswers | null;
  initialAiConsent: boolean;
  initialSupportSummaryConsent: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initialAnswers ?? EMPTY_ANSWERS);
  const [aiConsent, setAiConsent] = useState(initialAiConsent);
  const [supportSummaryConsent, setSupportSummaryConsent] = useState(initialSupportSummaryConsent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [activeClarification, setActiveClarification] = useState<StarterAnswerKey | null>(null);

  const completed = useMemo(
    () => QUESTIONS.filter((question) => !answerNeedsClarification(question.key, answers[question.key])).length,
    [answers],
  );

  useEffect(() => {
    if (!activeClarification) return;
    const textarea = document.getElementById(`onboarding-answer-${activeClarification}`);
    textarea?.scrollIntoView({ behavior: "smooth", block: "center" });
    textarea?.focus({ preventScroll: true });
  }, [activeClarification]);

  function requestClarification(key: StarterAnswerKey, message?: string) {
    const reason = clarificationReason(key, answers[key]);
    setActiveClarification(key);
    setError(message ?? clarificationMessage(reason ?? "needs_detail"));
    setStatus("");
  }

  function updateAnswer(key: StarterAnswerKey, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
    if (activeClarification === key && !answerNeedsClarification(key, value)) {
      setActiveClarification(null);
      setError("");
    }
  }

  function chooseClarification(key: StarterAnswerKey, value: string) {
    updateAnswer(key, value);
    setActiveClarification(null);
    setError("");
    setStatus("Сонгосон хариултыг орууллаа. Хүсвэл өөрийн үгээр засаж болно.");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clarificationKey = firstAnswerNeedingClarification(answers);
    if (clarificationKey) {
      requestClarification(clarificationKey);
      return;
    }

    setSaving(true);
    setError("");
    setStatus(aiConsent ? "Personal AI төлөвлөгөөг боловсруулж байна..." : "Төлөвлөгөөг боловсруулж байна...");
    try {
      const response = await fetch("/api/success-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, aiConsent, supportSummaryConsent }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        aiFallbackReason?: string | null;
        clarificationKey?: unknown;
      };
      if (!response.ok && response.status === 422 && isStarterAnswerKey(result.clarificationKey)) {
        requestClarification(result.clarificationKey, result.error);
        return;
      }
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
        <p>Эдгээр 5 хариултаар таны боломжит цагт багтсан өнөөдрийн нэг ажлыг гаргана. 7/30 хоногийн дэлгэрэнгүйг хүссэн үедээ нээж болно. Энэ нь зан төлөвийн онош биш.</p>
        <p className="onboarding-privacy">Таны бүрэн хариулт зөвхөн танд харагдана. Sponsor/coach-д зорилго, гол саад, хэрэгтэй тусламж болон явцын purpose-limited summary л харагдана.</p>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Өөр аккаунтаар нэвтрэх / Гарах</button></form>
        <div className="onboarding-progress" aria-label={`${completed}/5 асуулт бөглөгдсөн`}>
          <span style={{ width: `${(completed / QUESTIONS.length) * 100}%` }} />
        </div>
        <strong>{completed}/5 бөглөгдсөн</strong>
      </section>

      <form className="onboarding-form" onSubmit={submit} noValidate>
        {QUESTIONS.map((question) => {
          const clarification = CLARIFICATION_GUIDANCE[question.key];
          const isActive = activeClarification === question.key;
          return (
            <section className={`onboarding-question${isActive ? " needs-clarification" : ""}`} key={question.key}>
            <label htmlFor={`onboarding-answer-${question.key}`}>{question.title}</label>
            <small id={`onboarding-helper-${question.key}`}>{question.helper}</small>
            <textarea
              id={`onboarding-answer-${question.key}`}
              value={answers[question.key]}
              onChange={(event) => updateAnswer(question.key, event.target.value)}
              placeholder={question.placeholder}
              maxLength={question.key === "weeklyCapacity" ? 800 : 1600}
              aria-invalid={isActive}
              aria-describedby={`onboarding-helper-${question.key}${isActive ? ` onboarding-clarification-${question.key}` : ""}`}
            />
            {isActive && (
              <fieldset className="onboarding-clarification" id={`onboarding-clarification-${question.key}`}>
                <legend>Илүү энгийнээр асууя</legend>
                <p>{clarification.prompt}</p>
                <div className="clarification-choices">
                  {clarification.choices.map((choice) => (
                    <button type="button" key={choice} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseClarification(question.key, choice)}>
                      {choice}
                    </button>
                  ))}
                </div>
                <small>Өөрт хамгийн ойр хариултыг сонгох эсвэл дээрх талбарт өөрийн үгээр бичээрэй.</small>
              </fieldset>
            )}
            </section>
          );
        })}

        <label className="ai-consent-card">
          <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
          <span><strong>Personal AI-аар илүү нарийвчлуулах</strong><small>Зөвшөөрвөл зөвхөн дээрх 5 хариулт, хамаарах Academy хичээлийн нэр AI Gateway руу явна. Имэйл, хэрэглэгчийн ID явуулахгүй. Зөвшөөрөхгүй бол дүрэмд суурилсан бүрэн төлөвлөгөө гарна.</small></span>
        </label>

        <label className="ai-consent-card">
          <input type="checkbox" checked={supportSummaryConsent} onChange={(event) => setSupportSummaryConsent(event.target.checked)} />
          <span><strong>Sponsor/coach-д дэмжлэгийн товч мэдээлэл хуваалцах</strong><small>Зөвшөөрвөл зорилго, боломжит цаг, одоогийн ажил, гацсан зүйл болон хүссэн тусламжийн purpose-limited summary харагдана. Таны түүхий 5 хариулт болон хувийн AI яриа харагдахгүй.</small></span>
        </label>

        {error && <p className="auth-message error" role="alert">{error}</p>}
        {status && <p className="auth-message success" role="status">{status}</p>}
        <div className="onboarding-actions">
          {initialAnswers && <button className="secondary-button" type="button" onClick={() => router.push("/?section=my-path")}>Өөрчлөлтгүй буцах</button>}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Боловсруулж байна..." : initialAnswers ? "Төлөвлөгөөг шинэчлэх" : "Миний төлөвлөгөөг үүсгэх"}
          </button>
        </div>
      </form>
    </main>
  );
}
