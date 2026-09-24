"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "./brand";
import { learningLevels, officialSources, type WorkspacePayload } from "./team-os-data";
import { AdminInvitations } from "./admin-invitations";
import { actionSteps, plainMongolianText, readableAnswerExcerpt } from "@/lib/success-map/presentation";

type Section = "overview" | "my-path" | "academy" | "content" | "members" | "vault" | "users";

const emptyWorkspace: WorkspacePayload = {
  first30DayEnabled: false,
  mentorLoopEnabled: false,
  viewer: { userId: "", role: "user", canReview: false, canRecordCorporateApproval: false },
  progress: [],
  lessons: [],
  drafts: [],
  memberTasks: [],
  users: [],
  supportMembers: [],
  myCheckins: [],
  coachNotes: [],
  activeAction: null,
  myActionHistory: [],
  supportRequests: [],
  academyPractices: [],
  rankClaims: [],
  successMap: null,
};

const navItems: Array<{ id: Section; label: string; short: string; symbol: string }> = [
  { id: "overview", label: "Хяналтын төв", short: "Төв", symbol: "⌂" },
  { id: "my-path", label: "Миний зам", short: "Зам", symbol: "◉" },
  { id: "academy", label: "Сургалт", short: "Сургалт", symbol: "▤" },
  { id: "content", label: "Нийтлэл бэлдэх", short: "Нийтлэл", symbol: "✦" },
  { id: "members", label: "Багийн дэмжлэг", short: "Баг", symbol: "◎" },
  { id: "vault", label: "Албан эх сурвалж", short: "Эх сурвалж", symbol: "◇" },
  { id: "users", label: "Хэрэглэгчид", short: "Хүмүүс", symbol: "♙" },
];

const statusLabels: Record<string, string> = {
  draft: "Ноорог",
  review: "Хяналтад",
  approved: "Өмнөх бүртгэл · нотолгоо дутуу",
  internal_approved: "Дотоод хяналт тэнцсэн",
  corporate_approved: "Баталгааны эх сурвалж бүртгэгдсэн",
  source_allowed: "Хяналтад ашиглаж болох эх",
  archived: "Архив",
};

const SUPPORT_SHARING_DESCRIPTION = "Хуваалцах зөвшөөрөл асаалттай үед зорилго, боломжит цаг, гол саад, хүссэн тусламжийн 4 хариултыг бичсэнээр нь харуулна. Одоогийн нөхцөлийн хариулт болон хувийн хиймэл оюуны ярианы түүхийг хуваалцахгүй.";

function roleLabel(role: string) {
  return ({ user: "Гишүүн", builder: "Баг бүрдүүлэгч", coach: "Дасгалжуулагч", director: "Багийн удирдагч", admin: "Админ" } as Record<string, string>)[role] ?? "Гишүүн";
}

function actionStatusLabel(status: string) {
  return ({ proposed: "Санал болгосон", accepted: "Хийхээр сонгосон", started: "Хийж байна", done: "Дууссан", blocked: "Тусламж хэрэгтэй", paused: "Түр завсарласан", superseded: "Шинэ ажлаар сольсон" } as Record<string, string>)[status] ?? "Төлөвийг шалгана уу";
}

function rankStatusLabel(status: string) {
  return ({ pending: "Шалгуулахаар бүртгэсэн", verified: "Нотолгоог шалгасан", rejected: "Нотолгоо хангалтгүй", conflict: "Мэдээлэл зөрүүтэй", expired: "Хугацаа дууссан" } as Record<string, string>)[status] ?? "Төлөвийг шалгана уу";
}

function rankSourceLabel(source: string) {
  return ({ official_back_office: "Компанийн албан систем", official_document: "Албан баримт", other_official: "Бусад албан эх" } as Record<string, string>)[source] ?? "Эх сурвалжийг шалгана уу";
}

function channelLabel(channel: string) {
  return ({ "Short video": "Богино бичлэг", FAQ: "Түгээмэл асуулт", Message: "Зурвас" } as Record<string, string>)[channel] ?? channel;
}

function localDateTimeValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function fetchWorkspace(): Promise<WorkspacePayload> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok) throw new Error("Мэдээллийг авч чадсангүй. Дахин ачаална уу.");
  return (await response.json()) as WorkspacePayload;
}

export function TeamOsApp({ user, initialSection }: { user: { name: string; email: string; role: string }; initialSection?: string }) {
  const [section, setSection] = useState<Section>(() => {
    const allowed = navItems.some((item) => item.id === initialSection)
      && (initialSection !== "users" || user.role === "admin")
      && (initialSection !== "members" || user.role !== "user");
    return allowed ? initialSection as Section : "overview";
  });
  const [workspace, setWorkspace] = useState<WorkspacePayload>(emptyWorkspace);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [workspaceFresh, setWorkspaceFresh] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: "", lessonType: "Хичээл", minutes: "10", content: "" });
  const [approvalReferences, setApprovalReferences] = useState<Record<number, string>>({});
  const [draftForm, setDraftForm] = useState<{
    title: string;
    channel: string;
    sourceId: string;
  }>({ title: "", channel: "Facebook", sourceId: officialSources[0].id });
  const [memberForm, setMemberForm] = useState({ memberName: "", milestone: "72 цаг", nextAction: "", dueLabel: "Өнөөдөр", risk: "normal" });
  const visibleNavItems = navItems.filter((item) => {
    if (item.id === "users") return user.role === "admin";
    if (item.id === "members") return user.role !== "user";
    return true;
  });

  const loadWorkspace = useCallback(async () => {
    try {
      setWorkspace(await fetchWorkspace());
      setWorkspaceFresh(true);
      return true;
    } catch {
      setWorkspaceFresh(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchWorkspace()
      .then((nextWorkspace) => {
        if (active) {
          setWorkspace(nextWorkspace);
          setWorkspaceFresh(true);
        }
      })
      .catch(() => {
        if (active) setNotice("Мэдээллийг ачаалж чадсангүй. Холболтоо шалгаад хуудсаа дахин ачаална уу.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function runAction(payload: Record<string, unknown>, successMessage: string) {
    if (!workspaceFresh) {
      setNotice("Шинэ мэдээлэл ачаалагдаагүй тул өөрчлөлт илгээсэнгүй. Хуудсаа дахин ачаална уу.");
      return false;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "Хадгалж чадсангүй");
      }
      const result = (await response.json().catch(() => ({}))) as { mentorNotice?: unknown };
      const mentorNotice = typeof result.mentorNotice === "string" ? result.mentorNotice : "";
      const refreshed = await loadWorkspace();
      const savedMessage = refreshed ? successMessage : "Өөрчлөлт хадгалагдсан ч шинэ мэдээллийг ачаалж чадсангүй. Дахин илгээх шаардлагагүй. Хуудсаа дахин ачаална уу.";
      setNotice(mentorNotice ? `${savedMessage} ${mentorNotice}` : savedMessage);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Хадгалж чадсангүй");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const completedLessons = useMemo(
    () => new Set(workspace.progress.filter((item) => item.status === "completed").map((item) => item.lessonId)),
    [workspace.progress],
  );
  const publishedLessons = workspace.lessons.filter((lesson) => lesson.isPublished);
  const totalLessons = publishedLessons.length;
  const completedPublishedLessons = publishedLessons.filter((lesson) => completedLessons.has(lesson.id)).length;
  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedPublishedLessons / totalLessons) * 100);
  const pendingMemberTasks = workspace.memberTasks.filter((task) => task.status !== "complete");
  const activeDrafts = workspace.drafts.filter((draft) => draft.status !== "archived");
  const selected = learningLevels[selectedLevel];
  const selectedLessons = workspace.lessons.filter((lesson) => lesson.levelId === selected.id);
  const selectedDone = selectedLessons.filter((lesson) => lesson.isPublished && completedLessons.has(lesson.id)).length;
  const selectedPublishedCount = selectedLessons.filter((lesson) => lesson.isPublished).length;
  const selectedLesson = workspace.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const nextRecommendedLesson = publishedLessons.find((lesson) => !completedLessons.has(lesson.id)) ?? null;

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!draftForm.title.trim()) return;
    if (!await runAction({ action: "create_draft", ...draftForm }, "Ноорог үүслээ. Нийтлэхээс өмнө хяналтад оруулна уу.")) return;
    setDraftForm((current) => ({ ...current, title: "" }));
  }

  async function submitMemberTask(event: FormEvent) {
    event.preventDefault();
    if (!memberForm.memberName.trim() || !memberForm.nextAction.trim()) return;
    if (!await runAction({ action: "add_member_task", ...memberForm }, "Гишүүнд туслах ажил нэмэгдлээ.")) return;
    setMemberForm({ memberName: "", milestone: "72 цаг", nextAction: "", dueLabel: "Өнөөдөр", risk: "normal" });
  }

  async function submitLesson(event: FormEvent) {
    event.preventDefault();
    if (!await runAction(
      { action: "create_lesson", levelId: selected.id, ...lessonForm, minutes: Number(lessonForm.minutes) },
      "Шинэ хичээл нийтлэгдлээ.",
    )) return;
    setLessonForm({ title: "", lessonType: "Хичээл", minutes: "10", content: "" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div><strong>{BRAND_NAME}</strong><small>{PRODUCT_DESCRIPTOR}</small></div>
        </div>
        <nav className="side-nav" aria-label="Үндсэн цэс">
          {visibleNavItems.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
              <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="compliance-status"><span /> Нийтлэхийн өмнөх хяналттай</div>
          <form action="/auth/signout" method="post"><button type="submit">Гарах</button></form>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">БАГИЙН ДОТООД ОРЧИН</p>
            <h1>{visibleNavItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="sync-state"><span className={loading ? "pulse" : workspaceFresh ? "" : "stale"} />{loading ? "Ачаалж байна" : workspaceFresh ? "Мэдээлэл ачаалагдсан" : "Мэдээлэл шинэчлэгдээгүй"}</div>
            <div className="user-chip"><span>{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>{roleLabel(user.role)} · {user.email}</small></div></div>
          </div>
        </header>

        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Мэдэгдэл хаах">×</button></div>}

        <div className="content-area">
          {section === "overview" && (
            <Overview
              progressPercent={progressPercent}
              completed={completedPublishedLessons}
              total={totalLessons}
              pendingTasks={pendingMemberTasks}
              drafts={activeDrafts}
              successMap={workspace.successMap}
              activeAction={workspace.activeAction}
              first30DayEnabled={workspace.first30DayEnabled}
              canSupportMembers={user.role !== "user"}
              nextLesson={nextRecommendedLesson}
              onNavigate={setSection}
              onSelectLevel={(index) => { setSelectedLevel(index); setSection("academy"); }}
            />
          )}

          {section === "my-path" && (
            <SuccessMapPanel
              successMap={workspace.successMap}
              activeAction={workspace.activeAction}
              actionHistory={workspace.myActionHistory}
              supportRequests={workspace.supportRequests.filter((request) => request.memberUserId === workspace.viewer.userId)}
              academyPractices={workspace.academyPractices.filter((practice) => practice.memberUserId === workspace.viewer.userId)}
              lessons={workspace.lessons}
              first30DayEnabled={workspace.first30DayEnabled}
              mentorLoopEnabled={workspace.mentorLoopEnabled}
              checkins={workspace.myCheckins}
              coachNotes={workspace.coachNotes.filter((note) => note.memberUserId === workspace.viewer.userId)}
              saving={saving}
              onAction={runAction}
            />
          )}

          {section === "academy" && (
            <section className="section-stack">
              <div className="section-intro">
                <div><p className="eyebrow blue">СУРГАЛТ</p><h2>Хичээлээ үзээд, сурсан зүйлээ туршаарай.</h2><p>Хичээл бүрийн агуулгыг уншиж дуусаад “Дуусгасан” гэж тэмдэглэнэ. Ахиц таны бүртгэл дээр хадгалагдана.</p></div>
                <div className="summary-pill"><strong>{progressPercent}%</strong><span>дуусгасан хичээлийн хувь</span></div>
              </div>
              <div className="level-tabs" role="tablist" aria-label="Сургалтын түвшин">
                {learningLevels.map((level, index) => (
                  <button key={level.id} className={selectedLevel === index ? "active" : ""} onClick={() => setSelectedLevel(index)} role="tab">
                    <strong>{level.level}</strong><span>{level.title}</span>
                  </button>
                ))}
              </div>
              <div className="academy-layout">
                <article className="panel lesson-panel">
                  <div className="panel-heading"><div><span className="tag">{selected.level}</span><h3>{selected.title}</h3><p>{selected.description}</p></div><div className="lesson-count">{selectedDone}/{selectedPublishedCount}<small>дууссан</small></div></div>
                  <div className="progress-track"><span style={{ width: `${selectedPublishedCount === 0 ? 0 : (selectedDone / selectedPublishedCount) * 100}%` }} /></div>
                  <div className="lesson-list">
                    {selectedLessons.length === 0 && <EmptyState title="Хичээл хараахан алга" copy="Админ энэ түвшинд шинэ хичээл нэмнэ." />}
                    {selectedLessons.map((lesson, index) => {
                      const done = completedLessons.has(lesson.id);
                      return (
                        <button
                          key={lesson.id}
                          className={`lesson-row ${done ? "done" : ""}`}
                          onClick={() => setSelectedLessonId(lesson.id)}
                        >
                          <span className="lesson-check">{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
                          <span className="lesson-copy"><strong>{lesson.title}</strong><small>{lesson.type} · {lesson.minutes} мин</small></span>
                          <span className="row-action">{!lesson.isPublished ? "Идэвхгүй" : done ? "Дахин үзэх" : "Нээх →"}</span>
                        </button>
                      );
                    })}
                  </div>
                </article>
                {user.role === "admin" ? (
                  <form className="panel form-panel" onSubmit={submitLesson}>
                    <p className="eyebrow blue">АДМИН · ШИНЭ ХИЧЭЭЛ</p><h3>{selected.level}-д хичээл нэмэх</h3>
                    <label>Гарчиг<input value={lessonForm.title} onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} maxLength={140} required /></label>
                    <div className="field-grid"><label>Төрөл<select value={lessonForm.lessonType} onChange={(event) => setLessonForm({ ...lessonForm, lessonType: event.target.value })}><option>Хичээл</option><option>Workshop</option><option>Role-play</option><option>Quiz</option><option>Assessment</option><option>Playbook</option></select></label><label>Минут<input type="number" min="1" max="480" value={lessonForm.minutes} onChange={(event) => setLessonForm({ ...lessonForm, minutes: event.target.value })} required /></label></div>
                    <label>Хичээлийн агуулга<textarea className="lesson-content-input" value={lessonForm.content} onChange={(event) => setLessonForm({ ...lessonForm, content: event.target.value })} maxLength={12000} placeholder="Суралцах зорилго, тайлбар, алхам, даалгавар..." required /></label>
                    <button className="primary-button" type="submit" disabled={saving || !lessonForm.title.trim() || !lessonForm.content.trim()}>Хичээл нэмэх</button>
                  </form>
                ) : (
                  <aside className="panel certification-panel"><p className="eyebrow blue">СУРАЛЦАХ ДАРААЛАЛ</p><h3>Нээ → Суралц → Дуусга</h3><ul className="check-list"><li><span>01</span> Хичээлээ нээж унших</li><li><span>02</span> Дадлагаа хийх</li><li><span>✓</span> Ахицдаа тэмдэглэх</li></ul><div className="locked-note"><strong>Таны ахиц хадгалагдана</strong><p>Дараа нэвтрэхэд дууссан хичээлүүд хэвээр харагдана.</p></div></aside>
                )}
              </div>
            </section>
          )}

          {section === "content" && (
            <section className="section-stack">
              <div className="section-intro">
                <div><p className="eyebrow blue">ЭХ СУРВАЛЖТАЙ НИЙТЛЭЛ</p><h2>Нийтлэхээсээ өмнө хүнээр хянуулна.</h2><p>Ноорог бичсэн хүн өөрийн ажлыг батлахгүй. Компанийн зөвшөөрлийг тусдаа баримт эсвэл холбоосоор бүртгэнэ.</p></div>
                <div className="mode-badge"><span>НООРОГ БЭЛДЭХ</span><strong>Бэлэн загвар ашиглана</strong><small>Автоматаар нийтлэхгүй</small></div>
              </div>
              <div className="workflow-strip"><span><b>01</b> Эх сурвалж</span><i>→</i><span><b>02</b> Ноорог</span><i>→</i><span><b>03</b> Хяналт</span><i>→</i><span><b>04</b> Батлах</span></div>
              <div className="content-layout">
                <form className="panel form-panel" onSubmit={submitDraft}>
                  <div className="panel-heading"><div><p className="eyebrow blue">ШИНЭ НООРОГ</p><h3>Нийтлэлийн ноорог</h3></div><span className="source-lock">◇ Эх сурвалжтай</span></div>
                  <label>Сэдэв<input value={draftForm.title} onChange={(event) => setDraftForm({ ...draftForm, title: event.target.value })} placeholder="Жишээ: Аяллын төсвөө 3 алхмаар төлөвлөх" maxLength={140} /></label>
                  <div className="field-grid">
                    <label>Хэлбэр<select value={draftForm.channel} onChange={(event) => setDraftForm({ ...draftForm, channel: event.target.value })}><option>Facebook</option><option>Instagram</option><option value="Short video">Богино бичлэг</option><option value="FAQ">Түгээмэл асуулт</option><option value="Message">Зурвас</option></select></label>
                    <label>Албан эх сурвалж<select value={draftForm.sourceId} onChange={(event) => setDraftForm({ ...draftForm, sourceId: event.target.value })}>{officialSources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
                  </div>
                  <div className="guardrail-copy"><strong>Хүнээр хянуулах шаардлагатай</strong><span>Албан эх сурвалжаа сонгоод өөр хүнээр хянуулна. Баримт, амлалтыг автоматаар шалгах боломж одоогоор байхгүй.</span></div>
                  <button className="primary-button" type="submit" disabled={saving || !draftForm.title.trim()}>Ноорог үүсгэх</button>
                </form>
                <article className="panel queue-panel">
                  <div className="panel-heading"><div><p className="eyebrow blue">НИЙТЛЭЛИЙН ЯВЦ</p><h3>Ноорог ба зөвшөөрөл</h3></div><span className="count-badge">{activeDrafts.length}</span></div>
                  {activeDrafts.length === 0 ? <EmptyState title="Одоогоор ноорог алга" copy="“Шинэ ноорог” хэсэгт сэдэв, эх сурвалжаа сонгож эхлээрэй." /> : (
                    <div className="draft-list">{activeDrafts.map((draft) => {
                      const source = officialSources.find((item) => item.id === draft.sourceId);
                      const canArchive = draft.isOwner || workspace.viewer.role === "admin";
                      return (
                        <div className="draft-card" key={draft.id}>
                          <div className="draft-top"><Status status={draft.status} /><small>{channelLabel(draft.channel)}</small></div>
                          <h4>{draft.title}</h4>
                          <p>{draft.excerpt}</p>
                          {draft.reviewNote && <p className="review-evidence">Хянасан хүний тэмдэглэл: {draft.reviewNote}</p>}
                          {draft.corporateApprovalRef && <p className="review-evidence">Зөвшөөрлийн баримт: {draft.corporateApprovalRef}</p>}
                          <div className="draft-bottom">
                            <span>{source?.title ?? "Эх сурвалжийг дахин холбох шаардлагатай"}</span>
                            <div className="draft-actions">
                              {draft.status === "draft" && draft.isOwner && source && (
                                <button onClick={() => void runAction({ action: "submit_draft", id: draft.id }, "Нооргийг өөр хүнээр хянуулахаар бүртгэлээ.")} disabled={saving}>Хяналтад өгөх →</button>
                              )}
                              {draft.status === "draft" && draft.isOwner && !source && <small>Эх сурвалжийг дахин холбосны дараа илгээх боломжтой</small>}
                              {draft.status === "review" && workspace.viewer.canReview && !draft.isOwner && (
                                <>
                                  <button onClick={() => void runAction({ action: "review_draft", id: draft.id, decision: "return_to_draft" }, "Ноорог засварт буцлаа.")} disabled={saving}>Засварт буцаах</button>
                                  <button onClick={() => void runAction({ action: "review_draft", id: draft.id, decision: "internal_approved" }, "Өөр хүнээр хянуулсан үр дүн бүртгэгдлээ.")} disabled={saving}>Дотоод хяналт тэнцсэн →</button>
                                </>
                              )}
                              {draft.status === "review" && (!workspace.viewer.canReview || draft.isOwner) && <small>Тусдаа хянагч хүлээж байна</small>}
                              {draft.status === "internal_approved" && workspace.viewer.canRecordCorporateApproval && !draft.isOwner && (
                                <label className="approval-reference">
                                  <span>Компанийн бичгээр өгсөн зөвшөөрлийн баримт</span>
                                  <input
                                    value={approvalReferences[draft.id] ?? ""}
                                    onChange={(event) => setApprovalReferences((current) => ({ ...current, [draft.id]: event.target.value }))}
                                    placeholder="Имэйл, баримт эсвэл хүсэлтийн холбоос"
                                    maxLength={240}
                                  />
                                  <button
                                    onClick={() => void runAction({ action: "record_corporate_approval", id: draft.id, evidenceRef: approvalReferences[draft.id] ?? "" }, "Компанийн зөвшөөрлийн баримт бүртгэгдлээ.")}
                                    disabled={saving || (approvalReferences[draft.id] ?? "").trim().length < 3}
                                  >Баримтыг бүртгэх →</button>
                                </label>
                              )}
                              {draft.status === "internal_approved" && (!workspace.viewer.canRecordCorporateApproval || draft.isOwner) && <small>Өөр админ зөвшөөрлийн баримтыг бүртгэнэ</small>}
                              {draft.status === "approved" && <small>Өмнөх бүртгэл — компанийн зөвшөөрөл нотлогдоогүй</small>}
                              {["approved", "corporate_approved"].includes(draft.status) && canArchive && (
                                <button onClick={() => void runAction({ action: "archive_draft", id: draft.id }, "Контент архивлагдлаа.")} disabled={saving}>Архивлах</button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}</div>
                  )}
                </article>
              </div>
            </section>
          )}

          {section === "members" && (
            <section className="section-stack">
              <div className="section-intro"><div><p className="eyebrow blue">УРЬСАН ХҮН, ДАСГАЛЖУУЛАГЧИЙН ДЭМЖЛЭГ</p><h2>Хэнд, юугаар туслах вэ?</h2><p>Тусламж хүссэн гишүүд эхэнд харагдана. Хүн бүрт нэг тодорхой дараагийн алхам санал болгоорой.</p><p>{SUPPORT_SHARING_DESCRIPTION} Гишүүний шууд илгээсэн тусламжийн хүсэлт тусдаа харагдана.</p></div><div className="summary-pill"><strong>{workspace.supportRequests.filter((request) => !["member_confirmed", "closed"].includes(request.status)).length}</strong><span>нээлттэй хүсэлт</span></div></div>
              <TeamSupportPanel members={workspace.supportMembers} notes={workspace.coachNotes} supportRequests={workspace.supportRequests} practices={workspace.academyPractices} saving={saving} onAction={runAction} />
              <div className="lifecycle"><div><b>0–72 цаг</b><span>Танилцах, зорилгоо сонгох</span></div><div><b>30 хоног</b><span>Хийсэн зүйл, саадаа ярилцах</span></div><div><b>60 хоног</b><span>Ямар үр дүн гарсныг харах</span></div><div><b>90 хоног</b><span>Дараагийн төлөвлөгөөг гаргах</span></div></div>
              <div className="member-layout">
                <form className="panel form-panel" onSubmit={submitMemberTask}>
                  <p className="eyebrow blue">ЭРГЭЖ ХОЛБОГДОХ АЖИЛ</p><h3>Гишүүнд туслах ажил нэмэх</h3>
                  <label>Гишүүний нэр<input value={memberForm.memberName} onChange={(event) => setMemberForm({ ...memberForm, memberName: event.target.value })} placeholder="Нэр" maxLength={80} /></label>
                  <div className="field-grid"><label>Үе шат<select value={memberForm.milestone} onChange={(event) => setMemberForm({ ...memberForm, milestone: event.target.value })}><option>72 цаг</option><option>30 хоног</option><option>60 хоног</option><option>90 хоног</option></select></label><label>Эрсдэл<select value={memberForm.risk} onChange={(event) => setMemberForm({ ...memberForm, risk: event.target.value })}><option value="normal">Хэвийн</option><option value="attention">Анхаарах</option><option value="urgent">Яаралтай</option></select></label></div>
                  <label>Дараагийн алхам<textarea value={memberForm.nextAction} onChange={(event) => setMemberForm({ ...memberForm, nextAction: event.target.value })} placeholder="Жишээ: Аяллын зорилгыг тодруулж, FAQ илгээх" maxLength={180} /></label>
                  <label>Хугацаа<input value={memberForm.dueLabel} onChange={(event) => setMemberForm({ ...memberForm, dueLabel: event.target.value })} placeholder="Өнөөдөр 18:00" maxLength={40} /></label>
                  <button className="primary-button" type="submit" disabled={saving || !memberForm.memberName.trim() || !memberForm.nextAction.trim()}>Ажил нэмэх</button>
                </form>
                <article className="panel task-panel">
                  <div className="panel-heading"><div><p className="eyebrow blue">БАГИЙН ХИЙХ АЖЛУУД</p><h3>Дараагийн алхмууд</h3></div><span className="count-badge">{pendingMemberTasks.length}</span></div>
                  {pendingMemberTasks.length === 0 ? <EmptyState title="Одоогоор хийх ажил алга" copy="Гишүүнтэй тохирсон дараагийн алхмыг нэмэхэд энд харагдана." /> : <div className="task-list">{pendingMemberTasks.map((task) => <div className="task-row" key={task.id}><span className={`risk-dot ${task.risk}`} /><div><strong>{task.memberName}</strong><p>{task.nextAction}</p><small>{task.milestone} · {task.dueLabel}</small></div><button onClick={() => void runAction({ action: "complete_member_task", id: task.id }, "Ажил дууссан гэж тэмдэглэлээ.")} disabled={saving} aria-label={`${task.memberName}-ийн ажлыг дууссан гэж тэмдэглэх`}>✓</button></div>)}</div>}
                </article>
              </div>
            </section>
          )}

          {section === "vault" && (
            <section className="section-stack">
              <div className="section-intro"><div><p className="eyebrow blue">АЛБАН ЭХ СУРВАЛЖ</p><h2>Ноорог бүр эх сурвалжтай байна.</h2><p>Энд нийтлэлд ашиглаж болох холбоосыг жагсаасан. Баримтад орсон өөрчлөлтийг апп автоматаар илрүүлэхгүй.</p></div><div className="summary-pill"><strong>{officialSources.length}</strong><span>ашиглаж болох эх</span></div></div>
              <div className="vault-grid">{officialSources.map((source) => <a className="source-card" href={source.url} target="_blank" rel="noreferrer" key={source.id}><div className="source-icon">PDF</div><div><div className="source-meta"><span>{source.category}</span><Status status="source_allowed" /></div><h3>{source.title}</h3><p>Жагсаалтад шалгаж оруулсан: {source.verified}</p></div><span className="external">↗</span></a>)}</div>
              <article className="policy-panel"><div><p className="eyebrow">НИЙТЛЭХИЙН ӨМНӨХ ХЯНАЛТ</p><h3>Аппын боломж ба хязгаар</h3></div><ul><li>Автоматаар нийтлэх, хувийн зурвас илгээхгүй</li><li>Өөрийн нооргийг өөрөө батлахгүй</li><li>Компанийн зөвшөөрлийг баримтаар бүртгэнэ</li><li>Бүртгэл, төлбөр, захиалгыг зөвхөн албан ёсны системд хийнэ</li></ul><p><strong>Баталгаажаагүй:</strong> Монголын хууль, татвар, шууд борлуулалтын шаардлагад нийцэх эсэхийг мэргэжлийн хүнээр шалгуулах шаардлагатай. Апп үүнийг батлахгүй.</p></article>
            </section>
          )}

          {section === "users" && user.role === "admin" && (
            <UserDirectory
              users={workspace.users}
              rankClaims={workspace.rankClaims}
              first30DayEnabled={workspace.first30DayEnabled}
              currentEmail={user.email}
              saving={saving}
              onAction={runAction}
              onUpdate={(member) => runAction({
                action: "update_user",
                userId: member.id,
                role: member.role,
                status: member.status,
                sponsorUserId: member.sponsorUserId,
                coachUserId: member.coachUserId,
                teamName: member.teamName,
              }, "Хэрэглэгчийн эрх ба багийн холбоо шинэчлэгдлээ.")}
            />
          )}
        </div>
      </main>

      {selectedLesson && (
        <LessonDialog
          lesson={selectedLesson}
          done={completedLessons.has(selectedLesson.id)}
          isAdmin={user.role === "admin"}
          saving={saving}
          onClose={() => setSelectedLessonId(null)}
          onToggle={() => runAction({ action: "toggle_lesson", lessonId: selectedLesson.id }, completedLessons.has(selectedLesson.id) ? "Дууссан тэмдэглэгээг цуцаллаа." : "Хичээл дууссанд бүртгэгдлээ.")}
          onSave={(changes) => runAction({ action: "update_lesson", lessonId: selectedLesson.id, ...changes }, "Хичээлийн мэдээлэл шинэчлэгдлээ.")}
        />
      )}

      <nav className={`mobile-nav${visibleNavItems.length > 5 ? " mobile-nav-scrollable" : ""}`} aria-label="Гар утасны цэс">
        {visibleNavItems.length > 5 && <p className="mobile-nav-hint">Бусад цэсийг хажуу тийш гүйлгэж харна уу ↔</p>}
        <div className="mobile-nav-items">{visibleNavItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}><span aria-hidden="true">{item.symbol}</span>{item.short}</button>)}</div>
      </nav>
    </div>
  );
}

function LessonDialog({ lesson, done, isAdmin, saving, onClose, onToggle, onSave }: {
  lesson: WorkspacePayload["lessons"][number];
  done: boolean;
  isAdmin: boolean;
  saving: boolean;
  onClose: () => void;
  onToggle: () => Promise<boolean>;
  onSave: (changes: { title: string; lessonType: string; minutes: number; content: string; isPublished: boolean }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: lesson.title, lessonType: lesson.type, minutes: String(lesson.minutes), content: lesson.content, isPublished: lesson.isPublished });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!await onSave({ ...form, minutes: Number(form.minutes) })) return;
    setEditing(false);
  }

  return (
    <dialog ref={dialogRef} className="dialog-backdrop" aria-modal="true" aria-labelledby="lesson-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="lesson-dialog">
        <header className="lesson-dialog-header">
          <div><span className="tag">{lesson.type} · {lesson.minutes} мин</span><h2 ref={titleRef} tabIndex={-1} id="lesson-dialog-title">{lesson.title}</h2></div>
          <button className="dialog-close" onClick={onClose} aria-label="Хичээл хаах">×</button>
        </header>
        {editing ? (
          <form className="lesson-editor form-panel" onSubmit={save}>
            <label>Гарчиг<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={140} required /></label>
            <div className="field-grid"><label>Төрөл<input value={form.lessonType} onChange={(event) => setForm({ ...form, lessonType: event.target.value })} maxLength={40} required /></label><label>Минут<input type="number" min="1" max="480" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} required /></label></div>
            <label>Агуулга<textarea className="lesson-content-input" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} maxLength={12000} required /></label>
            <label className="publish-toggle"><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm({ ...form, isPublished: event.target.checked })} /> Хэрэглэгчдэд нийтлэх</label>
            <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Болих</button><button className="primary-button" type="submit" disabled={saving}>Өөрчлөлт хадгалах</button></div>
          </form>
        ) : (
          <>
            <div className="lesson-body">{lesson.content.split("\n").map((paragraph, index) => paragraph ? <p key={index}>{paragraph}</p> : <br key={index} />)}</div>
            <footer className="dialog-actions">
              {isAdmin && <button className="secondary-button" onClick={() => setEditing(true)}>Засах</button>}
              <button className={done ? "secondary-button" : "primary-button"} onClick={() => void onToggle()} disabled={saving || !lesson.isPublished}>{done ? "Дууссан тэмдэглэгээ цуцлах" : "✓ Хичээлийг дуусгасан"}</button>
            </footer>
          </>
        )}
      </article>
    </dialog>
  );
}

function TeamSupportPanel({ members, notes, supportRequests, practices, saving, onAction }: {
  members: WorkspacePayload["supportMembers"];
  notes: WorkspacePayload["coachNotes"];
  supportRequests: WorkspacePayload["supportRequests"];
  practices: WorkspacePayload["academyPractices"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  if (members.length === 0) {
    return <article className="panel"><EmptyState title="Хариуцсан гишүүн алга" copy="Админ таныг гишүүний урьсан хүн эсвэл дасгалжуулагчаар оноосны дараа зөвшөөрсөн мэдээлэл нь энд харагдана." /></article>;
  }

  return (
    <div className="support-member-grid">
      {[...members].sort((left, right) => {
        const leftOpen = supportRequests.some((request) => request.memberUserId === left.id && !["member_confirmed", "closed"].includes(request.status));
        const rightOpen = supportRequests.some((request) => request.memberUserId === right.id && !["member_confirmed", "closed"].includes(request.status));
        return Number(rightOpen) - Number(leftOpen);
      }).map((member) => (
        <SupportMemberCard
          key={`${member.id}:${supportRequests.find((request) => request.memberUserId === member.id && !["member_confirmed", "closed"].includes(request.status))?.id ?? "none"}`}
          member={member}
          notes={notes.filter((note) => note.memberUserId === member.id)}
          requests={supportRequests.filter((request) => request.memberUserId === member.id)}
          practices={practices.filter((practice) => practice.memberUserId === member.id)}
          saving={saving}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function SupportMemberCard({ member, notes, requests, practices, saving, onAction }: {
  member: WorkspacePayload["supportMembers"][number];
  notes: WorkspacePayload["coachNotes"];
  requests: WorkspacePayload["supportRequests"];
  practices: WorkspacePayload["academyPractices"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  const openRequest = requests.find((request) => !["member_confirmed", "closed"].includes(request.status)) ?? null;
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [visibleToMember, setVisibleToMember] = useState(true);
  const [resolutionNote, setResolutionNote] = useState("");
  const [nextCheckAt, setNextCheckAt] = useState("");
  const [practiceFeedback, setPracticeFeedback] = useState("");
  const [competencyLabel, setCompetencyLabel] = useState("");
  const submittedPractice = practices.find((practice) => practice.status === "submitted") ?? null;
  const attention = openRequest ? "urgent" : member.onboardingRequired ? "onboarding" : member.latestCheckin?.needsHelp ? "urgent" : member.latestCheckin ? "normal" : "attention";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (note.trim().length < 3) return;
    if (!await onAction({ action: "add_coach_note", memberUserId: member.id, supportRequestId: openRequest?.id ?? null, note, nextAction, visibleToMember }, `${member.displayName}-д зөвлөгөө хадгалагдлаа.`)) return;
    setNote("");
    setNextAction("");
  }

  async function advanceSupport(nextStatus: "acknowledged" | "in_progress" | "resolved") {
    if (nextStatus === "resolved" && resolutionNote.trim().length < 3) return;
    const success = await onAction({
      action: "advance_support_request",
      supportRequestId: openRequest?.id,
      nextStatus,
      resolutionNote,
      nextCheckAt: nextCheckAt ? new Date(nextCheckAt).toISOString() : null,
    }, nextStatus === "resolved" ? "Тусламжийн шийдлийг гишүүнд баталгаажуулахаар илгээлээ." : "Тусламжийн хүсэлтийн төлөв шинэчлэгдлээ.");
    if (success && nextStatus === "resolved") setResolutionNote("");
  }

  async function reviewPractice(event: FormEvent) {
    event.preventDefault();
    if (!submittedPractice || practiceFeedback.trim().length < 3) return;
    if (!await onAction({
      action: "review_academy_practice",
      practiceId: submittedPractice.id,
      feedback: practiceFeedback,
      competencyLabel: competencyLabel || null,
    }, `${member.displayName}-ийн дадлагад өгсөн санал хадгалагдлаа.`)) return;
    setPracticeFeedback("");
    setCompetencyLabel("");
  }

  return (
    <article className="panel support-member-card">
      <header className="support-member-header">
        <div className="user-avatar">{member.displayName.charAt(0).toUpperCase()}</div>
        <div><h3>{member.displayName}</h3><p>{member.teamName} · {roleLabel(member.role)}</p><small>Урьсан хүн: {member.sponsorName ?? "оноогоогүй"} · Дасгалжуулагч: {member.coachName ?? "оноогоогүй"}</small></div>
        <span className={`support-state ${attention}`}>{openRequest ? "Тусламжийн хүсэлттэй" : member.onboardingRequired ? "Эхний 5 асуултаа бөглөөгүй" : member.latestCheckin?.needsHelp ? "Тусламж хүссэн" : member.latestCheckin ? "Явцаа тэмдэглэсэн" : "Явцын тэмдэглэл алга"}</span>
      </header>

      {openRequest && (
        <section className="support-case">
          <div><p className="eyebrow blue">ШУУД ТУСЛАМЖИЙН ХҮСЭЛТ</p><span className={`support-state ${openRequest.status}`}>{supportStatusLabel(openRequest.status)}</span></div>
          <h4>{supportTypeLabel(openRequest.requestType)}</h4>
          <p>{openRequest.requestText}</p>
          {openRequest.nextCheckAt && <small>Дараагийн шалгах хугацаа: {new Date(openRequest.nextCheckAt).toLocaleString("mn-MN")}</small>}
          <label>Дараагийн шалгах хугацаа<input type="datetime-local" value={nextCheckAt} onChange={(event) => setNextCheckAt(event.target.value)} /></label>
          <div className="support-controls">
            {["assigned", "unassigned"].includes(openRequest.status) && <button className="secondary-button" type="button" disabled={saving} onClick={() => void advanceSupport("acknowledged")}>Хүсэлтийг хүлээж авсан</button>}
            {["assigned", "unassigned", "acknowledged"].includes(openRequest.status) && <button className="secondary-button" type="button" disabled={saving} onClick={() => void advanceSupport("in_progress")}>Шийдэж эхлэх</button>}
          </div>
          {["acknowledged", "in_progress"].includes(openRequest.status) && <label>Өгсөн шийдэл<textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} maxLength={1600} placeholder="Ямар тусламж өгсөн, дараагийн алхам юу вэ?" /></label>}
          {["acknowledged", "in_progress"].includes(openRequest.status) && <button className="primary-button" type="button" disabled={saving || resolutionNote.trim().length < 3} onClick={() => void advanceSupport("resolved")}>Шийдлийг гишүүнээр баталгаажуулах</button>}
        </section>
      )}

      {member.summary ? (
        <div className="support-summary">
          <div><span>Гишүүний сонгосон зорилго</span><strong>{member.summary.goal30Day}</strong></div>
          <div><span>7 хоногт гаргах нийт хугацаа</span><strong>{member.summary.weeklyCapacity}</strong></div>
          <div><span>Ойлгохгүй / гацсан зүйл</span><strong>{member.summary.primaryBlocker}</strong></div>
          <div><span>Хэрэгтэй тусламж</span><strong>{member.summary.supportNeeds}</strong></div>
          <div><span>Одоо хийх ажил</span><strong>{plainMongolianText(member.summary.todayAction)}</strong></div>
        </div>
      ) : <p className="muted-copy">{member.onboardingRequired ? "Эхний 5 асуулт хараахан дуусаагүй байна." : "Хуваалцсан хариулт одоогоор алга. Гишүүн зөвшөөрсөн үед зорилго, боломжит цаг, гол саад, хүссэн тусламж нь бичсэнээрээ харагдана."}</p>}

      {member.latestCheckin && (
        <div className="latest-checkin">
          <div><strong>{member.latestCheckin.progressPercent}%</strong><span>гишүүний өөрийн үнэлгээ</span></div>
          <p>{member.latestCheckin.progressSummary}</p>
          {member.latestCheckin.blocker && <small>Саад: {member.latestCheckin.blocker}</small>}
          {member.latestCheckin.helpRequest && <small>Тусламж: {member.latestCheckin.helpRequest}</small>}
          <small>Дараа хийх нэг ажил: {member.latestCheckin.nextFocus}</small>
        </div>
      )}

      {submittedPractice && (
        <form className="practice-review-form" onSubmit={reviewPractice}>
          <p className="eyebrow blue">ДАДЛАГАД САНАЛ ӨГӨХ</p>
          <h4>Гишүүний хийсэн дадлага</h4>
          <blockquote>{submittedPractice.submission}</blockquote>
          <label>Санал, зөвлөмж<textarea value={practiceFeedback} onChange={(event) => setPracticeFeedback(event.target.value)} maxLength={1600} placeholder="Юуг сайн хийсэн, нэг юмыг яаж сайжруулах вэ?" required /></label>
          <label>Харуулсан чадвар (заавал биш)<input value={competencyLabel} onChange={(event) => setCompetencyLabel(event.target.value)} maxLength={160} placeholder="Жишээ: Хүний хэрэгцээг асуултаар тодруулсан" /></label>
          <button className="secondary-button" type="submit" disabled={saving || practiceFeedback.trim().length < 3}>Дадлагыг хянаж дуусгах</button>
        </form>
      )}

      <form className="coach-note-form" onSubmit={submit}>
        <label>Зөвлөгөө<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1600} placeholder="Юуг ойлгуулах, юун дээр дэмжих вэ?" required /></label>
        <label>Дараагийн алхам<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} maxLength={800} placeholder="Жишээ: L1 хичээлийг үзээд 15 минут ярилцах" /></label>
        <label className="check-row"><input type="checkbox" checked={visibleToMember} onChange={(event) => setVisibleToMember(event.target.checked)} /> Гишүүнд харагдана</label>
        <button className="secondary-button" type="submit" disabled={saving || note.trim().length < 3}>Зөвлөгөө хадгалах</button>
      </form>

      {notes.length > 0 && <div className="coach-note-list">{notes.slice(0, 3).map((item) => <div key={item.id}><strong>{item.authorName}</strong><p>{item.note}</p>{item.nextAction && <small>Дараагийн алхам: {item.nextAction}</small>}</div>)}</div>}
      <p className="privacy-note">{SUPPORT_SHARING_DESCRIPTION} Мөн зөвшөөрсөн явц, дадлага болон шууд илгээсэн тусламжийн хүсэлт харагдана.</p>
    </article>
  );
}

function UserDirectory({ users, rankClaims, first30DayEnabled, currentEmail, saving, onAction, onUpdate }: {
  users: WorkspacePayload["users"];
  rankClaims: WorkspacePayload["rankClaims"];
  first30DayEnabled: boolean;
  currentEmail: string;
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
  onUpdate: (member: WorkspacePayload["users"][number]) => Promise<boolean>;
}) {
  const [rankForm, setRankForm] = useState({ memberUserId: "", claimedLabel: "", sourceKind: "official_back_office", evidenceReference: "" });

  async function submitRankClaim(event: FormEvent) {
    event.preventDefault();
    if (!await onAction({ action: "record_rank_claim", ...rankForm }, "Зэрэглэлийн нотолгоог шалгуулахаар бүртгэлээ.")) return;
    setRankForm((current) => ({ ...current, claimedLabel: "", evidenceReference: "" }));
  }

  return (
    <section className="section-stack">
      <div className="section-intro">
        <div><p className="eyebrow blue">ХЭРЭГЛЭГЧИЙН УДИРДЛАГА</p><h2>Урилга ба хэрэглэгчийн эрх</h2><p>Админ имэйл урилга илгээж, бүртгэлтэй хэрэглэгчийн эрх болон төлөвийг удирдана.</p></div>
        <div className="summary-pill"><strong>{users.length}</strong><span>нийт хэрэглэгч</span></div>
      </div>
      <AdminInvitations users={users} />
      {first30DayEnabled && (
        <article className="panel rank-evidence-panel">
          <div className="panel-heading"><div><p className="eyebrow blue">КОМПАНИЙН ЗЭРЭГЛЭЛИЙН НОТОЛГОО</p><h3>Зэрэглэлийн мэдээллийг баримттай бүртгэнэ</h3><p>Энд нэмсэн мэдээлэл эхлээд шалгуулах төлөвтэй байна. Хэрэглэгчийн эрх, сургалт үзэх боломж, зөвлөмжийг өөрчлөхгүй.</p></div><span className="count-badge">{rankClaims.length}</span></div>
          <form className="rank-evidence-form" onSubmit={submitRankClaim}>
            <label>Гишүүн<select value={rankForm.memberUserId} onChange={(event) => setRankForm({ ...rankForm, memberUserId: event.target.value })} required><option value="">Сонгох</option>{users.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.email}</option>)}</select></label>
            <label>Зэрэглэлийн албан нэр<input value={rankForm.claimedLabel} onChange={(event) => setRankForm({ ...rankForm, claimedLabel: event.target.value })} maxLength={120} required /></label>
            <label>Эх үүсвэр<select value={rankForm.sourceKind} onChange={(event) => setRankForm({ ...rankForm, sourceKind: event.target.value })}><option value="official_back_office">Компанийн албан систем</option><option value="official_document">Албан баримт</option><option value="other_official">Бусад албан эх</option></select></label>
            <label>Нотлох баримтын холбоос, дугаар<input value={rankForm.evidenceReference} onChange={(event) => setRankForm({ ...rankForm, evidenceReference: event.target.value })} maxLength={500} placeholder="Баримтын холбоос эсвэл дугаар" required /></label>
            <button className="secondary-button" type="submit" disabled={saving || !rankForm.memberUserId || rankForm.claimedLabel.trim().length < 2 || rankForm.evidenceReference.trim().length < 3}>Шалгуулахаар бүртгэх</button>
          </form>
          {rankClaims.length > 0 && <div className="rank-claim-list">{rankClaims.slice(0, 8).map((claim) => <div key={claim.id}><strong>{claim.claimedLabel}</strong><span>{users.find((item) => item.id === claim.memberUserId)?.displayName ?? "Гишүүний нэр олдсонгүй"}</span><small>{rankStatusLabel(claim.status)} · {rankSourceLabel(claim.sourceKind)} · {new Date(claim.createdAt).toLocaleDateString("mn-MN")}</small></div>)}</div>}
        </article>
      )}
      <article className="panel user-directory">
        {users.length === 0 ? <EmptyState title="Хэрэглэгч алга" copy="Эхний хэрэглэгч бүртгүүлсний дараа энд харагдана." /> : users.map((item) => {
          const isCurrent = item.email === currentEmail;
          const sponsorOptions = users.filter((candidate) => candidate.id !== item.id && candidate.status === "active" && ["builder", "coach", "director", "admin"].includes(candidate.role));
          const coachOptions = users.filter((candidate) => candidate.id !== item.id && candidate.status === "active" && ["coach", "director", "admin"].includes(candidate.role));
          return (
            <div className="user-directory-row" key={item.id}>
              <div className="user-avatar">{item.displayName.charAt(0).toUpperCase()}</div>
              <div className="user-identity"><strong>{item.displayName}</strong><span>{item.email}</span><small>{new Date(item.createdAt).toLocaleDateString("mn-MN")}{isCurrent ? " · Та" : ""}</small></div>
              <div className="relationship-fields">
                <label>Эрх<select value={item.role} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, role: event.target.value as typeof item.role })}><option value="user">Гишүүн</option><option value="builder">Баг бүрдүүлэгч</option><option value="coach">Дасгалжуулагч</option><option value="director">Багийн удирдагч</option><option value="admin">Админ</option></select></label>
                <label>Төлөв<select value={item.status} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, status: event.target.value as typeof item.status })}><option value="active">Идэвхтэй</option><option value="disabled">Идэвхгүй</option></select></label>
                <label>Баг<input defaultValue={item.teamName} disabled={saving || isCurrent} maxLength={80} onBlur={(event) => { const teamName = event.target.value.trim(); if (teamName && teamName !== item.teamName) void onUpdate({ ...item, teamName }); }} /></label>
                <label>Урьсан хүн<select value={item.sponsorUserId ?? ""} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, sponsorUserId: event.target.value || null })}><option value="">Оноогоогүй</option>{sponsorOptions.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.displayName} · {roleLabel(candidate.role)}</option>)}</select></label>
                <label>Дасгалжуулагч<select value={item.coachUserId ?? ""} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, coachUserId: event.target.value || null })}><option value="">Оноогоогүй</option>{coachOptions.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.displayName} · {roleLabel(candidate.role)}</option>)}</select></label>
              </div>
            </div>
          );
        })}
      </article>
    </section>
  );
}

function Overview({ progressPercent, completed, total, pendingTasks, drafts, successMap, activeAction, first30DayEnabled, canSupportMembers, nextLesson, onNavigate, onSelectLevel }: {
  progressPercent: number;
  completed: number;
  total: number;
  pendingTasks: WorkspacePayload["memberTasks"];
  drafts: WorkspacePayload["drafts"];
  successMap: WorkspacePayload["successMap"];
  activeAction: WorkspacePayload["activeAction"];
  first30DayEnabled: boolean;
  canSupportMembers: boolean;
  nextLesson: WorkspacePayload["lessons"][number] | null;
  onNavigate: (section: Section) => void;
  onSelectLevel: (index: number) => void;
}) {
  const reviewCount = drafts.filter((draft) => draft.status === "review").length;
  const approvedCount = drafts.filter((draft) => draft.status === "corporate_approved").length;
  const personalTitle = activeAction?.title
    ?? (successMap ? first30DayEnabled ? "Эхний алхмууд дууссан" : successMap.plan.todayAction.title : "Миний замаа нээх");
  const personalTag = activeAction
    ? `${activeAction.minutes} мин`
    : successMap ? first30DayEnabled ? "Явцаа тэмдэглэх" : `${successMap.plan.todayAction.minutes} минут` : "5 асуулт";
  const personalDetail = activeAction?.detail
    ?? (successMap
      ? first30DayEnabled
        ? "Хийсэн зүйл, саадаа тэмдэглээд дараа юу хийхээ сонгоорой."
        : successMap.plan.todayAction.detail
      : "5 хариултаас таны боломжит цагт багтсан, дуусах шалгууртай нэг эхний ажлыг гаргана.");
  return <section className="section-stack">
    <div className="command-hero">
      <div><p className="eyebrow cyan">МИНИЙ ТУСЛАХ</p><h2>Өнөөдөр нэг жижиг алхмаас эхэлье.</h2><p>Зорилгодоо ойртох ажлаа сонгож, хийх цагаа цэгцлээрэй. Тайлбар эсвэл хүний тусламж хэрэгтэй бол “Миний зам” хэсгээс аваарай.</p><div className="hero-actions"><button className="primary-button" onClick={() => onNavigate("my-path")}>Миний ажлыг харах</button><button className="secondary-button" onClick={() => onSelectLevel(0)}>Сургалтаа үргэлжлүүлэх</button></div></div>
      <div className="progress-orbit" style={{ "--progress": `${progressPercent * 3.6}deg` } as React.CSSProperties}><div><strong>{progressPercent}%</strong><span>үзсэн хичээлийн хувь</span></div></div>
    </div>
    <div className="metric-grid"><Metric label="Сургалт" value={`${completed}/${total}`} copy="дуусгасан хичээл" tone="blue" />{canSupportMembers && <Metric label="Багийн дэмжлэг" value={String(pendingTasks.length)} copy="хийх ажил" tone="cyan" />}<Metric label="Нийтлэл" value={String(reviewCount)} copy="хяналт хүлээж байна" tone="violet" /><Metric label="Баталгаатай нийтлэл" value={String(approvedCount)} copy="эх сурвалж бүртгэлтэй" tone="green" /></div>
    <div className="overview-grid">
      <article className="panel focus-panel personal-focus"><div className="panel-heading"><div><p className="eyebrow cyan">МИНИЙ ОДОО ХИЙХ АЖИЛ</p><h3>{plainMongolianText(personalTitle)}</h3></div><span className="tag">{personalTag}</span></div><p>{plainMongolianText(personalDetail)}</p><button className="text-button" onClick={() => onNavigate("my-path")}>{successMap ? "Миний замыг нээх →" : "Эхлүүлэх →"}</button></article>
      <article className="panel focus-panel"><div className="panel-heading"><div><p className="eyebrow blue">ДАРААГИЙН ХИЧЭЭЛ</p><h3>{nextLesson ? `${nextLesson.levelId.toUpperCase()} · ${plainMongolianText(nextLesson.title)}` : "Одоогийн хичээлүүдээ үзэж дууссан"}</h3></div><span className="tag">{nextLesson ? `${nextLesson.minutes} минут` : "✓"}</span></div><p>{nextLesson ? "Хичээлээ үзээд сурсан зүйлээ нэг бодит ажилд туршаарай." : "Хийсэн дадлага, авсан зөвлөмжөө эргэж хараад хэрэгтэй зүйлээ давтаарай."}</p><div className="mini-progress"><span style={{ width: `${progressPercent}%` }} /></div>{nextLesson && <button className="text-button" onClick={() => onSelectLevel(Math.max(0, learningLevels.findIndex((level) => level.id === nextLesson.levelId)))}>Хичээл нээх →</button>}</article>
      {canSupportMembers && <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">БАГИЙН ДЭМЖЛЭГ</p><h3>Туслах ажлууд</h3></div><button className="text-button" onClick={() => onNavigate("members")}>Бүгдийг харах</button></div>{pendingTasks.length === 0 ? <EmptyState title="Туслах ажил нэмээгүй байна" copy="Гишүүнтэй ярилцаад дараагийн нэг ажлыг нь тохироорой." /> : pendingTasks.slice(0, 3).map((task) => <div className="compact-row" key={task.id}><span className={`risk-dot ${task.risk}`} /><div><strong>{task.memberName}</strong><small>{task.nextAction}</small></div><b>{task.dueLabel}</b></div>)}</article>}
      <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">НИЙТЛЭЛИЙН ХЯНАЛТ</p><h3>Нийтлэхийн өмнөх явц</h3></div><button className="text-button" onClick={() => onNavigate("content")}>Нооргоо харах</button></div>{drafts.length === 0 ? <EmptyState title="Ноорог алга" copy="Албан эх сурвалжтай нийтлэлийн ноорог бэлдэж болно." /> : drafts.slice(0, 3).map((draft) => <div className="compact-row" key={draft.id}><Status status={draft.status} /><div><strong>{draft.title}</strong><small>{channelLabel(draft.channel)}</small></div><b>→</b></div>)}</article>
      <article className="panel guard-panel"><div><span className="shield">✓</span><p className="eyebrow cyan">НИЙТЛЭХИЙН ӨМНӨХ ХЯНАЛТ</p><h3>Эх сурвалжтай, хүний хяналттай.</h3><p>Нооргийг автоматаар нийтлэхгүй. Сонгосон эх сурвалж, өөр хүнээр хянуулсан үр дүн, зөвшөөрлийн баримтыг бүртгэнэ.</p></div><button className="text-button light" onClick={() => onNavigate("vault")}>Албан эх сурвалж →</button></article>
    </div>
  </section>;
}

function SuccessMapPanel({ successMap, activeAction, actionHistory, supportRequests, academyPractices, lessons, first30DayEnabled, mentorLoopEnabled, checkins, coachNotes, saving, onAction }: {
  successMap: WorkspacePayload["successMap"];
  activeAction: WorkspacePayload["activeAction"];
  actionHistory: WorkspacePayload["myActionHistory"];
  supportRequests: WorkspacePayload["supportRequests"];
  academyPractices: WorkspacePayload["academyPractices"];
  lessons: WorkspacePayload["lessons"];
  first30DayEnabled: boolean;
  mentorLoopEnabled: boolean;
  checkins: WorkspacePayload["myCheckins"];
  coachNotes: WorkspacePayload["coachNotes"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  if (!successMap) {
    return (
      <section className="section-stack">
        <div className="section-intro"><div><p className="eyebrow cyan">МИНИЙ ТУСЛАХ</p><h2>Эхний алхмаа хамт олъё.</h2><p>Таны зорилго, цаг, хэрэгтэй тусламжийг 5 асуултаар тодруулна. Дараа нь хийх нэг жижиг ажлыг санал болгоно.</p></div><div className="summary-pill"><strong>5</strong><span>үндсэн асуулт</span></div></div>
        <article className="panel map-empty"><span className="shield">◉</span><h3>Эхний төлөвлөгөөгөө гаргая</h3><p>Тодорхой хариултгүй байж болно. Жишээнээс сонгоод, дараа нь хариултаа өөрчилж болно.</p><a className="primary-button" href="/onboarding">5 асуултаа эхлүүлэх</a></article>
      </section>
    );
  }

  const plan = successMap.plan;
  const activePractice = activeAction
    ? academyPractices.find((practice) => practice.actionId === activeAction.id) ?? null
    : null;
  const pendingPreviousPractices = academyPractices.filter((practice) => practice.id !== activePractice?.id && practice.status !== "reviewed");
  const reviewedPractices = academyPractices.filter((practice) => practice.id !== activePractice?.id && practice.status === "reviewed");
  const currentSupportRequest = activeAction
    ? supportRequests.find((request) => request.actionId === activeAction.id && !["member_confirmed", "closed"].includes(request.status)) ?? null
    : null;
  const resourceTitle = activeAction
    ? activeAction.resourceLessonId ? lessons.find((lesson) => lesson.id === activeAction.resourceLessonId)?.title ?? null : null
    : plan.academyRecommendation?.title ?? null;
  const resourceReason = activeAction
    ? !activeAction.resourceLessonId ? null : activeAction.resourceLessonId === plan.academyRecommendation?.lessonId
      ? plan.academyRecommendation.reason
      : "Энэ ажилд хэрэглэж болох нэмэлт хичээл. Хичээлийн хугацаа дээрх ажлын хугацаанд ороогүй."
    : plan.academyRecommendation?.reason ?? null;
  return (
    <section className="section-stack success-map-section">
      <div className="section-intro"><div><p className="eyebrow cyan">МИНИЙ ТУСЛАХ</p><h2>Нэг жижиг алхмаар урагшилъя.</h2><p>Энэ бол аппын санал болгосон чиглүүлэг. Өөртөө тохируулж сонгоорой. Хүнтэй ярилцах бол таныг урьсан хүн эсвэл дасгалжуулагчаас тусламж хүсэж болно.</p></div><div className="summary-pill"><strong>Миний зам</strong><span>{new Date(successMap.updatedAt).toLocaleDateString("mn-MN")} шинэчилсэн</span></div></div>
      {plan.version < 2 && <article className="plan-upgrade-note"><div><strong>Энэ төлөвлөгөө өмнөх ерөнхий загвараар үүссэн байна.</strong><p>Хариултаа өөрчлөхгүйгээр шинэчилж хадгалахад чиглэлдээ таарсан, дуусах шалгууртай шинэ төлөвлөгөө гарна.</p></div><a className="primary-button" href="/onboarding">Төлөвлөгөөг тодорхой болгох</a></article>}
      <MemberActionCard
        key={activeAction ? `${activeAction.id}:${activeAction.plannedFor ?? ""}` : successMap.updatedAt}
        activeAction={activeAction}
        fallbackAction={plan.todayAction}
        goal30Day={successMap.answers.goal30Day}
        currentSupportRequest={currentSupportRequest}
        resourceTitle={resourceTitle}
        resourceReason={resourceReason}
        first30DayEnabled={first30DayEnabled}
        mentorLoopEnabled={mentorLoopEnabled}
        saving={saving}
        onAction={onAction}
      />
      {activePractice && <MemberPracticeCard key={activePractice.id} practice={activePractice} supportSummaryConsent={successMap.supportSummaryConsent} saving={saving} onAction={onAction} />}
      {pendingPreviousPractices.length > 0 && <details className="panel plan-details"><summary>Өмнөх дуусгаагүй дадлага ({pendingPreviousPractices.length})</summary><div className="section-stack">{pendingPreviousPractices.map((practice) => <MemberPracticeCard key={practice.id} practice={practice} supportSummaryConsent={successMap.supportSummaryConsent} saving={saving} onAction={onAction} />)}</div></details>}
      {reviewedPractices.length > 0 && <details className="panel plan-details"><summary>Дасгалжуулагчийн санал ба өмнөх дадлага ({reviewedPractices.length})</summary><div className="section-stack">{reviewedPractices.map((practice) => <MemberPracticeCard key={practice.id} practice={practice} supportSummaryConsent={successMap.supportSummaryConsent} saving={saving} onAction={onAction} />)}</div></details>}
      {supportRequests.some((request) => request.status === "resolved") && (
        <article className="panel support-confirmation"><p className="eyebrow blue">ТУСЛАМЖИЙН ҮР ДҮН</p><h3>Өгсөн тусламж хэрэг болсон уу?</h3>{supportRequests.filter((request) => request.status === "resolved").map((request) => <div key={request.id}><p>{request.resolutionNote}</p><div className="action-buttons"><button className="primary-button" disabled={saving} onClick={() => void onAction({ action: "confirm_support_request", supportRequestId: request.id, helpful: true }, "Тус болсон гэж тэмдэглэлээ.")}>Тийм, тус болсон</button><button className="secondary-button" disabled={saving} onClick={() => void onAction({ action: "confirm_support_request", supportRequestId: request.id, helpful: false }, "Өөр арга хэрэгтэй гэж тэмдэглэлээ.")}>Үгүй, өөр арга хэрэгтэй</button></div></div>)}</article>
      )}
      <details className="panel plan-details">
        <summary>Миний хүсэл, зорилго, дэлгэрэнгүй төлөвлөгөө</summary>
        <ol className="goal-path" aria-label="Хүсэл мөрөөдлөөс өнөөдрийн ажил хүртэл">
          <li><strong>Миний хүсэж буй ирээдүй</strong><p>Ямар амьдралтай болохыг хүсэж байна вэ? Тэр хүсэлдээ ойртох нэг өөрчлөлтийг доорх зорилгоосоо хараарай.</p></li>
          <li><strong>30 хоногийн зорилго</strong><p>{successMap.answers.goal30Day}</p></li>
          <li><strong>Энэ 7 хоног</strong><p>{plainMongolianText(checkins[0]?.nextFocus || plan.weeklyActions[0]?.title || "Дараа хийх нэг ажлаа сонгоорой.")}</p></li>
          <li><strong>Одоо</strong><p>{activeAction ? plainMongolianText(activeAction.title) : first30DayEnabled ? "Хийсэн зүйлээ тэмдэглээд дараагийн алхмаа сонгох" : plainMongolianText(plan.todayAction.title)}</p></li>
        </ol>
        <p className="assistant-note">Хүссэн ирээдүйгээ төсөөлөх нь юуг хүсэж байгаагаа тодруулах арга. Үр дүнд хүрэхэд бодит үйлдэл, суралцах явц, нөхцөл боломж нөлөөлнө.</p>
        <article className="answer-brief"><div className="answer-brief-grid"><div><span>Одоогийн нөхцөл</span><strong>{successMap.answers.currentContext}</strong></div><div><span>30 хоногийн хүссэн үр дүн</span><strong>{successMap.answers.goal30Day}</strong></div><div><span>7 хоногт гаргах нийт хугацаа</span><strong>{successMap.answers.weeklyCapacity}</strong></div><div><span>Гол саад</span><strong>{successMap.answers.primaryBlocker}</strong></div><div><span>Надад хэрэгтэй тусламж</span><strong>{successMap.answers.growthPreferences}</strong></div></div></article>
        <div className="plan-detail-copy"><h3>{plainMongolianText(plan.profileSummary)}</h3><p>{plainMongolianText(plan.whyThisPlan)}</p><p>{successMap.planSource === "ai_gateway" ? "Энэ төлөвлөгөөг хиймэл оюуны тусламжтай боловсруулсан. Алдаатай зүйл байвал хариултаа засаж болно." : "Энэ төлөвлөгөөг таны хариултад тохирох бэлэн чиглүүлгээс гаргасан."}</p><a className="text-button" href="/onboarding">5 хариултаа засах →</a></div>
        <div className="success-map-grid">
          <article><p className="eyebrow blue">7 ХОНОГИЙН АЛХАМ</p><div className="map-list">{plan.weeklyActions.map((item, index) => <div key={`${item.title}-${index}`}><span>{index + 1}</span><div><strong>{plainMongolianText(item.title)}</strong><p>{plainMongolianText(item.detail)}</p><small>✓ {plainMongolianText(item.doneWhen)}</small></div></div>)}</div></article>
          <article><p className="eyebrow blue">30 ХОНОГИЙН ТӨЛӨВЛӨГӨӨ</p><ul className="map-bullets">{plan.managementPlan.focus.map((item) => <li key={item}>{plainMongolianText(item)}</li>)}</ul><h4>Хэзээ эргэж харах вэ?</h4><ul className="map-bullets muted">{plan.managementPlan.cadence.map((item) => <li key={item}>{plainMongolianText(item)}</li>)}</ul></article>
          {plan.contentPlan && <article><p className="eyebrow blue">ТАНЫ ХҮССЭН НИЙТЛЭЛИЙН ТӨЛӨВЛӨГӨӨ</p><div className="content-calendar">{plan.contentPlan.sevenDayPlan.map((item) => <div key={item.day}><strong>{item.day}</strong><span>{plainMongolianText(item.action)}</span></div>)}</div></article>}
        </div>
      </details>
      {actionHistory.length > 0 && <details className="panel plan-details action-history"><summary>Өмнө хийсэн ба сонгосон ажлууд</summary>{actionHistory.slice(0, 6).map((item) => <div key={item.id}><strong>{plainMongolianText(item.title)}</strong><span>{actionStatusLabel(item.status)} · {item.minutes} минут</span></div>)}</details>}
      <WeeklyCheckinPanel checkins={checkins} canProposeNext={mentorLoopEnabled && !activeAction} supportSummaryConsent={successMap.supportSummaryConsent} saving={saving} onAction={onAction} />
      {coachNotes.length > 0 && <article className="panel member-coach-notes"><p className="eyebrow blue">ХҮНЭЭС ИРСЭН ЗӨВЛӨМЖ</p><h3>Урьсан хүн, дасгалжуулагчийн санал</h3>{coachNotes.map((note) => <div key={note.id}><strong>{note.authorName}</strong><p>{note.note}</p>{note.nextAction && <small>Дараагийн алхам: {note.nextAction}</small>}</div>)}</article>}
    </section>
  );
}

function supportStatusLabel(status: string) {
  return {
    unassigned: "Хариуцах хүн хараахан оноогдоогүй",
    assigned: "Хүсэлт хариуцах хүнд илгээгдсэн",
    acknowledged: "Хүсэлтийг хүлээн авсан",
    in_progress: "Тусламж үзүүлж байна",
    resolved: "Тус болсон эсэхийг та хэлээрэй",
    member_confirmed: "Тус болсон гэж тэмдэглэсэн",
    closed: "Хүсэлт дууссан",
  }[status] ?? "Хүсэлтийн төлөвийг шалгана уу";
}

function supportTypeLabel(type: string) {
  return {
    not_understood: "Ойлгоогүй зүйл байна",
    cannot_start: "Хаанаас эхлэхээ мэдэхгүй",
    insufficient_time: "Цаг хүрэхгүй байна",
    needs_practice: "Дадлага хэрэгтэй",
    needs_person: "Хүнтэй ярилцах хэрэгтэй",
    other: "Бусад тусламж",
  }[type] ?? "Тусламжийн хүсэлт";
}

function MemberActionCard({ activeAction, fallbackAction, goal30Day, currentSupportRequest, resourceTitle, resourceReason, first30DayEnabled, mentorLoopEnabled, saving, onAction }: {
  activeAction: WorkspacePayload["activeAction"];
  fallbackAction: NonNullable<WorkspacePayload["successMap"]>["plan"]["todayAction"];
  goal30Day: string;
  currentSupportRequest: WorkspacePayload["supportRequests"][number] | null;
  resourceTitle: string | null;
  resourceReason: string | null;
  first30DayEnabled: boolean;
  mentorLoopEnabled: boolean;
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState("");
  const [requestType, setRequestType] = useState("not_understood");
  const [requestText, setRequestText] = useState("");
  const [minutes, setMinutes] = useState(String(activeAction?.minutes ?? fallbackAction.minutes));
  const [plannedFor, setPlannedFor] = useState(() => localDateTimeValue(activeAction?.plannedFor));
  const [scheduleError, setScheduleError] = useState("");

  const terminal = first30DayEnabled && !activeAction;
  const title = activeAction?.title ?? (terminal ? "Дараагийн алхмаа сонгоё" : fallbackAction.title);
  const detail = activeAction?.detail ?? (terminal ? "Доорх явцын хэсэгт хийсэн зүйлээ бичээрэй. Дараа юу хийхээ нэг өгүүлбэрээр тэмдэглээрэй." : fallbackAction.detail);
  const doneWhen = activeAction?.doneWhen || (terminal ? "Явцаа хадгалж, дараагийн ажлыг сонгоход хэрэгтэй мэдээлэл бэлэн болсон байна." : fallbackAction.doneWhen) || "Ажлаа хийж, үр дүнгээ тэмдэглэсэн байна.";
  const status = activeAction?.status ?? (terminal ? "done" : "proposed");
  const visibleTitle = plainMongolianText(title);
  // Check-in actions store one reason sentence followed by the actual action steps.
  // Older actions do not have this contract: their complete detail remains steps.
  const isMentorContinuation = Boolean(activeAction?.sourceCheckinId);
  const mentorSentences = isMentorContinuation
    ? plainMongolianText(detail).split(/(?<=[.!?])\s+/u).filter(Boolean)
    : [];
  const mentorReason = mentorSentences[0] || "Сүүлийн явцын тэмдэглэлд тулгуурлан дараагийн алхмыг санал болгож байна.";
  const visibleSteps = isMentorContinuation
    ? mentorSentences.length > 1 ? actionSteps(mentorSentences.slice(1).join(" ")) : ["Ажлын алхам дутуу байна. Хүнээс тусламж хүсэж, эхний алхмаа тодруулаарай."]
    : actionSteps(detail);
  const visibleDoneWhen = plainMongolianText(doneWhen);
  const visibleGoal = readableAnswerExcerpt(goal30Day);

  async function transition(nextStatus: "accepted" | "started" | "done" | "blocked" | "paused") {
    if (!activeAction) return;
    const isBlocked = nextStatus === "blocked";
    const success = await onAction({
      action: "transition_member_action",
      actionId: activeAction.id,
      nextStatus,
      blockedReason: isBlocked ? blockedReason : "",
      requestType: isBlocked ? requestType : null,
      requestText: isBlocked ? requestText : "",
    }, isBlocked ? "Тусламжийн хүсэлт хадгалагдлаа. Хэн хариуцахыг хүсэлтийн төлөвөөс хараарай." : nextStatus === "done" ? "Хийж дуусгасан гэж тэмдэглэлээ." : "Ажлын төлөв хадгалагдлаа.");
    if (success && isBlocked) {
      setShowBlocked(false);
      setBlockedReason("");
      setRequestText("");
    }
  }

  async function changeTime(event: FormEvent) {
    event.preventDefault();
    if (!activeAction) return;
    await onAction({ action: "change_member_action_time", actionId: activeAction.id, minutes: Number(minutes) }, "Ажлын хугацаа шинэчлэгдлээ.");
  }

  async function scheduleAction(event: FormEvent) {
    event.preventDefault();
    if (!activeAction || !mentorLoopEnabled) return;
    setScheduleError("");
    const date = new Date(plannedFor);
    if (!plannedFor || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      setScheduleError("Хийх өдөр, цагаа одооноос хойших хугацаагаар сонгоорой.");
      return;
    }
    await onAction({ action: "schedule_member_action", actionId: activeAction.id, plannedFor: date.toISOString() }, "Хийх өдөр, цагийг апп дотор хадгаллаа. Утас руу автомат мэдэгдэл илгээхгүй.");
  }

  return (
    <article className="panel member-action-card">
      <header><div><p className="eyebrow cyan">ОДОО ХИЙХ НЭГ АЖИЛ</p><h3>{visibleTitle}</h3></div>{!terminal && <span className={`action-status status-${status}`}>{actionStatusLabel(status)}</span>}</header>
      <div className="action-reason"><span>Яагаад энэ ажил вэ?</span><p>{terminal ? "Хийсэн зүйлээ эргэж хараад, цааш юу хийхээ сонгоход тусална." : isMentorContinuation ? mentorReason : visibleGoal ? <>Таны “{visibleGoal}” гэсэн зорилго руу нэг жижиг алхмаар ойртохын тулд.</> : <>Таны 30 хоногийн зорилго руу нэг жижиг алхмаар ойртохын тулд.</>}</p></div>
      <div className="action-step-list"><strong>Яг яаж хийх вэ?</strong><ol>{visibleSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></div>
      {!terminal && <div className="action-meta"><span>Гаргах хугацаа: <strong>{activeAction?.minutes ?? fallbackAction.minutes} минут</strong></span>{resourceTitle && <span className="resource-meta"><strong>Хэрэгтэй бол үзэх хичээл</strong> {plainMongolianText(resourceTitle)}{resourceReason && <small>{plainMongolianText(resourceReason)}</small>}</span>}</div>}
      <div className="done-criterion"><span>Ингэвэл дууссан гэж үзнэ</span><strong>{visibleDoneWhen}</strong></div>

      <div className="action-help">
        <details><summary>Илүү энгийнээр</summary><p>Бүгдийг нэг дор хийх шаардлагагүй. Эхлээд зөвхөн энэ алхмыг хийгээрэй:</p><strong>{visibleSteps[0]}</strong><p>Дуусмагц дараагийн алхамдаа ороорой. Ойлгомжгүй хэвээр байвал хүний тусламж хүсэж болно.</p></details>
        <details><summary>Жишээ харах</summary><p>Хийсэн зүйлээ ингэж товч тэмдэглэж болно:</p><blockquote>“Эхний алхмыг хийсэн. Нэг зүйл ойлгомжгүй үлдсэн тул жишээ асуумаар байна.”</blockquote><small>Энэ бол бичих хэлбэрийн жишээ. Өөрийн хийсэн зүйлээ бичээрэй.</small></details>
      </div>

      {!first30DayEnabled ? (
        <div className="feature-disabled-note"><strong>Одоогоор төлөвлөгөөгөө унших боломжтой.</strong><span>Энэ орчинд ажлын явц, хийх цаг, тусламжийн хүсэлтийг эндээс хадгалах боломж хараахан нээгдээгүй байна.</span></div>
      ) : !activeAction ? (
        <div className="practice-feedback"><strong>Дараагийн алхам</strong><p>{mentorLoopEnabled ? "Доорх явцаа хадгалахад дараагийн нэг ажлыг санал болгоно. Санал болгосон ажлыг хараад эхлэх эсэхээ та сонгоно." : "Доорх явцаа тэмдэглээрэй. Дараагийн ажлаа сонгохын тулд төлөвлөгөөгөө шинэчлэх эсвэл дасгалжуулагчийн зөвлөгөөг ашиглаж болно."}</p></div>
      ) : (
        <>
          <div className="action-buttons">
            {["proposed", "accepted", "paused", "blocked"].includes(status) && <button className="primary-button" disabled={saving} onClick={() => void transition("started")}>{status === "paused" || status === "blocked" ? "Үргэлжлүүлэх" : "Эхэлье"}</button>}
            {["proposed", "accepted", "started"].includes(status) && <button className="secondary-button" disabled={saving} onClick={() => void transition("done")}>✓ Хийж дуусгалаа</button>}
            {["proposed", "accepted", "started"].includes(status) && <button className="secondary-button" disabled={saving} aria-expanded={showBlocked} onClick={() => setShowBlocked((value) => !value)}>Хүнээс тусламж авъя</button>}
            {["accepted", "started"].includes(status) && <button className="text-button" disabled={saving} onClick={() => void transition("paused")}>Түр завсарлах</button>}
          </div>
          {!['done', 'superseded'].includes(status) && <details className="action-planning"><summary>Хийх цаг, хугацаагаа цэгцлэх</summary><form className="action-time-form" onSubmit={changeTime}><label>Энэ ажилд гаргах минут<input type="number" min="5" max={activeAction.capacityMinutes} step="5" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><button className="text-button" disabled={saving || Number(minutes) === activeAction.minutes || !Number.isFinite(Number(minutes)) || Number(minutes) < 5 || Number(minutes) > activeAction.capacityMinutes}>Минутыг хадгалах</button></form><p className="assistant-note">Хугацааг өөрчлөх нь ажлын алхмуудыг автоматаар багасгахгүй. Амжихгүй бол тусламж хүсээрэй.</p>
            {mentorLoopEnabled ? <form className="action-schedule-form" onSubmit={scheduleAction}><label>Хийх өдөр, цаг<input type="datetime-local" value={plannedFor} onChange={(event) => { setPlannedFor(event.target.value); setScheduleError(""); }} required /></label><p className="assistant-note">Таны төхөөрөмжийн орон нутгийн цагаар апп дотор хадгална. Утас руу автомат мэдэгдэл илгээхгүй. Хэрэгтэй бол утасныхаа сануулгад нэмж болно.</p>{scheduleError && <p className="auth-message error" role="alert">{scheduleError}</p>}<button className="secondary-button" type="submit" disabled={saving || !plannedFor || plannedFor === localDateTimeValue(activeAction.plannedFor)}>Хийх цагаа хадгалах</button></form> : <p className="assistant-note">Хийх өдөр, цагаа утасныхаа сануулга эсвэл дэвтэрт тэмдэглээрэй. Апп дотор цаг товлох боломж энэ орчинд хараахан нээгдээгүй байна.</p>}
          </details>}
          {activeAction.plannedFor && <p className="scheduled-action"><strong>Миний товлосон цаг:</strong> {new Date(activeAction.plannedFor).toLocaleString("mn-MN")} <span>Утас руу автомат мэдэгдэл илгээхгүй.</span></p>}
          {showBlocked && (
            <form className="blocked-form" onSubmit={(event) => { event.preventDefault(); void transition("blocked"); }}>
              <label>Юун дээр гацсан бэ?<textarea value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} maxLength={1200} required /></label>
              <label>Ямар тусламж хэрэгтэй вэ?<select value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="not_understood">Ойлгоогүй зүйлээ тайлбарлуулах</option><option value="cannot_start">Хаанаас эхлэхээ тодруулах</option><option value="insufficient_time">Цагтаа тааруулж багасгах</option><option value="needs_practice">Дадлага, жишээ авах</option><option value="needs_person">Урьсан хүн, дасгалжуулагчтай ярилцах</option><option value="other">Бусад</option></select></label>
              <label>Таныг урьсан хүн, дасгалжуулагчид хэлэх зүйл<textarea value={requestText} onChange={(event) => setRequestText(event.target.value)} maxLength={1200} required /></label>
              <p className="assistant-note">Хүсэлтийн талбарт бичсэн зүйлийг танд туслах хүнд харуулна. Энэ нь эхний асуултын хариултуудаа хуваалцах зөвшөөрлөөс тусдаа хүсэлт юм.</p>
              <button className="primary-button" type="submit" disabled={saving || blockedReason.trim().length < 3 || requestText.trim().length < 3}>Тусламжийн хүсэлт илгээх</button>
            </form>
          )}
          {currentSupportRequest && <div className="support-request-state"><span>{supportStatusLabel(currentSupportRequest.status)}</span><p>{currentSupportRequest.requestText}</p>{currentSupportRequest.nextCheckAt && <small>Дараагийн шалгалт: {new Date(currentSupportRequest.nextCheckAt).toLocaleString("mn-MN")}</small>}</div>}
        </>
      )}
    </article>
  );
}

function MemberPracticeCard({ practice, supportSummaryConsent, saving, onAction }: {
  practice: WorkspacePayload["academyPractices"][number];
  supportSummaryConsent: boolean;
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  const [submission, setSubmission] = useState(practice.submission);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onAction({ action: "submit_academy_practice", practiceId: practice.id, submission }, supportSummaryConsent ? "Дадлагын үр дүн хадгалагдлаа. Хариуцсан хүнтэй бол тэр хүн санал өгөх боломжтой." : "Дадлагын үр дүн хадгалагдлаа. Хуваалцах зөвшөөрөл унтраалттай тул дасгалжуулагчид илгээсэн гэж тооцохгүй.");
  }

  return (
    <article className="panel practice-card">
      <p className="eyebrow blue">СУРГАЛТ · БОДИТ ДАДЛАГА</p><h3>Хийсэн ажлынхаа үр дүнг 2–3 өгүүлбэрээр бичээрэй.</h3>
      <p className="practice-assignment"><strong>Таны даалгавар:</strong> {plainMongolianText(practice.prompt)}</p>
      <div className="practice-guide"><span>Бичих дараалал</span><ol><li>Би яг юу хийсэн бэ?</li><li>Ямар үр дүн гарсан бэ?</li><li>Дараагийн удаа юуг өөрчлөх вэ?</li></ol></div>
      {practice.status === "reviewed" ? <div className="practice-feedback"><strong>Дасгалжуулагчийн санал</strong><p>{practice.feedback}</p></div> : <form onSubmit={submit}><label>Таны бодит үр дүн<textarea value={submission} onChange={(event) => setSubmission(event.target.value)} maxLength={2400} placeholder="Жишээ: Нэг асуулт сонгож 5 өгүүлбэр бичсэн. Хэт урт хоёр өгүүлбэрээ богиносгосон. Дараа нь хүнээр хянуулна." required /></label><p className="assistant-note">{supportSummaryConsent ? "Хуваалцахыг зөвшөөрсөн тул таныг урьсан хүн, хариуцсан дасгалжуулагч энэ дадлагыг харж болно." : "Дасгалжуулагчаас санал авах бол эхний 5 асуултын хэсгийн хуваалцах тохиргоог хараарай. Зөвшөөрөх эсэхээ та сонгоно."}</p><p className="assistant-note">{SUPPORT_SHARING_DESCRIPTION}</p>{!supportSummaryConsent && <a className="text-button" href="/onboarding">Хуваалцах тохиргоо харах</a>}<button className="secondary-button" type="submit" disabled={saving || submission.trim().length < 10}>{practice.status === "submitted" ? "Хариултаа шинэчлэх" : "Дадлагын үр дүнг хадгалах"}</button></form>}
    </article>
  );
}

function WeeklyCheckinPanel({ checkins, canProposeNext, supportSummaryConsent, saving, onAction }: {
  checkins: WorkspacePayload["myCheckins"];
  canProposeNext: boolean;
  supportSummaryConsent: boolean;
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
}) {
  const [form, setForm] = useState({ progressSummary: "", blocker: "", helpRequest: "", nextFocus: "", progressPercent: "0", needsHelp: false });
  const helpIsValid = !form.needsHelp || form.blocker.trim().length >= 3 || form.helpRequest.trim().length >= 3;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.progressSummary.trim().length < 3 || form.nextFocus.trim().length < 3 || !helpIsValid) return;
    if (!await onAction({ ...form, action: "weekly_checkin", progressPercent: Number(form.progressPercent) }, "7 хоногийн явц хадгалагдлаа.")) return;
    setForm({ progressSummary: "", blocker: "", helpRequest: "", nextFocus: "", progressPercent: "0", needsHelp: false });
  }

  return (
    <div className="weekly-checkin-layout">
      <form className="panel form-panel" onSubmit={submit}>
        <p className="eyebrow blue">7 ХОНОГИЙН ЯВЦ</p><h3>Энэ 7 хоногт юу хийв?</h3>
        <p className="assistant-note">Хийж амжаагүй бол түүнийгээ бичиж болно. Хариултад зөв, буруу гэж байхгүй.</p>
        <label>1. Энэ 7 хоногт яг юу хийсэн бэ?<textarea value={form.progressSummary} onChange={(event) => setForm({ ...form, progressSummary: event.target.value })} maxLength={1200} placeholder="Жишээ: Нэг асуулт сонгож, 5 өгүүлбэрийн ноорог бичсэн." required /></label>
        <label>2. Дараагийн 7 хоногт хийх ганц ажил<textarea value={form.nextFocus} onChange={(event) => setForm({ ...form, nextFocus: event.target.value })} maxLength={1200} placeholder="Жишээ: Нооргоо хүнээр хянуулаад нэг удаа засна." required /></label>
        <label>Өөрийн явцыг хэрхэн үнэлж байна вэ?<select value={form.progressPercent} onChange={(event) => setForm({ ...form, progressPercent: event.target.value })}><option value="0">Эхлээгүй</option><option value="25">Эхэлсэн</option><option value="50">Тал орчим</option><option value="75">Ихэнхийг хийсэн</option><option value="100">Дууссан</option></select></label>
        <label className="check-row"><input type="checkbox" checked={form.needsHelp} onChange={(event) => setForm({ ...form, needsHelp: event.target.checked, blocker: event.target.checked ? form.blocker : "", helpRequest: event.target.checked ? form.helpRequest : "" })} /> Тусламж хэрэгтэй байгаагаа тэмдэглэе</label>
        <p className="assistant-note">Энд тэмдэглэх нь тусламж хэрэгтэй байгааг л хадгална. Хуваалцах зөвшөөрөлтэй байсан ч тусламжийн хүсэлт үүсгэхгүй, хүнд мэдэгдэл илгээхгүй. Хүсэлт илгээх бол одоогийн ажлын “Хүнээс тусламж авъя” товчийг ашиглаарай.</p>
        {form.needsHelp && <div className="checkin-help-fields"><label>Юун дээр гацсан бэ?<textarea value={form.blocker} onChange={(event) => setForm({ ...form, blocker: event.target.value })} maxLength={1200} placeholder="Ойлгоогүй эсвэл эхэлж чадахгүй байгаа нэг зүйлээ бичнэ үү." /></label><label>Ямар тусламж авбал үргэлжлүүлж чадах вэ?<textarea value={form.helpRequest} onChange={(event) => setForm({ ...form, helpRequest: event.target.value })} maxLength={1200} placeholder="Жишээ, тайлбар, хугацаа багасгах эсвэл богино ярилцлагаас сонгоно уу." /></label></div>}
        {form.needsHelp && !supportSummaryConsent && <p className="assistant-note">Таны хуваалцах зөвшөөрөл унтраалттай байна. Хүсвэл <a href="/onboarding">хуваалцах тохиргоогоо</a> хараарай. Зөвшөөрлийг асаах нь өөрөө тусламжийн хүсэлт илгээхгүй.</p>}
        <p className="assistant-note">{canProposeNext ? "Одоогоор хийх ажил сонгоогүй байна. Явцаа хадгалахад дараагийн нэг ажлыг санал болгоно. Эхлэх эсэхээ та сонгоно." : "Явцаа хадгалах нь одоогийн ажлыг солихгүй. Дараагийн алхмаа тэмдэглэж үлдээнэ."}</p>
        <button className="primary-button" type="submit" disabled={saving || form.progressSummary.trim().length < 3 || form.nextFocus.trim().length < 3 || !helpIsValid}>{saving ? "Хадгалж байна…" : "Явцаа хадгалах"}</button>
      </form>
      <article className="panel checkin-history"><div className="panel-heading"><div><p className="eyebrow blue">ӨМНӨХ ЯВЦ</p><h3>Сүүлийн тэмдэглэлүүд</h3></div><span className="count-badge">{checkins.length}</span></div>{checkins.length === 0 ? <EmptyState title="Явцын тэмдэглэл алга" copy="Эхний 7 хоногийн үр дүнгээ хадгалсны дараа энд түүх үүснэ." /> : checkins.slice(0, 6).map((checkin) => <div className="checkin-row" key={checkin.id}><strong>{new Date(checkin.createdAt).toLocaleDateString("mn-MN")} · Өөрийн үнэлгээ: {checkin.progressPercent}%</strong><p>{checkin.progressSummary}</p><small>{checkin.needsHelp ? "Хэрэгтэй гэж тэмдэглэсэн тусламж" : "Дараагийн гол ажил"}: {checkin.needsHelp ? checkin.helpRequest || checkin.blocker : checkin.nextFocus}</small></div>)}</article>
    </div>
  );
}

function Metric({ label, value, copy, tone }: { label: string; value: string; copy: string; tone: string }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{copy}</small></article>;
}

function Status({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{statusLabels[status] ?? "Төлөвийг шалгана уу"}</span>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>＋</span><strong>{title}</strong><p>{copy}</p></div>;
}
