"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./onboarding.module.css";

const BASELINE_TOTAL = 15;
const TAILORED_TOTAL = 100;

type Stage =
  | "baseline"
  | "analysis"
  | "tailored"
  | "ready_to_complete"
  | "completed";

type Phase = "baseline" | "tailored";
type DisplayMode = "simple" | "guided" | "fast";
type AnswerValue = string | number | string[];
type AnswerPayload =
  | { kind: "answer"; value: AnswerValue }
  | { kind: "skip"; reason: "not_sure" };

type QuestionOption = {
  value: string;
  label: string;
  description?: string | null;
};

type Question = {
  id: string;
  phase: Phase;
  position: number;
  prompt: string;
  helpText?: string | null;
  responseType:
    | "single_choice"
    | "multi_choice"
    | "scale"
    | "short_text"
    | "long_text"
    | "number";
  required: boolean;
  options?: QuestionOption[];
  minSelections?: number;
  maxSelections?: number;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  placeholder?: string;
  maxLength?: number;
};

type Snapshot = {
  sessionId: string;
  stage: Stage;
  baselineAnswered: number;
  baselineTotal: 15;
  tailoredAnswered: number;
  tailoredTotal: 100;
  question: Question | null;
};

type ApiErrorBody = {
  error?: string;
  code?: string;
};

type PrivacyPreferences = {
  assessmentConsent: boolean;
  sharingLevel: "private" | "summary" | "detailed";
};

class OnboardingRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

const displayModes: Array<{
  value: DisplayMode;
  label: string;
  description: string;
}> = [
  {
    value: "simple",
    label: "Энгийн",
    description: "Зөвхөн асуулт, хариулт",
  },
  {
    value: "guided",
    label: "Алхамтай",
    description: "Туслах тайлбартай",
  },
  {
    value: "fast",
    label: "Хурдан",
    description: "Зай багатай харагдац",
  },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStage(value: unknown): value is Stage {
  return (
    value === "baseline" ||
    value === "analysis" ||
    value === "tailored" ||
    value === "ready_to_complete" ||
    value === "completed"
  );
}

function isQuestion(value: unknown): value is Question {
  if (!isObject(value)) return false;
  const responseTypes = new Set([
    "single_choice",
    "multi_choice",
    "scale",
    "short_text",
    "long_text",
    "number",
  ]);

  return (
    typeof value.id === "string" &&
    (value.phase === "baseline" || value.phase === "tailored") &&
    typeof value.position === "number" &&
    typeof value.prompt === "string" &&
    responseTypes.has(value.responseType as string) &&
    typeof value.required === "boolean"
  );
}

function parseSnapshot(value: unknown): Snapshot {
  if (!isObject(value)) {
    throw new OnboardingRequestError("Серверээс буруу мэдээлэл ирлээ.", "INVALID_RESPONSE");
  }

  if (
    typeof value.sessionId !== "string" ||
    !isStage(value.stage) ||
    typeof value.baselineAnswered !== "number" ||
    typeof value.tailoredAnswered !== "number" ||
    value.baselineTotal !== BASELINE_TOTAL ||
    value.tailoredTotal !== TAILORED_TOTAL ||
    (value.question !== null && !isQuestion(value.question))
  ) {
    throw new OnboardingRequestError(
      "Onboarding мэдээллийн бүтэц тохирохгүй байна.",
      "INVALID_RESPONSE",
    );
  }

  if (
    value.baselineAnswered < 0 ||
    value.baselineAnswered > BASELINE_TOTAL ||
    value.tailoredAnswered < 0 ||
    value.tailoredAnswered > TAILORED_TOTAL
  ) {
    throw new OnboardingRequestError("Асуултын явц буруу байна.", "INVALID_PROGRESS");
  }

  if (
    (value.stage === "baseline" || value.stage === "tailored") &&
    !isQuestion(value.question)
  ) {
    throw new OnboardingRequestError("Дараагийн асуулт олдсонгүй.", "QUESTION_MISSING");
  }

  return value as Snapshot;
}

async function readResponse(response: Response): Promise<Snapshot> {
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const errorBody = isObject(body) ? (body as ApiErrorBody) : null;
    throw new OnboardingRequestError(
      errorBody?.error || "Мэдээллийг хадгалж чадсангүй. Дахин оролдоно уу.",
      errorBody?.code,
    );
  }

  return parseSnapshot(body);
}

function parsePrivacyPreferences(value: unknown): PrivacyPreferences {
  if (!isObject(value) || !isObject(value.preferences)) {
    throw new OnboardingRequestError("Нууцлалын мэдээлэл буруу ирлээ.", "INVALID_RESPONSE");
  }

  const preferences = value.preferences;
  if (
    typeof preferences.assessmentConsent !== "boolean" ||
    (preferences.sharingLevel !== "private" &&
      preferences.sharingLevel !== "summary" &&
      preferences.sharingLevel !== "detailed")
  ) {
    throw new OnboardingRequestError("Нууцлалын мэдээлэл буруу ирлээ.", "INVALID_RESPONSE");
  }

  return {
    assessmentConsent: preferences.assessmentConsent,
    sharingLevel: preferences.sharingLevel,
  };
}

async function readPrivacyResponse(response: Response): Promise<PrivacyPreferences> {
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const errorBody = isObject(body) ? (body as ApiErrorBody) : null;
    throw new OnboardingRequestError(
      errorBody?.error || "Нууцлалын мэдээллийг хадгалж чадсангүй.",
      errorBody?.code,
    );
  }
  return parsePrivacyPreferences(body);
}

async function getPrivacy(signal?: AbortSignal): Promise<PrivacyPreferences> {
  const response = await fetch("/api/privacy", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  return readPrivacyResponse(response);
}

async function getInitialState(signal?: AbortSignal): Promise<{
  privacy: PrivacyPreferences;
  snapshot: Snapshot | null;
}> {
  const privacy = await getPrivacy(signal);
  if (!privacy.assessmentConsent) return { privacy, snapshot: null };
  return { privacy, snapshot: await getBootstrap(signal) };
}

async function getBootstrap(signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch("/api/onboarding/bootstrap", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });

  return readResponse(response);
}

function progressLabel(snapshot: Snapshot): string {
  if (snapshot.stage === "baseline") {
    return `Эхний зураглал: ${snapshot.baselineAnswered} / ${BASELINE_TOTAL} · Нийт ${snapshot.baselineAnswered} / 115`;
  }
  if (snapshot.stage === "tailored" || snapshot.stage === "ready_to_complete") {
    return `Танд зориулсан асуулт: ${snapshot.tailoredAnswered} / ${TAILORED_TOTAL} · Нийт ${BASELINE_TOTAL + snapshot.tailoredAnswered} / 115`;
  }
  if (snapshot.stage === "completed") return "Амжилтын зураглал бүрэн дууссан";
  return "Эхний 15 хариултыг нэгтгэж байна";
}

function progressValue(snapshot: Snapshot): number {
  if (snapshot.stage === "baseline" || snapshot.stage === "analysis") {
    return snapshot.baselineAnswered;
  }
  return snapshot.tailoredAnswered;
}

function progressMax(snapshot: Snapshot): number {
  return snapshot.stage === "baseline" || snapshot.stage === "analysis"
    ? BASELINE_TOTAL
    : TAILORED_TOTAL;
}

function LoadingScreen() {
  return (
    <section className={styles.stateCard} aria-labelledby="onboarding-loading-title">
      <div className={styles.loader} aria-hidden="true" />
      <p className={styles.eyebrow}>PERSONAL SUCCESS MAP</p>
      <h1 id="onboarding-loading-title">Таны асуултыг бэлдэж байна</h1>
      <p>Өмнөх хариулт байвал яг зогссон газраас тань үргэлжлүүлнэ.</p>
    </section>
  );
}

function PrivacyScreen({
  firstName,
  accepting,
  error,
  pauseHref,
  onAccept,
}: {
  firstName: string;
  accepting: boolean;
  error: string | null;
  pauseHref: string;
  onAccept: () => void;
}) {
  return (
    <section className={styles.privacyCard} aria-labelledby="privacy-title">
      <div className={styles.privacyIcon} aria-hidden="true">✓</div>
      <p className={styles.eyebrow}>ЭХЛЭХИЙН ӨМНӨ</p>
      <h1 id="privacy-title">{firstName}, таны хувийн Success Map</h1>
      <p className={styles.privacyLead}>
        Эхлээд 15 үндсэн, дараа нь зөвхөн танд тохирсон 100 асуултыг нэг нэгээр нь
        асууна. Та хүссэн үедээ түр гараад яг зогссон газраасаа үргэлжлүүлж болно.
      </p>

      <ul className={styles.privacyList}>
        <li>
          <strong>Танд хэрэгтэй guide гаргана</strong>
          <span>Сургалт, контент болон social хөтлөлтийн дараагийн алхмыг тохируулна.</span>
        </li>
        <li>
          <strong>Эхэндээ зөвхөн танд харагдана</strong>
          <span>Coach-д хуваалцах эсэхээ та дараа нь өөрөө сонгоно.</span>
        </li>
        <li>
          <strong>Энэ бол онош биш</strong>
          <span>Таны өөрийн хариултад суурилсан, бодит үйлдэлтэй тулгаж ашиглах ажлын зураглал.</span>
        </li>
      </ul>

      {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}

      <button
        className={styles.primaryButton}
        type="button"
        disabled={accepting}
        onClick={onAccept}
      >
        {accepting ? "Бэлдэж байна…" : "Зөвшөөрч байна — 15 асуултаа эхлүүлэх"}
      </button>
      <Link className={styles.textLink} href={pauseHref}>Одоохондоо гарах</Link>
    </section>
  );
}

function ErrorScreen({
  message,
  onRetry,
  escapeHref,
}: {
  message: string;
  onRetry: () => void;
  escapeHref: string;
}) {
  return (
    <section className={styles.stateCard} aria-labelledby="onboarding-error-title">
      <div className={styles.stateIcon} aria-hidden="true">!</div>
      <p className={styles.eyebrow}>ХОЛБОЛТ ТАСАЛДЛАА</p>
      <h1 id="onboarding-error-title">Асуултыг нээж чадсангүй</h1>
      <p role="alert">{message}</p>
      <button className={styles.primaryButton} type="button" onClick={onRetry}>
        Дахин оролдох
      </button>
      <Link className={styles.textLink} href={escapeHref}>
        Түр гарах
      </Link>
    </section>
  );
}

function AnalysisScreen({
  stalled,
  onRetry,
}: {
  stalled: boolean;
  onRetry: () => void;
}) {
  return (
    <section className={styles.stateCard} aria-labelledby="analysis-title" aria-live="polite">
      <div className={styles.analysisMark} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className={styles.eyebrow}>ЭХНИЙ ЗУРАГЛАЛ БЭЛЭН</p>
      <h1 id="analysis-title">15 хариултыг тань нэгтгэж байна</h1>
      <p>
        Одоо таны зорилго, боломжит цаг, ажиллах хэв маягт тохирсон 100 асуултыг
        нэг нэгээр нь бэлдэнэ.
      </p>
      <ul className={styles.analysisList} aria-label="Шинжилж буй хэсгүүд">
        <li><span aria-hidden="true">✓</span> Зорилго ба одоогийн үе шат</li>
        <li><span aria-hidden="true">✓</span> Контент ба харилцааны хэв маяг</li>
        <li><span aria-hidden="true">✓</span> Суралцах болон хийх ажлын хэмнэл</li>
      </ul>
      {stalled ? (
        <button className={styles.primaryButton} type="button" onClick={onRetry}>
          Үргэлжлүүлэх
        </button>
      ) : (
        <p className={styles.liveStatus}>Дараагийн алхмыг бэлдэж байна…</p>
      )}
    </section>
  );
}

function FinalizingScreen({
  completing,
  error,
  onComplete,
}: {
  completing: boolean;
  error: string | null;
  onComplete: () => void;
}) {
  return (
    <section className={styles.stateCard} aria-labelledby="finalizing-title">
      {completing ? (
        <div className={styles.loader} aria-hidden="true" />
      ) : (
        <div className={styles.completeIcon} aria-hidden="true">100</div>
      )}
      <p className={styles.eyebrow}>100 / 100</p>
      <h1 id="finalizing-title">
        {completing ? "Таны зураглалыг дуусгаж байна" : "Бүх хариулт хадгалагдлаа"}
      </h1>
      <p>
        {completing
          ? "Хариултуудад үндэслэсэн guide-г нэгтгэж байна."
          : "Одоо хувийн Success Map болон guide-аа үүсгээрэй."}
      </p>
      {error ? (
        <>
          <p className={styles.inlineError} role="alert">{error}</p>
          <button className={styles.primaryButton} type="button" onClick={onComplete}>
            Дахин оролдох
          </button>
        </>
      ) : completing ? null : (
        <button className={styles.primaryButton} type="button" onClick={onComplete}>
          Success Map үүсгэх
        </button>
      )}
    </section>
  );
}

function CompletionScreen({
  firstName,
  completionHref,
}: {
  firstName: string;
  completionHref: string;
}) {
  return (
    <section className={styles.stateCard} aria-labelledby="completion-title">
      <div className={styles.completeIcon} aria-hidden="true">✓</div>
      <p className={styles.eyebrow}>SUCCESS MAP БЭЛЭН</p>
      <h1 id="completion-title">{firstName}, та бүх асуултаа дуусгалаа</h1>
      <p>
        Таны хариултыг дараагийн сургалт, контент болон social хөтлөлтийн guide-д
        ашиглана. Зөвлөмжөө дараа нь шинэчилж болно.
      </p>
      <Link className={styles.primaryLink} href={completionHref}>
        {completionHref === "/my-guide" ? "Өөрийн guide-г нээх" : "Access төлвөө харах"}
      </Link>
    </section>
  );
}

function DisplayModePicker({
  mode,
  onChange,
}: {
  mode: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}) {
  return (
    <div className={styles.modePicker} role="group" aria-label="Асуултын харагдац">
      {displayModes.map((item) => (
        <button
          key={item.value}
          type="button"
          className={mode === item.value ? styles.activeMode : undefined}
          aria-pressed={mode === item.value}
          title={item.description}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function OptionCopy({ option, guided }: { option: QuestionOption; guided: boolean }) {
  return (
    <span className={styles.optionCopy}>
      <strong>{option.label}</strong>
      {guided && option.description ? <small>{option.description}</small> : null}
    </span>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
  guided,
  labelledBy,
}: {
  question: Question;
  value: AnswerValue | null;
  onChange: (value: AnswerValue | null) => void;
  guided: boolean;
  labelledBy: string;
}) {
  if (question.responseType === "single_choice") {
    return (
      <div className={styles.optionList}>
        {(question.options ?? []).map((option) => (
          <label className={styles.option} key={option.value}>
            <input
              type="radio"
              name={`answer-${question.id}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.controlMark} aria-hidden="true" />
            <OptionCopy option={option} guided={guided} />
          </label>
        ))}
      </div>
    );
  }

  if (question.responseType === "multi_choice") {
    const selected = Array.isArray(value) ? value : [];
    const maximum = question.maxSelections;
    const maximumReached = maximum !== undefined && selected.length >= maximum;

    return (
      <div className={styles.optionList}>
        {(question.options ?? []).map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label className={styles.option} key={option.value}>
              <input
                type="checkbox"
                name={`answer-${question.id}`}
                value={option.value}
                checked={checked}
                disabled={!checked && maximumReached}
                onChange={() => {
                  onChange(
                    checked
                      ? selected.filter((item) => item !== option.value)
                      : [...selected, option.value],
                  );
                }}
              />
              <span className={styles.checkboxMark} aria-hidden="true">✓</span>
              <OptionCopy option={option} guided={guided} />
            </label>
          );
        })}
        {maximum !== undefined ? (
          <p className={styles.selectionNote} aria-live="polite">
            {selected.length} / {maximum} сонгосон
          </p>
        ) : null}
      </div>
    );
  }

  if (question.responseType === "scale") {
    const minimum = question.min ?? 1;
    const maximum = question.max ?? 5;
    const scaleValues = Array.from(
      { length: Math.max(0, maximum - minimum + 1) },
      (_, index) => minimum + index,
    );

    return (
      <div>
        <div className={styles.scaleLabels}>
          <span>{question.minLabel ?? "Бага"}</span>
          <span>{question.maxLabel ?? "Их"}</span>
        </div>
        <div className={styles.scaleList}>
          {scaleValues.map((scaleValue) => (
            <label key={scaleValue} className={styles.scaleOption}>
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={scaleValue}
                aria-label={
                  scaleValue === minimum
                    ? `${scaleValue} — ${question.minLabel ?? "Бага"}`
                    : scaleValue === maximum
                      ? `${scaleValue} — ${question.maxLabel ?? "Их"}`
                      : String(scaleValue)
                }
                checked={value === scaleValue}
                onChange={() => onChange(scaleValue)}
              />
              <span>{scaleValue}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (question.responseType === "number") {
    return (
      <input
        className={styles.numberInput}
        type="number"
        inputMode="numeric"
        aria-labelledby={labelledBy}
        min={question.min}
        max={question.max}
        value={typeof value === "number" ? value : ""}
        placeholder={question.placeholder}
        onChange={(event) => {
          const nextValue = event.target.valueAsNumber;
          onChange(Number.isNaN(nextValue) ? null : nextValue);
        }}
      />
    );
  }

  const textValue = typeof value === "string" ? value : "";
  if (question.responseType === "long_text") {
    return (
      <textarea
        className={styles.textArea}
        aria-labelledby={labelledBy}
        value={textValue}
        maxLength={question.maxLength ?? 1000}
        placeholder={question.placeholder ?? "Өөрийн үгээр бичээрэй"}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className={styles.textInput}
      type="text"
      aria-labelledby={labelledBy}
      value={textValue}
      maxLength={question.maxLength ?? 240}
      placeholder={question.placeholder ?? "Хариултаа бичээрэй"}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function hasValidAnswer(question: Question, value: AnswerValue | null): boolean {
  if (value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    if (question.min !== undefined && value < question.min) return false;
    if (question.max !== undefined && value > question.max) return false;
    return true;
  }
  const minimum = question.minSelections ?? 1;
  const maximum = question.maxSelections ?? Number.POSITIVE_INFINITY;
  return value.length >= minimum && value.length <= maximum;
}

function QuestionCard({
  question,
  mode,
  submitting,
  requestError,
  onAnswer,
}: {
  question: Question;
  mode: DisplayMode;
  submitting: boolean;
  requestError: string | null;
  onAnswer: (answer: AnswerPayload) => Promise<void>;
}) {
  const [value, setValue] = useState<AnswerValue | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questionLabelId = `assessment-question-${question.id}`;
  const guided = mode === "guided";
  const valid = hasValidAnswer(question, value);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || value === null || submitting) return;
    await onAnswer({ kind: "answer", value });
  }

  return (
    <form className={styles.questionCard} onSubmit={submit}>
      <fieldset disabled={submitting}>
        <legend className={styles.srOnly}>{question.prompt}</legend>
        <p className={styles.questionNumber}>
          {question.phase === "baseline" ? "Эхний зураглал" : "Танд зориулсан асуулт"}
          <span aria-hidden="true"> · </span>
          {question.position} / {question.phase === "baseline" ? BASELINE_TOTAL : TAILORED_TOTAL}
        </p>
        <h1 id={questionLabelId} ref={headingRef} tabIndex={-1}>{question.prompt}</h1>
        {guided && question.helpText ? (
          <p className={styles.helpText}>{question.helpText}</p>
        ) : null}

        <div className={styles.answerArea}>
          <QuestionInput
            question={question}
            value={value}
            onChange={setValue}
            guided={guided}
            labelledBy={questionLabelId}
          />
        </div>

        {question.phase === "tailored" && question.position > 1 && (question.position - 1) % 20 === 0 ? (
          <p className={styles.breakReminder} role="status">
            Та 20 асуулт ахилаа. Ядарсан бол “Түр гарах” товчоор завсарлаад яг эндээсээ үргэлжлүүлж болно.
          </p>
        ) : null}

        {requestError ? (
          <p className={styles.inlineError} role="alert">{requestError}</p>
        ) : null}

        <div className={styles.formActions}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={!valid || submitting}
          >
            {submitting ? "Хадгалж байна…" : "Хариултаа хадгалах"}
          </button>
          <button
            className={styles.skipButton}
            type="button"
            disabled={submitting}
            onClick={() => void onAnswer({ kind: "skip", reason: "not_sure" })}
          >
            Одоохондоо мэдэхгүй
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export function OnboardingFlow({
  firstName,
  pauseHref,
  completionHref,
}: {
  firstName: string;
  pauseHref: string;
  completionHref: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [acceptingConsent, setAcceptingConsent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<DisplayMode>("guided");
  const [analysisPreview, setAnalysisPreview] = useState(false);
  const [analysisStalled, setAnalysisStalled] = useState(false);
  const [analysisCycle, setAnalysisCycle] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const pendingAnswerRef = useRef<{
    key: string;
    clientAnswerId: string;
  } | null>(null);
  const completingSessionRef = useRef<string | null>(null);

  const loadInitial = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    setLoadError(null);

    try {
      const initial = await getInitialState();
      setPrivacy(initial.privacy);
      setSnapshot(initial.snapshot);
      setAnalysisStalled(false);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Success Map-ийг нээж чадсангүй.",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const loadBootstrap = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    setLoadError(null);

    try {
      const nextSnapshot = await getBootstrap();
      setSnapshot(nextSnapshot);
      setAnalysisStalled(false);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Асуултыг ачаалж чадсангүй.",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getInitialState(controller.signal)
      .then((initial) => {
        setPrivacy(initial.privacy);
        setSnapshot(initial.snapshot);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Асуултыг ачаалж чадсангүй.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (snapshot?.stage !== "analysis") return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const poll = async () => {
      attempts += 1;
      try {
        const nextSnapshot = await getBootstrap();
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setLoadError(null);
        if (nextSnapshot.stage === "analysis" && attempts < 8) {
          timer = window.setTimeout(poll, 1500);
        } else if (nextSnapshot.stage === "analysis") {
          setAnalysisStalled(true);
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Шинжилгээг үргэлжлүүлж чадсангүй.");
        setAnalysisStalled(true);
      }
    };

    timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [analysisCycle, snapshot?.stage]);

  const completeOnboarding = useCallback(async (sessionId: string) => {
    if (completingSessionRef.current === sessionId) return;
    completingSessionRef.current = sessionId;
    setCompleting(true);
    setCompletionError(null);

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      setSnapshot(await readResponse(response));
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : "Зураглалыг дуусгаж чадсангүй.",
      );
      completingSessionRef.current = null;
    } finally {
      setCompleting(false);
    }
  }, []);

  function changeMode(nextMode: DisplayMode) {
    setMode(nextMode);
  }

  async function acceptAssessment() {
    if (acceptingConsent) return;
    setAcceptingConsent(true);
    setConsentError(null);

    let acceptedPrivacy: PrivacyPreferences;
    try {
      const response = await fetch("/api/privacy", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "accept_assessment" }),
      });
      acceptedPrivacy = await readPrivacyResponse(response);
      if (!acceptedPrivacy.assessmentConsent) {
        throw new OnboardingRequestError(
          "Зөвшөөрлийг хадгалж чадсангүй.",
          "CONSENT_NOT_SAVED",
        );
      }
    } catch (error) {
      setConsentError(
        error instanceof Error ? error.message : "Зөвшөөрлийг хадгалж чадсангүй.",
      );
      setAcceptingConsent(false);
      return;
    }

    try {
      const nextSnapshot = await getBootstrap();
      setPrivacy(acceptedPrivacy);
      setSnapshot(nextSnapshot);
      setLoadError(null);
    } catch (error) {
      setPrivacy(acceptedPrivacy);
      setLoadError(
        error instanceof Error ? error.message : "Асуултыг ачаалж чадсангүй.",
      );
    } finally {
      setAcceptingConsent(false);
    }
  }

  async function answerQuestion(answer: AnswerPayload) {
    const question = snapshot?.question;
    if (!snapshot || !question || submitting) return;

    const answerKey = `${question.id}:${JSON.stringify(answer)}`;
    if (pendingAnswerRef.current?.key !== answerKey) {
      pendingAnswerRef.current = {
        key: answerKey,
        clientAnswerId: window.crypto.randomUUID(),
      };
    }

    setSubmitting(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/onboarding/answers", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: snapshot.sessionId,
          questionId: question.id,
          phase: question.phase,
          clientAnswerId: pendingAnswerRef.current.clientAnswerId,
          answer,
        }),
      });
      const nextSnapshot = await readResponse(response);
      pendingAnswerRef.current = null;
      if (
        question.phase === "baseline" &&
        question.position === BASELINE_TOTAL &&
        nextSnapshot.stage === "tailored"
      ) {
        setAnalysisPreview(true);
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        setAnalysisPreview(false);
      }
      setSnapshot(nextSnapshot);
      if (nextSnapshot.stage === "ready_to_complete") {
        await completeOnboarding(nextSnapshot.sessionId);
      }
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Хариултыг хадгалж чадсангүй.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className={styles.shell}><LoadingScreen /></main>;
  }

  if (loadError && !snapshot) {
    return (
      <main className={styles.shell}>
        <ErrorScreen message={loadError} onRetry={() => void loadInitial(true)} escapeHref={pauseHref} />
      </main>
    );
  }

  if (privacy && !privacy.assessmentConsent) {
    return (
      <main className={styles.shell}>
        <PrivacyScreen
          firstName={firstName}
          accepting={acceptingConsent}
          error={consentError}
          pauseHref={pauseHref}
          onAccept={() => void acceptAssessment()}
        />
      </main>
    );
  }

  if (analysisPreview) {
    return (
      <main className={styles.shell}>
        <AnalysisScreen stalled={false} onRetry={() => undefined} />
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className={styles.shell}>
        <ErrorScreen
          message="Onboarding мэдээлэл олдсонгүй."
          onRetry={() => void loadBootstrap(true)}
          escapeHref={pauseHref}
        />
      </main>
    );
  }

  if (snapshot.stage === "analysis") {
    return (
      <main className={styles.shell}>
        <AnalysisScreen
          stalled={analysisStalled || Boolean(loadError)}
          onRetry={() => {
            setAnalysisStalled(false);
            setLoadError(null);
            setAnalysisCycle((current) => current + 1);
          }}
        />
      </main>
    );
  }

  if (snapshot.stage === "ready_to_complete") {
    return (
      <main className={styles.shell}>
        <FinalizingScreen
          completing={completing}
          error={completionError}
          onComplete={() => void completeOnboarding(snapshot.sessionId)}
        />
      </main>
    );
  }

  if (snapshot.stage === "completed") {
    return (
      <main className={styles.shell}>
        <CompletionScreen firstName={firstName} completionHref={completionHref} />
      </main>
    );
  }

  const question = snapshot.question;
  if (!question) {
    return (
      <main className={styles.shell}>
        <ErrorScreen
          message="Дараагийн асуулт олдсонгүй."
          onRetry={() => void loadBootstrap(true)}
          escapeHref={pauseHref}
        />
      </main>
    );
  }

  return (
    <main className={styles.shell} data-mode={mode}>
      <div className={styles.pageFrame}>
        <header className={styles.header}>
          <Link className={styles.brand} href={pauseHref} aria-label="Onboarding-оос түр гарах">
            <span className={styles.brandMark} aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            <span>
              <strong>inSuccess</strong>
              <small>SUCCESS MAP</small>
            </span>
          </Link>
          <div className={styles.headerActions}>
            <DisplayModePicker mode={mode} onChange={changeMode} />
            <Link className={styles.pauseLink} href={pauseHref}>
              Түр гарах
            </Link>
          </div>
        </header>

        <section className={styles.progressSection} aria-label="Асуултын явц">
          <div>
            <p>{progressLabel(snapshot)}</p>
            <span>Хариултаа хадгалах бүрд таны явц хадгалагдана</span>
          </div>
          <strong aria-hidden="true">
            {progressValue(snapshot)} / {progressMax(snapshot)}
          </strong>
          <progress
            value={progressValue(snapshot)}
            max={progressMax(snapshot)}
            aria-label={progressLabel(snapshot)}
          />
        </section>

        <QuestionCard
          key={question.id}
          question={question}
          mode={mode}
          submitting={submitting}
          requestError={requestError}
          onAnswer={answerQuestion}
        />

        <footer className={styles.footer}>
          <p>
            Энд зөв, буруу хариулт байхгүй. Танд бодитоор тохирох хариултыг сонгоорой.
          </p>
          <span aria-live="polite" className={styles.srOnly}>
            {submitting ? "Хариултыг хадгалж байна" : ""}
          </span>
        </footer>
      </div>
    </main>
  );
}
