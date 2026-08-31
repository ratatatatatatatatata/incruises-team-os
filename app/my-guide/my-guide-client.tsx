"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./my-guide.module.css";

type UnknownRecord = Record<string, unknown>;

type EvidenceItem = {
  label: string;
  value: string;
  source: string | null;
  status: string | null;
  verifiedAt: string | null;
};

type PlanItem = {
  label: string;
  title: string;
  detail: string;
  status: string | null;
};

type AcademyItem = {
  title: string;
  progress: number | null;
  nextLesson: string | null;
};

type GuideProfile = {
  displayName: string | null;
  headline: string | null;
  summary: string | null;
  confidence: number | null;
  confidenceLabel: string | null;
  strengths: string[];
  growthEdges: string[];
  evidence: EvidenceItem[];
  limitations: string[];
  boardTrack: {
    appropriate: boolean;
    reason: string | null;
    currentStage: string | null;
    target: string | null;
    gaps: string[];
  } | null;
  sevenDay: PlanItem[];
  thirtyDay: PlanItem[];
  sixtyDay: PlanItem[];
  ninetyDay: PlanItem[];
  academy: AcademyItem[];
  contentGuide: {
    themes: string[];
    channels: string[];
    guardrails: string[];
  };
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstValue(record: UnknownRecord | null, keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function firstString(record: UnknownRecord | null, keys: string[]): string | null {
  const value = firstValue(record, keys);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const record = asRecord(item);
    const text = firstString(record, ["text", "label", "title", "value", "detail", "description"]);
    return text ? [text] : [];
  });
}

function normalizedPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return Math.round(Math.min(100, Math.max(0, percent)));
}

function normalizeEvidence(value: unknown): EvidenceItem[] {
  return asArray(value).flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ label: `Нотолгоо ${index + 1}`, value: item.trim(), source: null, status: null, verifiedAt: null }];
    }

    const record = asRecord(item);
    const label = firstString(record, ["label", "title", "claim", "field"]);
    const evidenceValue = firstString(record, ["value", "evidence", "finding", "detail", "description"]);
    if (!label && !evidenceValue) return [];

    return [
      {
        label: label ?? `Нотолгоо ${index + 1}`,
        value: evidenceValue ?? "Тайлбар ирээгүй",
        source: firstString(record, ["source", "sourceLabel", "source_label"]),
        status: firstString(record, ["status", "confidence", "evidenceStatus", "evidence_status"]),
        verifiedAt: firstString(record, ["verifiedAt", "verified_at", "date"]),
      },
    ];
  });
}

function normalizePlanItems(value: unknown, defaultPrefix: string): PlanItem[] {
  return asArray(value).flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ label: `${defaultPrefix} ${index + 1}`, title: item.trim(), detail: "", status: null }];
    }

    const record = asRecord(item);
    const title = firstString(record, ["title", "action", "label", "goal"]);
    const detail = firstString(record, ["detail", "description", "action", "task", "why", "outcome"]) ?? "";
    if (!title && !detail) return [];

    return [
      {
        label: firstString(record, ["day", "period", "week", "label"]) ?? `${defaultPrefix} ${index + 1}`,
        title: title ?? detail,
        detail: title ? detail : "",
        status: firstString(record, ["status", "state"]),
      },
    ];
  });
}

function normalizeProfile(payload: unknown): GuideProfile | null {
  const envelope = asRecord(payload);
  if (!envelope) return null;

  const candidate = asRecord(envelope.profile) ?? asRecord(envelope.data) ?? envelope;
  const success = asRecord(candidate.successProfile) ?? asRecord(candidate.success_profile) ?? candidate;
  const plan =
    asRecord(firstValue(candidate, ["plan", "successPlan", "success_plan"])) ??
    asRecord(firstValue(success, ["plan", "successPlan", "success_plan"]));
  const board = asRecord(firstValue(candidate, ["boardDirector", "board_director", "boardDirectorTrack", "board_director_track"]));
  const content = asRecord(firstValue(candidate, ["contentGuide", "content_guide", "contentSocialGuide", "content_social_guide"]));

  const confidenceValue = firstValue(success, ["confidence", "confidenceScore", "confidence_score"]);
  const confidence = normalizedPercent(confidenceValue);
  const evidence = normalizeEvidence(firstValue(success, ["evidence", "evidenceItems", "evidence_items"]));
  const limitations = stringList(firstValue(success, ["limitations", "limits", "unknowns"]));
  const strengths = stringList(firstValue(success, ["strengths", "strongSides", "strong_sides"]));
  const growthEdges = stringList(firstValue(success, ["growthEdges", "growth_edges", "developmentAreas", "development_areas"]));
  const sevenDay = normalizePlanItems(
    firstValue(plan, ["sevenDay", "seven_day", "sevenDayPlan", "seven_day_plan"]) ??
      firstValue(candidate, ["sevenDay", "seven_day", "sevenDayPlan", "seven_day_plan"]),
    "Өдөр",
  ).slice(0, 7);
  const thirtyDay = normalizePlanItems(firstValue(plan, ["thirty", "thirtyDay", "thirty_day"]), "Алхам");
  const sixtyDay = normalizePlanItems(firstValue(plan, ["sixty", "sixtyDay", "sixty_day"]), "Алхам");
  const ninetyDay = normalizePlanItems(firstValue(plan, ["ninety", "ninetyDay", "ninety_day"]), "Алхам");
  const academy = asArray(firstValue(candidate, ["academy", "academyGuide", "academy_guide"])).flatMap((item) => {
    const record = asRecord(item);
    const title = firstString(record, ["title", "level", "name"]);
    if (!title) return [];
    return [
      {
        title,
        progress: normalizedPercent(firstValue(record, ["progress", "completion", "completionPercent", "completion_percent"])),
        nextLesson: firstString(record, ["nextLesson", "next_lesson", "nextStep", "next_step"]),
      },
    ];
  });

  const hasContent = Boolean(
    firstString(success, ["headline", "title", "successHeadline", "success_headline"]) ||
      firstString(success, ["summary", "description", "successSummary", "success_summary"]) ||
      evidence.length ||
      limitations.length ||
      strengths.length ||
      growthEdges.length ||
      sevenDay.length ||
      thirtyDay.length ||
      sixtyDay.length ||
      ninetyDay.length ||
      academy.length ||
      content,
  );

  if (!hasContent) return null;

  return {
    displayName: firstString(candidate, ["displayName", "display_name", "name"]),
    headline: firstString(success, ["headline", "title", "successHeadline", "success_headline"]),
    summary: firstString(success, ["summary", "description", "successSummary", "success_summary"]),
    confidence,
    confidenceLabel:
      firstString(success, ["confidenceLabel", "confidence_label"]) ??
      (typeof confidenceValue === "string" ? confidenceValue : null),
    strengths,
    growthEdges,
    evidence,
    limitations,
    boardTrack: board
      ? {
          appropriate: board.appropriate === true,
          reason: firstString(board, ["reason", "rationale", "summary"]),
          currentStage: firstString(board, ["currentStage", "current_stage", "stage"]),
          target: firstString(board, ["target", "targetStage", "target_stage"]),
          gaps: stringList(firstValue(board, ["gaps", "focusAreas", "focus_areas", "requirements"])),
        }
      : null,
    sevenDay,
    thirtyDay,
    sixtyDay,
    ninetyDay,
    academy,
    contentGuide: {
      themes: stringList(firstValue(content, ["themes", "topics", "contentPillars", "content_pillars"])),
      channels: stringList(firstValue(content, ["channels", "recommendedChannels", "recommended_channels"])),
      guardrails: stringList(firstValue(content, ["guardrails", "rules", "limitations"])),
    },
  };
}

type ProfileLoadResult = {
  profile: GuideProfile | null;
  emptyReason: "assessment_incomplete" | "profile_not_ready" | null;
};

async function loadProfile(signal?: AbortSignal): Promise<ProfileLoadResult> {
  const response = await fetch("/api/profile", { cache: "no-store", signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    const record = asRecord(body);
    const code = firstString(record, ["code"]);
    if (response.status === 409 && (code === "assessment_incomplete" || code === "profile_not_ready")) {
      return { profile: null, emptyReason: code };
    }
    const message = firstString(record, ["error", "message"]);
    throw new Error(message ?? "Амжилтын профайлыг уншиж чадсангүй.");
  }
  return { profile: normalizeProfile((await response.json()) as unknown), emptyReason: null };
}

export function MyGuideClient() {
  const [profile, setProfile] = useState<GuideProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<ProfileLoadResult["emptyReason"]>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    loadProfile(controller.signal)
      .then((result) => {
        setProfile(result.profile);
        setEmptyReason(result.emptyReason);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Амжилтын профайлыг уншиж чадсангүй.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [attempt]);

  if (loading) {
    return (
      <section className={styles.stateCard} role="status" aria-live="polite" aria-busy="true">
        <span className={styles.loader} aria-hidden="true" />
        <h2>Таны замыг бэлдэж байна</h2>
        <p>Профайл, нотолгоо болон дараагийн алхмыг нэгтгэж байна.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={`${styles.stateCard} ${styles.errorState}`} role="alert">
        <span className={styles.stateIcon} aria-hidden="true">!</span>
        <h2>Профайл түр нээгдсэнгүй</h2>
        <p>{error}</p>
        <button type="button" onClick={retry}>Дахин оролдох</button>
      </section>
    );
  }

  if (!profile) {
    const assessmentIncomplete = emptyReason === "assessment_incomplete";
    return (
      <section className={styles.stateCard} aria-labelledby="empty-guide-title">
        <span className={styles.stateIcon} aria-hidden="true">＋</span>
        <h2 id="empty-guide-title">{assessmentIncomplete ? "Эхлээд Success Map-аа бүрдүүлнэ үү" : "Амжилтын профайл хараахан бэлэн биш"}</h2>
        <p>{assessmentIncomplete ? "15 + 100 асуултаа дуусгасны дараа нотолгоонд суурилсан хувийн зам энд гарна." : "Таны хариултыг боловсруулж дуусмагц хувийн зам энд гарна."}</p>
        <Link href={assessmentIncomplete ? "/onboarding" : "/assistant"}>{assessmentIncomplete ? "Success Map эхлэх" : "Дижитал ментор руу очих"}</Link>
      </section>
    );
  }

  const contentGuideIsEmpty =
    profile.contentGuide.themes.length === 0 &&
    profile.contentGuide.channels.length === 0 &&
    profile.contentGuide.guardrails.length === 0;

  return (
    <div className={styles.guide}>
      <section className={styles.profileGrid} aria-labelledby="success-profile-title">
        <article className={styles.profileCard}>
          <div className={styles.cardEyebrow}>SUCCESS PROFILE</div>
          <h2 id="success-profile-title">{profile.headline ?? `${profile.displayName ?? "Таны"} амжилтын профайл`}</h2>
          <p>{profile.summary ?? "Профайлын тайлбар хараахан ирээгүй байна."}</p>
          {profile.strengths.length || profile.growthEdges.length ? (
            <div className={styles.profileHighlights}>
              {profile.strengths.length ? <div><strong>Давуу тал</strong><ul>{profile.strengths.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
              {profile.growthEdges.length ? <div><strong>Хөгжүүлэх тал</strong><ul>{profile.growthEdges.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            </div>
          ) : null}
          <div className={styles.confidenceBlock}>
            <div>
              <strong>Итгэлцлийн түвшин</strong>
              <span>{profile.confidenceLabel ?? (profile.confidence === null ? "Оноо хараахан гараагүй" : `${profile.confidence}%`)}</span>
            </div>
            {profile.confidence !== null ? (
              <progress max="100" value={profile.confidence} aria-label={`Профайлын итгэлцэл ${profile.confidence} хувь`} />
            ) : null}
          </div>
        </article>

        <article className={styles.evidenceCard}>
          <div className={styles.cardHeading}>
            <div>
              <div className={styles.cardEyebrow}>EVIDENCE</div>
              <h2>Юунд тулгуурласан бэ?</h2>
            </div>
            <span>{profile.evidence.length}</span>
          </div>
          {profile.evidence.length ? (
            <ul className={styles.evidenceList}>
              {profile.evidence.map((item, index) => (
                <li key={`${item.label}-${index}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.value}</p>
                    {item.source || item.verifiedAt ? (
                      <small>{[item.source, item.verifiedAt].filter(Boolean).join(" · ")}</small>
                    ) : null}
                  </div>
                  {item.status ? <span>{item.status}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.inlineEmpty}>Нотолгооны жагсаалт хараахан ирээгүй байна.</p>
          )}
        </article>
      </section>

      <section className={styles.limitations} aria-labelledby="limitations-title">
        <div>
          <span aria-hidden="true">i</span>
          <div>
            <h2 id="limitations-title">Хязгаарлалт ба тодорхойгүй зүйл</h2>
            <p>Энэ зөвлөмж нь байгаа мэдээллээр чиглүүлнэ; цол, орлого, үр дүнг батлахгүй.</p>
          </div>
        </div>
        {profile.limitations.length ? (
          <ul>{profile.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        ) : (
          <p>Нэмэлт хязгаарлалт тэмдэглэгдээгүй байна.</p>
        )}
      </section>

      {profile.boardTrack?.appropriate === true ? (
        <section className={styles.boardTrack} aria-labelledby="board-track-title">
          <div>
            <div className={styles.cardEyebrow}>BOARD DIRECTOR TRACK</div>
            <h2 id="board-track-title">Board Director зорилгын боломжит хөгжлийн зам</h2>
            <p>{profile.boardTrack.reason ?? "Таны self-report хариулт энэ чиглэлийг боломжит хөгжлийн зам гэж тэмдэглэсэн; албан eligibility эсвэл үр дүнгийн баталгаа биш."}</p>
          </div>
          <dl>
            {profile.boardTrack.currentStage ? <div><dt>Одоогийн шат</dt><dd>{profile.boardTrack.currentStage}</dd></div> : null}
            {profile.boardTrack.target ? <div><dt>Зорилтот шат</dt><dd>{profile.boardTrack.target}</dd></div> : null}
          </dl>
          {profile.boardTrack.gaps.length ? (
            <div className={styles.boardGaps}>
              <strong>Одоо хөгжүүлэх зүйлс</strong>
              <ul>{profile.boardTrack.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.planSection} aria-labelledby="seven-day-title">
        <div className={styles.sectionHeading}>
          <div>
            <div className={styles.cardEyebrow}>START SMALL</div>
            <h2 id="seven-day-title">Дараагийн 7 хоног</h2>
          </div>
          <Link href="/assistant">Өнөөдрийн алхмаа асуух →</Link>
        </div>
        {profile.sevenDay.length ? (
          <ol className={styles.sevenDayList}>
            {profile.sevenDay.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <span>{item.label}</span>
                <div><strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}</div>
                {item.status ? <small>{item.status}</small> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.sectionEmpty}>7 хоногийн төлөвлөгөө хараахан үүсээгүй байна.</p>
        )}
      </section>

      <section className={styles.longPlan} aria-labelledby="long-plan-title">
        <div className={styles.sectionHeading}>
          <div>
            <div className={styles.cardEyebrow}>YOUR ROADMAP</div>
            <h2 id="long-plan-title">30 / 60 / 90 хоног</h2>
          </div>
        </div>
        <div className={styles.periodGrid}>
          <PeriodCard period="30" title="Сууриа тогтоох" items={profile.thirtyDay} />
          <PeriodCard period="60" title="Хэмнэлээ бататгах" items={profile.sixtyDay} />
          <PeriodCard period="90" title="Дараагийн шат" items={profile.ninetyDay} />
        </div>
      </section>

      <section className={styles.toolsGrid}>
        <article className={styles.toolCard} aria-labelledby="academy-guide-title">
          <div className={styles.cardEyebrow}>ACADEMY GUIDE</div>
          <h2 id="academy-guide-title">Сургалтын дараагийн алхам</h2>
          {profile.academy.length ? (
            <ul className={styles.academyList}>
              {profile.academy.map((item) => (
                <li key={item.title}>
                  <div><strong>{item.title}</strong>{item.nextLesson ? <span>{item.nextLesson}</span> : null}</div>
                  {item.progress !== null ? <b>{item.progress}%</b> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.inlineEmpty}>Academy зөвлөмж хараахан ирээгүй байна.</p>
          )}
        </article>

        <article className={styles.toolCard} aria-labelledby="content-guide-title">
          <div className={styles.cardEyebrow}>CONTENT + SOCIAL</div>
          <h2 id="content-guide-title">Аюулгүй контентын чиглэл</h2>
          {contentGuideIsEmpty ? (
            <p className={styles.inlineEmpty}>Контентын хувийн зөвлөмж хараахан ирээгүй байна.</p>
          ) : (
            <div className={styles.contentGroups}>
              <GuideGroup title="Сэдэв" items={profile.contentGuide.themes} />
              <GuideGroup title="Суваг" items={profile.contentGuide.channels} />
              <GuideGroup title="Анхаарах дүрэм" items={profile.contentGuide.guardrails} />
            </div>
          )}
          <div className={styles.noPublish}>Автоматаар нийтлэхгүй · Хүн заавал шалгана</div>
        </article>
      </section>
    </div>
  );
}

function PeriodCard({ period, title, items }: { period: string; title: string; items: PlanItem[] }) {
  return (
    <article className={styles.periodCard}>
      <div><strong>{period}</strong><span>хоног</span></div>
      <h3>{title}</h3>
      {items.length ? (
        <ul>{items.map((item, index) => <li key={`${item.title}-${index}`}>{item.title}</li>)}</ul>
      ) : (
        <p>Төлөвлөгөө хараахан ирээгүй.</p>
      )}
    </article>
  );
}

function GuideGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
