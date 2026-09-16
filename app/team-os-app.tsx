"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "./brand";
import { learningLevels, officialSources, type WorkspacePayload } from "./team-os-data";
import { AdminInvitations } from "./admin-invitations";

type Section = "overview" | "my-path" | "academy" | "content" | "members" | "vault" | "users";

const emptyWorkspace: WorkspacePayload = {
  viewer: { userId: "", role: "user", canReview: false, canRecordCorporateApproval: false },
  progress: [],
  lessons: [],
  drafts: [],
  memberTasks: [],
  users: [],
  supportMembers: [],
  myCheckins: [],
  coachNotes: [],
  successMap: null,
};

const navItems: Array<{ id: Section; label: string; short: string; symbol: string }> = [
  { id: "overview", label: "Хяналтын төв", short: "Төв", symbol: "⌂" },
  { id: "my-path", label: "Миний зам", short: "Зам", symbol: "◉" },
  { id: "academy", label: "Academy", short: "Academy", symbol: "▤" },
  { id: "content", label: "Content Studio", short: "Контент", symbol: "✦" },
  { id: "members", label: "Багийн дэмжлэг", short: "Баг", symbol: "◎" },
  { id: "vault", label: "Source Vault", short: "Vault", symbol: "◇" },
  { id: "users", label: "Хэрэглэгчид", short: "Users", symbol: "♙" },
];

const statusLabels: Record<string, string> = {
  draft: "Ноорог",
  review: "Хяналтад",
  approved: "Legacy · нотолгоо дутуу",
  internal_approved: "Дотоод хяналт тэнцсэн",
  corporate_approved: "Approval reference бүртгэгдсэн",
  source_allowed: "Review-д зөвшөөрсөн",
  archived: "Архив",
};

async function fetchWorkspace(): Promise<WorkspacePayload> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok) throw new Error("workspace unavailable");
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
    } catch {
      setNotice("Өгөгдлийн холболтыг шалгаж байна. Түр хугацаанд унших горим ажиллаж байна.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchWorkspace()
      .then((nextWorkspace) => {
        if (active) setWorkspace(nextWorkspace);
      })
      .catch(() => {
        if (active) setNotice("Өгөгдлийн холболтыг шалгаж байна. Түр хугацаанд унших горим ажиллаж байна.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function runAction(payload: Record<string, unknown>, successMessage: string) {
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
      await loadWorkspace();
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Хадгалж чадсангүй");
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

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!draftForm.title.trim()) return;
    await runAction({ action: "create_draft", ...draftForm }, "Ноорог үүслээ. Нийтлэхээс өмнө хяналтад оруулна уу.");
    setDraftForm((current) => ({ ...current, title: "" }));
  }

  async function submitMemberTask(event: FormEvent) {
    event.preventDefault();
    if (!memberForm.memberName.trim() || !memberForm.nextAction.trim()) return;
    await runAction({ action: "add_member_task", ...memberForm }, "Member Success task нэмэгдлээ.");
    setMemberForm({ memberName: "", milestone: "72 цаг", nextAction: "", dueLabel: "Өнөөдөр", risk: "normal" });
  }

  async function submitLesson(event: FormEvent) {
    event.preventDefault();
    await runAction(
      { action: "create_lesson", levelId: selected.id, ...lessonForm, minutes: Number(lessonForm.minutes) },
      "Шинэ хичээл нийтлэгдлээ.",
    );
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
          <div className="compliance-status"><span /> Pilot controls идэвхтэй</div>
          <form action="/auth/signout" method="post"><button type="submit">Гарах</button></form>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">PRIVATE TEAM PLATFORM</p>
            <h1>{visibleNavItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="sync-state"><span className={loading ? "pulse" : ""} />{loading ? "Холбож байна" : "Өгөгдөл шинэ"}</div>
            <div className="user-chip"><span>{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role} · {user.email}</small></div></div>
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
              onNavigate={setSection}
              onSelectLevel={(index) => { setSelectedLevel(index); setSection("academy"); }}
            />
          )}

          {section === "my-path" && (
            <SuccessMapPanel
              successMap={workspace.successMap}
              checkins={workspace.myCheckins}
              coachNotes={workspace.coachNotes.filter((note) => note.memberUserId === workspace.viewer.userId)}
              saving={saving}
              onAction={runAction}
            />
          )}

          {section === "academy" && (
            <section className="section-stack">
              <div className="section-intro">
                <div><p className="eyebrow blue">LEARNING CENTER</p><h2>Хичээлээ нээж үзээд, ахицаа хадгална.</h2><p>Хичээл бүрийн агуулгыг уншиж дуусаад “Дуусгасан” гэж тэмдэглэнэ. Ахиц таны бүртгэл дээр хадгалагдана.</p></div>
                <div className="summary-pill"><strong>{progressPercent}%</strong><span>нийт зам</span></div>
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
                    <p className="eyebrow blue">ADMIN · NEW LESSON</p><h3>{selected.level}-д хичээл нэмэх</h3>
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
                <div><p className="eyebrow blue">SOURCE-LOCKED CONTENT</p><h2>Эх сурвалж ба тусдаа хяналтыг баримтжуулна.</h2><p>Ноорог эзэмшигч өөрийгөө approve хийхгүй. Company approval нь заавал тусдаа reference-тэй байна.</p></div>
                <div className="mode-badge"><span>SAFE MODE</span><strong>Template engine</strong><small>Generative AI credential хүлээгдэж байна</small></div>
              </div>
              <div className="workflow-strip"><span><b>01</b> Эх сурвалж</span><i>→</i><span><b>02</b> Ноорог</span><i>→</i><span><b>03</b> Хяналт</span><i>→</i><span><b>04</b> Батлах</span></div>
              <div className="content-layout">
                <form className="panel form-panel" onSubmit={submitDraft}>
                  <div className="panel-heading"><div><p className="eyebrow blue">NEW DRAFT</p><h3>Контентын ноорог</h3></div><span className="source-lock">◇ Source lock</span></div>
                  <label>Сэдэв<input value={draftForm.title} onChange={(event) => setDraftForm({ ...draftForm, title: event.target.value })} placeholder="Жишээ: Аяллын төсвөө 3 алхмаар төлөвлөх" maxLength={140} /></label>
                  <div className="field-grid">
                    <label>Суваг<select value={draftForm.channel} onChange={(event) => setDraftForm({ ...draftForm, channel: event.target.value })}><option>Facebook</option><option>Instagram</option><option>Short video</option><option>FAQ</option><option>Message</option></select></label>
                    <label>Албан эх сурвалж<select value={draftForm.sourceId} onChange={(event) => setDraftForm({ ...draftForm, sourceId: event.target.value })}>{officialSources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
                  </div>
                  <div className="guardrail-copy"><strong>Human review required</strong><span>Source lock болон role separation идэвхтэй. Automatic claim scanner энэ release-д идэвхжээгүй.</span></div>
                  <button className="primary-button" type="submit" disabled={saving || !draftForm.title.trim()}>Аюулгүй ноорог үүсгэх</button>
                </form>
                <article className="panel queue-panel">
                  <div className="panel-heading"><div><p className="eyebrow blue">CONTENT QUEUE</p><h3>Ноорог ба зөвшөөрөл</h3></div><span className="count-badge">{activeDrafts.length}</span></div>
                  {activeDrafts.length === 0 ? <EmptyState title="Одоогоор ноорог алга" copy="Зүүн талын form-оор баталсан эх сурвалжтай эхний нооргоо үүсгэнэ үү." /> : (
                    <div className="draft-list">{activeDrafts.map((draft) => {
                      const source = officialSources.find((item) => item.id === draft.sourceId);
                      const canArchive = draft.isOwner || workspace.viewer.role === "admin";
                      return (
                        <div className="draft-card" key={draft.id}>
                          <div className="draft-top"><Status status={draft.status} /><small>{draft.channel}</small></div>
                          <h4>{draft.title}</h4>
                          <p>{draft.excerpt}</p>
                          {draft.reviewNote && <p className="review-evidence">Review note: {draft.reviewNote}</p>}
                          {draft.corporateApprovalRef && <p className="review-evidence">Approval reference: {draft.corporateApprovalRef}</p>}
                          <div className="draft-bottom">
                            <span>{source?.title ?? `${draft.sourceId} · legacy mapping шаардлагатай`}</span>
                            <div className="draft-actions">
                              {draft.status === "draft" && draft.isOwner && source && (
                                <button onClick={() => void runAction({ action: "submit_draft", id: draft.id }, "Ноорог тусдаа хянагчийн queue-д орлоо.")} disabled={saving}>Хяналтад өгөх →</button>
                              )}
                              {draft.status === "draft" && draft.isOwner && !source && <small>Source mapping хийсний дараа илгээнэ</small>}
                              {draft.status === "review" && workspace.viewer.canReview && !draft.isOwner && (
                                <>
                                  <button onClick={() => void runAction({ action: "review_draft", id: draft.id, decision: "return_to_draft" }, "Ноорог засварт буцлаа.")} disabled={saving}>Засварт буцаах</button>
                                  <button onClick={() => void runAction({ action: "review_draft", id: draft.id, decision: "internal_approved" }, "Тусдаа хянагчийн дотоод review бүртгэгдлээ.")} disabled={saving}>Дотоод хяналт тэнцсэн →</button>
                                </>
                              )}
                              {draft.status === "review" && (!workspace.viewer.canReview || draft.isOwner) && <small>Тусдаа хянагч хүлээж байна</small>}
                              {draft.status === "internal_approved" && workspace.viewer.canRecordCorporateApproval && !draft.isOwner && (
                                <label className="approval-reference">
                                  <span>Компанийн бичгээр өгсөн approval reference</span>
                                  <input
                                    value={approvalReferences[draft.id] ?? ""}
                                    onChange={(event) => setApprovalReferences((current) => ({ ...current, [draft.id]: event.target.value }))}
                                    placeholder="Ticket / email / document reference"
                                    maxLength={240}
                                  />
                                  <button
                                    onClick={() => void runAction({ action: "record_corporate_approval", id: draft.id, evidenceRef: approvalReferences[draft.id] ?? "" }, "Company approval reference бүртгэгдлээ.")}
                                    disabled={saving || (approvalReferences[draft.id] ?? "").trim().length < 3}
                                  >Reference бүртгэх →</button>
                                </label>
                              )}
                              {draft.status === "internal_approved" && (!workspace.viewer.canRecordCorporateApproval || draft.isOwner) && <small>Тусдаа admin approval reference бүртгэнэ</small>}
                              {draft.status === "approved" && <small>Legacy status — company approval нотлогдоогүй</small>}
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
              <div className="section-intro"><div><p className="eyebrow blue">SPONSOR · COACH CONTROL</p><h2>Хэн хэний багт, юун дээр тусламж хэрэгтэйг нэг дор харна.</h2><p>Зөвхөн танд хуваарилагдсан гишүүний coaching summary, weekly check-in, blocker болон тусламжийн хүсэлт харагдана.</p></div><div className="summary-pill"><strong>{workspace.supportMembers.length}</strong><span>хариуцсан хүн</span></div></div>
              <TeamSupportPanel members={workspace.supportMembers} notes={workspace.coachNotes} saving={saving} onAction={runAction} />
              <div className="lifecycle"><div><b>0–72 цаг</b><span>Welcome + зорилго</span></div><div><b>30 хоног</b><span>Readiness + blocker</span></div><div><b>60 хоног</b><span>Value review</span></div><div><b>90 хоног</b><span>Next plan</span></div></div>
              <div className="member-layout">
                <form className="panel form-panel" onSubmit={submitMemberTask}>
                  <p className="eyebrow blue">MANUAL FOLLOW-UP</p><h3>Нэмэлт Success task</h3>
                  <label>Гишүүний нэр<input value={memberForm.memberName} onChange={(event) => setMemberForm({ ...memberForm, memberName: event.target.value })} placeholder="Нэр" maxLength={80} /></label>
                  <div className="field-grid"><label>Үе шат<select value={memberForm.milestone} onChange={(event) => setMemberForm({ ...memberForm, milestone: event.target.value })}><option>72 цаг</option><option>30 хоног</option><option>60 хоног</option><option>90 хоног</option></select></label><label>Эрсдэл<select value={memberForm.risk} onChange={(event) => setMemberForm({ ...memberForm, risk: event.target.value })}><option value="normal">Хэвийн</option><option value="attention">Анхаарах</option><option value="urgent">Яаралтай</option></select></label></div>
                  <label>Дараагийн алхам<textarea value={memberForm.nextAction} onChange={(event) => setMemberForm({ ...memberForm, nextAction: event.target.value })} placeholder="Жишээ: Аяллын зорилгыг тодруулж, FAQ илгээх" maxLength={180} /></label>
                  <label>Хугацаа<input value={memberForm.dueLabel} onChange={(event) => setMemberForm({ ...memberForm, dueLabel: event.target.value })} placeholder="Өнөөдөр 18:00" maxLength={40} /></label>
                  <button className="primary-button" type="submit" disabled={saving || !memberForm.memberName.trim() || !memberForm.nextAction.trim()}>Task нэмэх</button>
                </form>
                <article className="panel task-panel">
                  <div className="panel-heading"><div><p className="eyebrow blue">SUCCESS QUEUE</p><h3>Дараагийн ажиллагаа</h3></div><span className="count-badge">{pendingMemberTasks.length}</span></div>
                  {pendingMemberTasks.length === 0 ? <EmptyState title="Queue цэвэр байна" copy="Гишүүний дараагийн алхмыг нэмэхэд энд эрэмбэлэгдэн харагдана." /> : <div className="task-list">{pendingMemberTasks.map((task) => <div className="task-row" key={task.id}><span className={`risk-dot ${task.risk}`} /><div><strong>{task.memberName}</strong><p>{task.nextAction}</p><small>{task.milestone} · {task.dueLabel}</small></div><button onClick={() => void runAction({ action: "complete_member_task", id: task.id }, "Task дууссанд бүртгэгдлээ.")} disabled={saving} aria-label={`${task.memberName} task дуусгах`}>✓</button></div>)}</div>}
                </article>
              </div>
            </section>
          )}

          {section === "vault" && (
            <section className="section-stack">
              <div className="section-intro"><div><p className="eyebrow blue">CURATED OFFICIAL LINKS</p><h2>Ноорог бүр сонгосон эх сурвалжтай байна.</h2><p>Энэ release холбоосын allowlist ашиглана. Автомат version history болон баримтын өөрчлөлт илрүүлэлт одоогоор байхгүй.</p></div><div className="summary-pill"><strong>{officialSources.length}</strong><span>review-д зөвшөөрсөн эх</span></div></div>
              <div className="vault-grid">{officialSources.map((source) => <a className="source-card" href={source.url} target="_blank" rel="noreferrer" key={source.id}><div className="source-icon">PDF</div><div><div className="source-meta"><span>{source.category}</span><Status status="source_allowed" /></div><h3>{source.title}</h3><p>Allowlist-д шалгасан: {source.verified}</p></div><span className="external">↗</span></a>)}</div>
              <article className="policy-panel"><div><p className="eyebrow">PILOT CONTROLS</p><h3>Системийн таслах шугам</h3></div><ul><li>Auto-publish болон auto-DM байхгүй</li><li>Өөрийн нооргийг өөрөө approve хийхгүй</li><li>Company approval-д тусдаа reference шаарддаг</li><li>Бүртгэл, төлбөр, booking зөвхөн албан ёсны portal-д</li></ul><p><strong>UNVERIFIED:</strong> Монголын эрх зүй, татвар, шууд борлуулалтын ангилалд local counsel sign-off шаардлагатай. Энэ app compliance guarantee өгөхгүй.</p></article>
            </section>
          )}

          {section === "users" && user.role === "admin" && (
            <UserDirectory
              users={workspace.users}
              currentEmail={user.email}
              saving={saving}
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

      <nav className="mobile-nav" aria-label="Гар утасны цэс">
        {visibleNavItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.symbol}</span>{item.short}</button>)}
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
  onToggle: () => Promise<void>;
  onSave: (changes: { title: string; lessonType: string; minutes: number; content: string; isPublished: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: lesson.title, lessonType: lesson.type, minutes: String(lesson.minutes), content: lesson.content, isPublished: lesson.isPublished });

  async function save(event: FormEvent) {
    event.preventDefault();
    await onSave({ ...form, minutes: Number(form.minutes) });
    setEditing(false);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="lesson-dialog" role="dialog" aria-modal="true" aria-labelledby="lesson-dialog-title">
        <header className="lesson-dialog-header">
          <div><span className="tag">{lesson.type} · {lesson.minutes} мин</span><h2 id="lesson-dialog-title">{lesson.title}</h2></div>
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
    </div>
  );
}

function TeamSupportPanel({ members, notes, saving, onAction }: {
  members: WorkspacePayload["supportMembers"];
  notes: WorkspacePayload["coachNotes"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<void>;
}) {
  if (members.length === 0) {
    return <article className="panel"><EmptyState title="Хариуцсан гишүүн алга" copy="Admin урилга илгээхдээ sponsor эсвэл coach оноосны дараа гишүүний явц энд харагдана." /></article>;
  }

  return (
    <div className="support-member-grid">
      {members.map((member) => (
        <SupportMemberCard
          key={member.id}
          member={member}
          notes={notes.filter((note) => note.memberUserId === member.id)}
          saving={saving}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function SupportMemberCard({ member, notes, saving, onAction }: {
  member: WorkspacePayload["supportMembers"][number];
  notes: WorkspacePayload["coachNotes"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [visibleToMember, setVisibleToMember] = useState(true);
  const attention = member.onboardingRequired ? "onboarding" : member.latestCheckin?.needsHelp ? "urgent" : member.latestCheckin ? "normal" : "attention";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (note.trim().length < 3) return;
    await onAction({ action: "add_coach_note", memberUserId: member.id, note, nextAction, visibleToMember }, `${member.displayName}-д зөвлөгөө хадгалагдлаа.`);
    setNote("");
    setNextAction("");
  }

  return (
    <article className="panel support-member-card">
      <header className="support-member-header">
        <div className="user-avatar">{member.displayName.charAt(0).toUpperCase()}</div>
        <div><h3>{member.displayName}</h3><p>{member.teamName} · {member.role}</p><small>Sponsor: {member.sponsorName ?? "оноогоогүй"} · Coach: {member.coachName ?? "оноогоогүй"}</small></div>
        <span className={`support-state ${attention}`}>{member.onboardingRequired ? "Onboarding" : member.latestCheckin?.needsHelp ? "Тусламж хүссэн" : member.latestCheckin ? "Явцтай" : "Check-in хүлээж байна"}</span>
      </header>

      {member.summary ? (
        <div className="support-summary">
          <div><span>30 хоногийн зорилго</span><strong>{member.summary.goal30Day}</strong></div>
          <div><span>Ойлгохгүй / гацсан зүйл</span><strong>{member.summary.primaryBlocker}</strong></div>
          <div><span>Хэрэгтэй тусламж</span><strong>{member.summary.supportNeeds}</strong></div>
          <div><span>Одоогийн дараагийн алхам</span><strong>{member.summary.todayAction}</strong></div>
        </div>
      ) : <p className="muted-copy">5 асуултын onboarding дуусмагц coaching summary энд автоматаар гарна.</p>}

      {member.latestCheckin && (
        <div className="latest-checkin">
          <div><strong>{member.latestCheckin.progressPercent}%</strong><span>сүүлийн явц</span></div>
          <p>{member.latestCheckin.progressSummary}</p>
          {member.latestCheckin.blocker && <small>Саад: {member.latestCheckin.blocker}</small>}
          {member.latestCheckin.helpRequest && <small>Тусламж: {member.latestCheckin.helpRequest}</small>}
          <small>Дараагийн focus: {member.latestCheckin.nextFocus}</small>
        </div>
      )}

      <form className="coach-note-form" onSubmit={submit}>
        <label>Зөвлөгөө<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1600} placeholder="Юуг ойлгуулах, юун дээр дэмжих вэ?" required /></label>
        <label>Дараагийн алхам<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} maxLength={800} placeholder="Жишээ: L1 хичээлийг үзээд 15 минут ярилцах" /></label>
        <label className="check-row"><input type="checkbox" checked={visibleToMember} onChange={(event) => setVisibleToMember(event.target.checked)} /> Гишүүнд харагдана</label>
        <button className="secondary-button" type="submit" disabled={saving || note.trim().length < 3}>Зөвлөгөө хадгалах</button>
      </form>

      {notes.length > 0 && <div className="coach-note-list">{notes.slice(0, 3).map((item) => <div key={item.id}><strong>{item.authorName}</strong><p>{item.note}</p>{item.nextAction && <small>Дараагийн алхам: {item.nextAction}</small>}</div>)}</div>}
      <p className="privacy-note">Түүхий 5 хариулт харагдахгүй. Зөвхөн coaching-д хэрэгтэй summary, check-in ба тусламжийн хүсэлт харагдана.</p>
    </article>
  );
}

function UserDirectory({ users, currentEmail, saving, onUpdate }: {
  users: WorkspacePayload["users"];
  currentEmail: string;
  saving: boolean;
  onUpdate: (member: WorkspacePayload["users"][number]) => Promise<void>;
}) {
  return (
    <section className="section-stack">
      <div className="section-intro">
        <div><p className="eyebrow blue">USER MANAGEMENT</p><h2>Урилга ба хэрэглэгчийн эрх</h2><p>Админ имэйл урилга илгээж, бүртгэлтэй хэрэглэгчийн эрх болон төлөвийг удирдана.</p></div>
        <div className="summary-pill"><strong>{users.length}</strong><span>нийт хэрэглэгч</span></div>
      </div>
      <AdminInvitations users={users} />
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
                <label>Эрх<select value={item.role} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, role: event.target.value as typeof item.role })}><option value="user">Хэрэглэгч</option><option value="builder">Builder</option><option value="coach">Coach</option><option value="director">Director</option><option value="admin">Admin</option></select></label>
                <label>Төлөв<select value={item.status} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, status: event.target.value as typeof item.status })}><option value="active">Идэвхтэй</option><option value="disabled">Идэвхгүй</option></select></label>
                <label>Баг<input defaultValue={item.teamName} disabled={saving || isCurrent} maxLength={80} onBlur={(event) => { const teamName = event.target.value.trim(); if (teamName && teamName !== item.teamName) void onUpdate({ ...item, teamName }); }} /></label>
                <label>Sponsor<select value={item.sponsorUserId ?? ""} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, sponsorUserId: event.target.value || null })}><option value="">Оноогоогүй</option>{sponsorOptions.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.displayName} · {candidate.role}</option>)}</select></label>
                <label>Coach<select value={item.coachUserId ?? ""} disabled={saving || isCurrent} onChange={(event) => void onUpdate({ ...item, coachUserId: event.target.value || null })}><option value="">Оноогоогүй</option>{coachOptions.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.displayName} · {candidate.role}</option>)}</select></label>
              </div>
            </div>
          );
        })}
      </article>
    </section>
  );
}

function Overview({ progressPercent, completed, total, pendingTasks, drafts, successMap, onNavigate, onSelectLevel }: {
  progressPercent: number;
  completed: number;
  total: number;
  pendingTasks: WorkspacePayload["memberTasks"];
  drafts: WorkspacePayload["drafts"];
  successMap: WorkspacePayload["successMap"];
  onNavigate: (section: Section) => void;
  onSelectLevel: (index: number) => void;
}) {
  const reviewCount = drafts.filter((draft) => draft.status === "review").length;
  const approvedCount = drafts.filter((draft) => draft.status === "corporate_approved").length;
  return <section className="section-stack">
    <div className="command-hero">
      <div><p className="eyebrow cyan">TODAY · CONTROL TOWER</p><h2>Өнөөдөр системээ нэг алхмаар урагшлуул.</h2><p>Сургалт, гишүүний үйлчилгээ, контентын хяналтаас хамгийн өндөр нөлөөтэй ажлыг эхэл.</p><div className="hero-actions"><button className="primary-button" onClick={() => onSelectLevel(0)}>Сургалтаа үргэлжлүүлэх</button><button className="secondary-button" onClick={() => onNavigate("members")}>Success queue харах</button></div></div>
      <div className="progress-orbit" style={{ "--progress": `${progressPercent * 3.6}deg` } as React.CSSProperties}><div><strong>{progressPercent}%</strong><span>нийт ахиц</span></div></div>
    </div>
    <div className="metric-grid"><Metric label="Сургалт" value={`${completed}/${total}`} copy="completion бүртгэл" tone="blue" /><Metric label="Member Success" value={String(pendingTasks.length)} copy="нээлттэй ажиллагаа" tone="cyan" /><Metric label="Контент" value={String(reviewCount)} copy="тусдаа хяналт хүлээж байна" tone="violet" /><Metric label="Approval ref" value={String(approvedCount)} copy="reference бүртгэлтэй" tone="green" /></div>
    <div className="overview-grid">
      <article className="panel focus-panel personal-focus"><div className="panel-heading"><div><p className="eyebrow cyan">PERSONAL AI · STARTER MAP</p><h3>{successMap ? successMap.plan.todayAction.title : "Миний замаа нээх"}</h3></div><span className="tag">{successMap ? `${successMap.plan.todayAction.minutes} мин` : "5 асуулт"}</span></div><p>{successMap ? successMap.plan.todayAction.detail : "5 хариултаар 7/30 хоногийн content ба management төлөвлөгөөг үүсгэнэ."}</p><button className="text-button" onClick={() => onNavigate("my-path")}>{successMap ? "Бүх төлөвлөгөө →" : "Эхлүүлэх →"}</button></article>
      <article className="panel focus-panel"><div className="panel-heading"><div><p className="eyebrow blue">NEXT BEST ACTION</p><h3>L0 · Компани ба нөхцөл</h3></div><span className="tag">35 мин</span></div><p>Багийн бүх ярианы суурь: Member ба Partner-ийн ялгаа, зөв хүлээлт, амлалтгүй тайлбар.</p><div className="mini-progress"><span style={{ width: `${progressPercent}%` }} /></div><button className="text-button" onClick={() => onSelectLevel(0)}>Хичээл нээх →</button></article>
      <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">MEMBER SUCCESS</p><h3>Анхаарах дараалал</h3></div><button className="text-button" onClick={() => onNavigate("members")}>Бүгдийг харах</button></div>{pendingTasks.length === 0 ? <EmptyState title="Task нэмээгүй байна" copy="72 цагийн onboarding-оос эхэлнэ үү." /> : pendingTasks.slice(0, 3).map((task) => <div className="compact-row" key={task.id}><span className={`risk-dot ${task.risk}`} /><div><strong>{task.memberName}</strong><small>{task.nextAction}</small></div><b>{task.dueLabel}</b></div>)}</article>
      <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">CONTENT GUARD</p><h3>Нийтлэх урсгал</h3></div><button className="text-button" onClick={() => onNavigate("content")}>Studio нээх</button></div>{drafts.length === 0 ? <EmptyState title="Ноорог алга" copy="Албан эх сурвалжтай контент үүсгэнэ үү." /> : drafts.slice(0, 3).map((draft) => <div className="compact-row" key={draft.id}><Status status={draft.status} /><div><strong>{draft.title}</strong><small>{draft.channel}</small></div><b>→</b></div>)}</article>
      <article className="panel guard-panel"><div><span className="shield">✓</span><p className="eyebrow cyan">PILOT CONTROLS</p><h3>Source + review gate</h3><p>Auto-publish хаалттай. Source lock, тусдаа reviewer, approval reference-ийн бүртгэл идэвхтэй.</p></div><button className="text-button light" onClick={() => onNavigate("vault")}>Source Vault →</button></article>
    </div>
  </section>;
}

function SuccessMapPanel({ successMap, checkins, coachNotes, saving, onAction }: {
  successMap: WorkspacePayload["successMap"];
  checkins: WorkspacePayload["myCheckins"];
  coachNotes: WorkspacePayload["coachNotes"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<void>;
}) {
  if (!successMap) {
    return (
      <section className="section-stack">
        <div className="section-intro"><div><p className="eyebrow cyan">PERSONAL AI · STARTER MAP</p><h2>5 хариултаар ажлын замаа тодруул.</h2><p>Starter profile, өнөөдрийн алхам, 7 хоногийн content rhythm, 30 хоногийн management focus гарна.</p></div><div className="summary-pill"><strong>5</strong><span>үндсэн асуулт</span></div></div>
        <article className="panel map-empty"><span className="shield">◉</span><h3>Таны Success Map хараахан үүсээгүй байна</h3><p>Хариултаа хүссэн үедээ засварлаж, төлөвлөгөөг дахин шинэчилж болно.</p><a className="primary-button" href="/onboarding">5 асуултаа эхлүүлэх</a></article>
      </section>
    );
  }

  const plan = successMap.plan;
  return (
    <section className="section-stack success-map-section">
      <div className="section-intro"><div><p className="eyebrow cyan">PERSONAL AI · STARTER MAP</p><h2>Таны 7/30 хоногийн ажлын зураг</h2><p>{plan.whyThisPlan}</p></div><div className="summary-pill"><strong>{successMap.planSource === "ai_gateway" ? "AI" : "Rule"}</strong><span>{new Date(successMap.updatedAt).toLocaleDateString("mn-MN")} шинэчилсэн</span></div></div>
      <article className="command-hero map-profile"><div><p className="eyebrow cyan">WORKING PROFILE</p><h3>{plan.profileSummary}</h3><p>Энэ бол таны 5 хариултад суурилсан засварлаж болдог starter profile; зан төлөвийн онош биш.</p><div className="hero-actions"><a className="primary-button" href="/onboarding">Хариулт ба plan засах</a></div></div><div className="progress-orbit map-orbit"><div><strong>{plan.todayAction.minutes}</strong><span>минутын эхний алхам</span></div></div></article>
      <div className="success-map-grid">
        <article className="panel map-today"><p className="eyebrow blue">ӨНӨӨДӨР</p><h3>{plan.todayAction.title}</h3><p>{plan.todayAction.detail}</p></article>
        <article className="panel"><p className="eyebrow blue">ЭНЭ 7 ХОНОГ</p><div className="map-list">{plan.weeklyActions.map((action, index) => <div key={`${action.title}-${index}`}><span>{index + 1}</span><div><strong>{action.title}</strong><p>{action.detail}</p><small>Дууссан гэж үзэх: {action.doneWhen}</small></div></div>)}</div></article>
        <article className="panel"><p className="eyebrow blue">30 ХОНОГИЙН MANAGEMENT</p><h3>Төвлөрөх 3 зүйл</h3><ul className="map-bullets">{plan.managementPlan.focus.map((item) => <li key={item}>{item}</li>)}</ul><h4>Хэмнэл</h4><ul className="map-bullets muted">{plan.managementPlan.cadence.map((item) => <li key={item}>{item}</li>)}</ul><h4>Хэмжих үзүүлэлт</h4><ul className="map-bullets muted">{plan.managementPlan.measures.map((item) => <li key={item}>{item}</li>)}</ul></article>
        <article className="panel"><p className="eyebrow blue">CONTENT PLAN</p><h3>7 өдрийн rhythm</h3><div className="content-calendar">{plan.contentPlan.sevenDayPlan.map((item) => <div key={item.day}><strong>{item.day}</strong><span>{item.action}</span></div>)}</div><h4>Контентын чиглэл</h4><div className="pillar-list">{plan.contentPlan.pillars.map((item) => <span key={item}>{item}</span>)}</div></article>
      </div>
      <div className="success-map-grid lower">
        <article className="panel"><p className="eyebrow blue">ACADEMY NEXT</p>{plan.academyRecommendation ? <><h3>{plan.academyRecommendation.title}</h3><p>{plan.academyRecommendation.reason}</p><span className="tag">{plan.academyRecommendation.levelId} · {plan.academyRecommendation.minutes} мин</span></> : <p>Одоогоор дуусаагүй, тохирох нийтлэгдсэн хичээл олдсонгүй.</p>}</article>
        <article className="panel guard-panel"><div><span className="shield">✓</span><p className="eyebrow cyan">HUMAN CONTROL</p><h3>Төлөвлөгөө автоматаар нийтлэхгүй</h3><p>Контент бүр Source Vault ба хүний review-г дамжина. Орлого, үр дүнгийн баталгаагүй амлалт хийхгүй.</p></div></article>
      </div>
      <WeeklyCheckinPanel checkins={checkins} saving={saving} onAction={onAction} />
      {coachNotes.length > 0 && <article className="panel member-coach-notes"><p className="eyebrow blue">SPONSOR / COACH ЗӨВЛӨГӨӨ</p><h3>Танд өгсөн дараагийн зөвлөмж</h3>{coachNotes.map((note) => <div key={note.id}><strong>{note.authorName}</strong><p>{note.note}</p>{note.nextAction && <small>Дараагийн алхам: {note.nextAction}</small>}</div>)}</article>}
    </section>
  );
}

function WeeklyCheckinPanel({ checkins, saving, onAction }: {
  checkins: WorkspacePayload["myCheckins"];
  saving: boolean;
  onAction: (payload: Record<string, unknown>, successMessage: string) => Promise<void>;
}) {
  const [form, setForm] = useState({ progressSummary: "", blocker: "", helpRequest: "", nextFocus: "", progressPercent: "0", needsHelp: false });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.progressSummary.trim().length < 3 || form.nextFocus.trim().length < 3) return;
    await onAction({ ...form, action: "weekly_checkin", progressPercent: Number(form.progressPercent) }, "Долоо хоногийн check-in хадгалагдлаа. Sponsor/coach summary шинэчлэгдэнэ.");
    setForm({ progressSummary: "", blocker: "", helpRequest: "", nextFocus: "", progressPercent: "0", needsHelp: false });
  }

  return (
    <div className="weekly-checkin-layout">
      <form className="panel form-panel" onSubmit={submit}>
        <p className="eyebrow blue">WEEKLY FEEDBACK LOOP</p><h3>Энэ долоо хоногийн check-in</h3>
        <label>Юу хийж, ямар үр дүн гаргав?<textarea value={form.progressSummary} onChange={(event) => setForm({ ...form, progressSummary: event.target.value })} maxLength={1200} required /></label>
        <label>Юун дээр гацав?<textarea value={form.blocker} onChange={(event) => setForm({ ...form, blocker: event.target.value })} maxLength={1200} /></label>
        <label>Ямар тусламж хэрэгтэй вэ?<textarea value={form.helpRequest} onChange={(event) => setForm({ ...form, helpRequest: event.target.value })} maxLength={1200} /></label>
        <label>Дараагийн долоо хоногийн гол focus<textarea value={form.nextFocus} onChange={(event) => setForm({ ...form, nextFocus: event.target.value })} maxLength={1200} required /></label>
        <label>Зорилгын явц · {form.progressPercent}%<input type="range" min="0" max="100" step="5" value={form.progressPercent} onChange={(event) => setForm({ ...form, progressPercent: event.target.value })} /></label>
        <label className="check-row"><input type="checkbox" checked={form.needsHelp} onChange={(event) => setForm({ ...form, needsHelp: event.target.checked })} /> Sponsor/coach-ийн тусламж одоо хэрэгтэй</label>
        <button className="primary-button" type="submit" disabled={saving || form.progressSummary.trim().length < 3 || form.nextFocus.trim().length < 3}>Check-in хадгалах</button>
      </form>
      <article className="panel checkin-history"><div className="panel-heading"><div><p className="eyebrow blue">CHECK-IN HISTORY</p><h3>Сүүлийн явц</h3></div><span className="count-badge">{checkins.length}</span></div>{checkins.length === 0 ? <EmptyState title="Check-in алга" copy="Эхний долоо хоногийн үр дүнгээ хадгалсны дараа энд түүх үүснэ." /> : checkins.slice(0, 6).map((checkin) => <div className="checkin-row" key={checkin.id}><strong>{checkin.progressPercent}% · {new Date(checkin.createdAt).toLocaleDateString("mn-MN")}</strong><p>{checkin.progressSummary}</p><small>{checkin.needsHelp ? "Тусламж хүссэн" : "Дараагийн focus"}: {checkin.needsHelp ? checkin.helpRequest || checkin.blocker : checkin.nextFocus}</small></div>)}</article>
    </div>
  );
}

function Metric({ label, value, copy, tone }: { label: string; value: string; copy: string; tone: string }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{copy}</small></article>;
}

function Status({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{statusLabels[status] ?? status}</span>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>＋</span><strong>{title}</strong><p>{copy}</p></div>;
}
