"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "./brand";
import { fallbackOfficialSources, learningLevels, type OfficialSource, type WorkspacePayload } from "./team-os-data";

type Section = "overview" | "academy" | "content" | "members" | "vault";
type WorkspaceStatus = "loading" | "ready" | "error";

const emptyWorkspace: WorkspacePayload = {
  viewer: { role: "builder", canReview: false, canRecordCorporateApproval: false },
  progress: [],
  officialSources: [],
  drafts: [],
  memberTasks: [],
};

const navItems: Array<{ id: Section; label: string; short: string; symbol: string }> = [
  { id: "overview", label: "Хяналтын төв", short: "Төв", symbol: "⌂" },
  { id: "academy", label: "Academy", short: "Academy", symbol: "▤" },
  { id: "content", label: "Content Studio", short: "Контент", symbol: "✦" },
  { id: "members", label: "Member Success", short: "Members", symbol: "◎" },
  { id: "vault", label: "Source Vault", short: "Vault", symbol: "◇" },
];

const statusLabels: Record<string, string> = {
  draft: "Ноорог",
  review: "Хяналтад",
  approved: "Legacy · нотолгоо дутуу",
  internal_approved: "Дотоод хяналт тэнцсэн",
  corporate_approved: "Approval reference бүртгэгдсэн",
  source_allowed: "Review-д зөвшөөрсөн",
  source_blocked: "Review-д зөвшөөрөөгүй",
  source_stale: "Review-д түдгэлзсэн",
  archived: "Архив",
};

const riskLabels: Record<string, string> = {
  normal: "Хэвийн",
  attention: "Анхаарах",
  urgent: "Яаралтай",
};

function riskLabel(risk: string): string {
  return riskLabels[risk] ?? "Тодорхойгүй";
}

async function fetchWorkspace(): Promise<WorkspacePayload> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok) throw new Error("workspace unavailable");
  return (await response.json()) as WorkspacePayload;
}

export function TeamOsApp({ user }: { user: { name: string; email: string; role: string } }) {
  const [section, setSection] = useState<Section>("overview");
  const [workspace, setWorkspace] = useState<WorkspacePayload>(emptyWorkspace);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("loading");
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [approvalReferences, setApprovalReferences] = useState<Record<number, string>>({});
  const [draftForm, setDraftForm] = useState<{
    title: string;
    channel: string;
    sourceId: string;
  }>({ title: "", channel: "Facebook", sourceId: "" });
  const [memberForm, setMemberForm] = useState({ memberName: "", milestone: "72 цаг", nextAction: "", dueLabel: "Өнөөдөр", risk: "normal" });

  const loadWorkspace = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setWorkspaceStatus("loading");
    try {
      setWorkspace(await fetchWorkspace());
      setWorkspaceStatus("ready");
      return true;
    } catch {
      setWorkspace(emptyWorkspace);
      setWorkspaceStatus("error");
      setNotice("Өгөгдлийн холболтыг шалгаж байна. Түр хугацаанд унших горим ажиллаж байна.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchWorkspace()
      .then((nextWorkspace) => {
        if (!active) return;
        setWorkspace(nextWorkspace);
        setWorkspaceStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setWorkspace(emptyWorkspace);
        setWorkspaceStatus("error");
        setNotice("Өгөгдлийн холболтыг шалгаж байна. Түр хугацаанд унших горим ажиллаж байна.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function runAction(payload: Record<string, unknown>, successMessage: string): Promise<boolean> {
    if (workspaceStatus !== "ready") {
      setNotice("Өгөгдлийн workspace бэлэн биш тул бичих үйлдэл хаалттай байна.");
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
      const refreshed = await loadWorkspace();
      if (refreshed) setNotice(successMessage);
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
  const allowedSources = useMemo(
    () => workspace.officialSources.filter((source) => source.allowedForReview),
    [workspace.officialSources],
  );
  const draftSources = useMemo(
    () => allowedSources.filter((source) => source.usableForReview),
    [allowedSources],
  );
  const selectedSourceId = draftSources.some((source) => source.id === draftForm.sourceId)
    ? draftForm.sourceId
    : draftSources[0]?.id ?? "";
  const vaultSources = workspaceStatus === "error" ? fallbackOfficialSources : workspace.officialSources;
  const writesDisabled = saving || workspaceStatus !== "ready";
  const totalLessons = learningLevels.reduce((sum, level) => sum + level.lessons.length, 0);
  const progressPercent = Math.round((completedLessons.size / totalLessons) * 100);
  const pendingMemberTasks = workspace.memberTasks.filter((task) => task.status !== "complete");
  const activeDrafts = workspace.drafts.filter((draft) => draft.status !== "archived");
  const selected = learningLevels[selectedLevel];
  const selectedDone = selected.lessons.filter((lesson) => completedLessons.has(lesson.id)).length;

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    if (!draftForm.title.trim() || !selectedSourceId) return;
    const created = await runAction({ action: "create_draft", ...draftForm, sourceId: selectedSourceId }, "Ноорог үүслээ. Нийтлэхээс өмнө хяналтад оруулна уу.");
    if (created) setDraftForm((current) => ({ ...current, title: "" }));
  }

  async function submitMemberTask(event: FormEvent) {
    event.preventDefault();
    if (!memberForm.memberName.trim() || !memberForm.nextAction.trim()) return;
    const created = await runAction({ action: "add_member_task", ...memberForm }, "Member Success task нэмэгдлээ.");
    if (created) setMemberForm({ memberName: "", milestone: "72 цаг", nextAction: "", dueLabel: "Өнөөдөр", risk: "normal" });
  }

  function selectLevelFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % learningLevels.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + learningLevels.length) % learningLevels.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = learningLevels.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    setSelectedLevel(nextIndex);
    document.getElementById(`level-tab-${learningLevels[nextIndex].id}`)?.focus();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div><strong>{BRAND_NAME}</strong><small>{PRODUCT_DESCRIPTOR}</small></div>
        </div>
        <nav className="side-nav" aria-label="Үндсэн цэс">
          {navItems.map((item) => (
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
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="sync-state" role="status" aria-live="polite"><span className={loading ? "pulse" : ""} />{workspaceStatus === "loading" ? "Холбож байна" : workspaceStatus === "ready" ? "Өгөгдөл шинэ" : "Унших горим"}</div>
            {user.role === "admin" && <Link className="admin-link" href="/admin">Admin</Link>}
            <div className="user-chip"><span>{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role} · {user.email}</small></div></div>
          </div>
        </header>

        {notice && <div className="notice" role="status" aria-live="polite"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Мэдэгдэл хаах">×</button></div>}

        <div className="content-area">
          {workspaceStatus === "loading" && (
            <section className="panel workspace-loading" role="status" aria-live="polite">
              <span className="loading-orbit" aria-hidden="true" />
              <strong>Workspace өгөгдлийг ачаалж байна</strong>
              <p>Ахиц, контент, task-ийн бодит төлөв иртэл үйлдлүүд хаалттай байна.</p>
            </section>
          )}

          {workspaceStatus !== "loading" && section === "overview" && (
            <Overview
              progressPercent={progressPercent}
              completed={completedLessons.size}
              total={totalLessons}
              pendingTasks={pendingMemberTasks}
              drafts={activeDrafts}
              onNavigate={setSection}
              onSelectLevel={(index) => { setSelectedLevel(index); setSection("academy"); }}
            />
          )}

          {workspaceStatus !== "loading" && section === "academy" && (
            <section className="section-stack">
              <div className="section-intro">
                <div><p className="eyebrow blue">PILOT LEARNING TRACKER</p><h2>Сургалтын ахицыг нэг мөр тэмдэглэнэ.</h2><p>Одоогийн release нь completion tracking. Quiz, role-play rubric, teach-back gate дараагийн баталгаажуулсан release-д орно.</p></div>
                <div className="summary-pill"><strong>{progressPercent}%</strong><span>нийт зам</span></div>
              </div>
              <div className="level-tabs" role="tablist" aria-label="Сургалтын түвшин">
                {learningLevels.map((level, index) => (
                  <button
                    key={level.id}
                    id={`level-tab-${level.id}`}
                    className={selectedLevel === index ? "active" : ""}
                    onClick={() => setSelectedLevel(index)}
                    onKeyDown={(event) => selectLevelFromKeyboard(event, index)}
                    role="tab"
                    aria-selected={selectedLevel === index}
                    aria-controls={`level-panel-${level.id}`}
                    tabIndex={selectedLevel === index ? 0 : -1}
                  >
                    <strong>{level.level}</strong><span>{level.title}</span>
                  </button>
                ))}
              </div>
              <div
                className="academy-layout"
                id={`level-panel-${selected.id}`}
                role="tabpanel"
                aria-labelledby={`level-tab-${selected.id}`}
                tabIndex={0}
              >
                <article className="panel lesson-panel">
                  <div className="panel-heading"><div><span className="tag">{selected.level}</span><h3>{selected.title}</h3><p>{selected.description}</p></div><div className="lesson-count">{selectedDone}/{selected.lessons.length}<small>дууссан</small></div></div>
                  <div className="progress-track"><span style={{ width: `${(selectedDone / selected.lessons.length) * 100}%` }} /></div>
                  <div className="lesson-list">
                    {selected.lessons.map((lesson, index) => {
                      const done = completedLessons.has(lesson.id);
                      return (
                        <button
                          key={lesson.id}
                          className={`lesson-row ${done ? "done" : ""}`}
                          onClick={() => void runAction({ action: "toggle_lesson", lessonId: lesson.id }, done ? "Хичээлийг нээлттэй төлөвт буцаалаа." : "Хичээл дууссанд бүртгэгдлээ.")}
                          disabled={writesDisabled}
                        >
                          <span className="lesson-check">{done ? "✓" : String(index + 1).padStart(2, "0")}</span>
                          <span className="lesson-copy"><strong>{lesson.title}</strong><small>{lesson.type} · {lesson.minutes} мин</small></span>
                          <span className="row-action">{done ? "Дууссан" : "Нээх"}</span>
                        </button>
                      );
                    })}
                  </div>
                </article>
                <aside className="panel certification-panel">
                  <p className="eyebrow blue">NEXT RELEASE</p>
                  <h3>Gate хийхээр төлөвлөсөн</h3>
                  <ul className="check-list"><li><span>80%</span> Quiz-ийн доод оноо</li><li><span>A</span> Role-play rubric</li><li><span>1×</span> Teach-back review</li></ul>
                  <div className="locked-note"><strong>Одоогоор идэвхгүй</strong><p>Энэ самбар completion-ийг л бүртгэнэ; certification эсвэл дараагийн role-г автоматаар олгохгүй.</p></div>
                </aside>
              </div>
            </section>
          )}

          {workspaceStatus !== "loading" && section === "content" && (
            <section className="section-stack">
              <div className="section-intro">
                <div><p className="eyebrow blue">SOURCE-LOCKED CONTENT</p><h2>Эх сурвалж ба тусдаа хяналтыг баримтжуулна.</h2><p>Ноорог эзэмшигч өөрийгөө approve хийхгүй. Company approval нь заавал тусдаа reference-тэй байна.</p></div>
                <div className="mode-badge"><span>SAFE MODE</span><strong>Template engine</strong><small>Generative AI credential хүлээгдэж байна</small></div>
              </div>
              <div className="workflow-strip"><span><b>01</b> Эх сурвалж</span><i>→</i><span><b>02</b> Ноорог</span><i>→</i><span><b>03</b> Хяналт</span><i>→</i><span><b>04</b> Батлах</span></div>
              <div className="content-layout">
                <form className="panel form-panel" onSubmit={submitDraft}>
                  <div className="panel-heading"><div><p className="eyebrow blue">NEW DRAFT</p><h3>Контентын ноорог</h3></div><span className="source-lock">◇ Source lock</span></div>
                  <label>Сэдэв<input value={draftForm.title} onChange={(event) => setDraftForm({ ...draftForm, title: event.target.value })} placeholder="Жишээ: Аяллын төсвөө 3 алхмаар төлөвлөх" maxLength={140} disabled={writesDisabled} /></label>
                  <div className="field-grid">
                    <label>Суваг<select value={draftForm.channel} onChange={(event) => setDraftForm({ ...draftForm, channel: event.target.value })} disabled={writesDisabled}><option>Facebook</option><option>Instagram</option><option>Short video</option><option>FAQ</option><option>Message</option></select></label>
                    <label>Албан эх сурвалж<select value={selectedSourceId} onChange={(event) => setDraftForm({ ...draftForm, sourceId: event.target.value })} disabled={writesDisabled || draftSources.length === 0}>{draftSources.length === 0 && <option value="">Хүчинтэй эх сурвалж алга</option>}{allowedSources.map((source) => <option key={source.id} value={source.id} disabled={!source.usableForReview}>{source.title}{source.usableForReview ? ` · ${source.verifiedAt}` : " · verification хугацаа хүчинтэй биш — сонгох боломжгүй"}</option>)}</select></label>
                  </div>
                  <div className="guardrail-copy"><strong>Human review required</strong><span>Зөвхөн review-д зөвшөөрсөн, verification/effective/review хугацаа хүчинтэй source сонгоно. Хүчинтэй биш {allowedSources.length - draftSources.length} source Vault-д харагдах боловч шинэ draft-д ашиглагдахгүй.</span></div>
                  <button className="primary-button" type="submit" disabled={writesDisabled || !draftForm.title.trim() || !selectedSourceId}>Аюулгүй ноорог үүсгэх</button>
                </form>
                <article className="panel queue-panel">
                  <div className="panel-heading"><div><p className="eyebrow blue">CONTENT QUEUE</p><h3>Ноорог ба зөвшөөрөл</h3></div><span className="count-badge">{activeDrafts.length}</span></div>
                  {activeDrafts.length === 0 ? <EmptyState title="Одоогоор ноорог алга" copy="Зүүн талын form-оор баталсан эх сурвалжтай эхний нооргоо үүсгэнэ үү." /> : (
                    <div className="draft-list">{activeDrafts.map((draft) => {
                      const source = workspace.officialSources.find((item) => item.id === draft.sourceId);
                      const sourceReady = Boolean(source?.usableForReview);
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
                              {draft.status === "draft" && draft.isOwner && sourceReady && (
                                <button onClick={() => void runAction({ action: "submit_draft", id: draft.id }, "Ноорог тусдаа хянагчийн queue-д орлоо.")} disabled={writesDisabled}>Хяналтад өгөх →</button>
                              )}
                              {draft.status === "draft" && draft.isOwner && !source && <small>Source mapping хийсний дараа илгээнэ</small>}
                              {draft.status === "draft" && draft.isOwner && source && !sourceReady && <small>Source verification огноо бүртгэгдсэний дараа хяналтад өгнө</small>}
                              {draft.status === "review" && workspace.viewer.canReview && !draft.isOwner && (
                                <>
                                  <button onClick={() => void runAction({ action: "review_draft", id: draft.id, decision: "return_to_draft" }, "Ноорог засварт буцлаа.")} disabled={writesDisabled}>Засварт буцаах</button>
                                  <button onClick={() => void runAction({ action: "review_draft", id: draft.id, decision: "internal_approved" }, "Тусдаа хянагчийн дотоод review бүртгэгдлээ.")} disabled={writesDisabled}>Дотоод хяналт тэнцсэн →</button>
                                </>
                              )}
                              {draft.status === "review" && (!workspace.viewer.canReview || draft.isOwner) && <small>Тусдаа хянагч хүлээж байна</small>}
                              {draft.status === "internal_approved" && workspace.viewer.canRecordCorporateApproval && !draft.isOwner && (
                                <div className="approval-reference">
                                  <label htmlFor={`approval-reference-${draft.id}`}>Компанийн бичгээр өгсөн approval reference</label>
                                  <input
                                    id={`approval-reference-${draft.id}`}
                                    value={approvalReferences[draft.id] ?? ""}
                                    onChange={(event) => setApprovalReferences((current) => ({ ...current, [draft.id]: event.target.value }))}
                                    placeholder="Ticket / email / document reference"
                                    maxLength={240}
                                    disabled={writesDisabled}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void runAction({ action: "record_corporate_approval", id: draft.id, evidenceRef: approvalReferences[draft.id] ?? "" }, "Company approval reference бүртгэгдлээ.")}
                                    disabled={writesDisabled || (approvalReferences[draft.id] ?? "").trim().length < 3}
                                  >Reference бүртгэх →</button>
                                </div>
                              )}
                              {draft.status === "internal_approved" && (!workspace.viewer.canRecordCorporateApproval || draft.isOwner) && <small>Тусдаа admin approval reference бүртгэнэ</small>}
                              {draft.status === "approved" && <small>Legacy status — company approval нотлогдоогүй</small>}
                              {["approved", "corporate_approved"].includes(draft.status) && canArchive && (
                                <button onClick={() => void runAction({ action: "archive_draft", id: draft.id }, "Контент архивлагдлаа.")} disabled={writesDisabled}>Архивлах</button>
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

          {workspaceStatus !== "loading" && section === "members" && (
            <section className="section-stack">
              <div className="section-intro"><div><p className="eyebrow blue">SERVICE BEFORE RECRUITMENT</p><h2>Хүн бүр дараагийн зөв алхмаа мэддэг.</h2><p>72 цаг, 30/60/90 хоногийн touchpoint бүр эзэн, хугацаа, үр дүнтэй байна.</p></div><div className="summary-pill"><strong>{pendingMemberTasks.length}</strong><span>нээлттэй task</span></div></div>
              <div className="lifecycle"><div><b>0–72 цаг</b><span>Welcome + зорилго</span></div><div><b>30 хоног</b><span>Readiness + blocker</span></div><div><b>60 хоног</b><span>Value review</span></div><div><b>90 хоног</b><span>Next plan</span></div></div>
              <div className="member-layout">
                <form className="panel form-panel" onSubmit={submitMemberTask}>
                  <p className="eyebrow blue">ADD NEXT ACTION</p><h3>Member Success task</h3>
                  <label>Гишүүний нэр<input value={memberForm.memberName} onChange={(event) => setMemberForm({ ...memberForm, memberName: event.target.value })} placeholder="Нэр" maxLength={80} disabled={writesDisabled} /></label>
                  <div className="field-grid"><label>Үе шат<select value={memberForm.milestone} onChange={(event) => setMemberForm({ ...memberForm, milestone: event.target.value })} disabled={writesDisabled}><option>72 цаг</option><option>30 хоног</option><option>60 хоног</option><option>90 хоног</option></select></label><label>Эрсдэл<select value={memberForm.risk} onChange={(event) => setMemberForm({ ...memberForm, risk: event.target.value })} disabled={writesDisabled}><option value="normal">Хэвийн</option><option value="attention">Анхаарах</option><option value="urgent">Яаралтай</option></select></label></div>
                  <label>Дараагийн алхам<textarea value={memberForm.nextAction} onChange={(event) => setMemberForm({ ...memberForm, nextAction: event.target.value })} placeholder="Жишээ: Аяллын зорилгыг тодруулж, FAQ илгээх" maxLength={180} disabled={writesDisabled} /></label>
                  <label>Хугацаа<input value={memberForm.dueLabel} onChange={(event) => setMemberForm({ ...memberForm, dueLabel: event.target.value })} placeholder="Өнөөдөр 18:00" maxLength={40} disabled={writesDisabled} /></label>
                  <button className="primary-button" type="submit" disabled={writesDisabled || !memberForm.memberName.trim() || !memberForm.nextAction.trim()}>Task нэмэх</button>
                </form>
                <article className="panel task-panel">
                  <div className="panel-heading"><div><p className="eyebrow blue">SUCCESS QUEUE</p><h3>Дараагийн ажиллагаа</h3></div><span className="count-badge">{pendingMemberTasks.length}</span></div>
                  {pendingMemberTasks.length === 0 ? <EmptyState title="Queue цэвэр байна" copy="Гишүүний дараагийн алхмыг нэмэхэд энд эрэмбэлэгдэн харагдана." /> : <div className="task-list">{pendingMemberTasks.map((task) => <div className="task-row" key={task.id}><span className={`risk-dot ${task.risk}`} role="img" aria-label={`Эрсдэл: ${riskLabel(task.risk)}`} /><div><strong>{task.memberName}</strong><p>{task.nextAction}</p><small>{task.milestone} · {task.dueLabel} · Эрсдэл: {riskLabel(task.risk)}</small></div><button onClick={() => void runAction({ action: "complete_member_task", id: task.id }, "Task дууссанд бүртгэгдлээ.")} disabled={writesDisabled} aria-label={`${task.memberName} task дуусгах`}>✓</button></div>)}</div>}
                </article>
              </div>
            </section>
          )}

          {workspaceStatus !== "loading" && section === "vault" && (
            <section className="section-stack">
              <div className="section-intro"><div><p className="eyebrow blue">CURATED OFFICIAL LINKS</p><h2>Ноорог бүр сонгосон эх сурвалжтай байна.</h2><p>{workspaceStatus === "error" ? "Workspace боломжгүй тул version control-д хадгалсан лавлахыг зөвхөн унших горимоор харуулж байна." : "Source Vault нь database-ийн allowlist болон verification metadata-г шууд харуулна. Автомат version history болон баримтын өөрчлөлт илрүүлэлт одоогоор байхгүй."}</p></div><div className="summary-pill"><strong>{vaultSources.filter((source) => source.usableForReview).length}</strong><span>review-д ашиглахад бэлэн</span></div></div>
              <div className="vault-grid">{vaultSources.map((source) => <SourceCard source={source} key={source.id} />)}</div>
              <article className="policy-panel"><div><p className="eyebrow">PILOT CONTROLS</p><h3>Системийн таслах шугам</h3></div><ul><li>Auto-publish болон auto-DM байхгүй</li><li>Өөрийн нооргийг өөрөө approve хийхгүй</li><li>Company approval-д тусдаа reference шаарддаг</li><li>Бүртгэл, төлбөр, booking зөвхөн албан ёсны portal-д</li></ul><p><strong>UNVERIFIED:</strong> Монголын эрх зүй, татвар, шууд борлуулалтын ангилалд local counsel sign-off шаардлагатай. Энэ app compliance guarantee өгөхгүй.</p></article>
            </section>
          )}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Гар утасны цэс">
        {navItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.symbol}</span>{item.short}</button>)}
      </nav>
    </div>
  );
}

function Overview({ progressPercent, completed, total, pendingTasks, drafts, onNavigate, onSelectLevel }: {
  progressPercent: number;
  completed: number;
  total: number;
  pendingTasks: WorkspacePayload["memberTasks"];
  drafts: WorkspacePayload["drafts"];
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
      <article className="panel focus-panel"><div className="panel-heading"><div><p className="eyebrow blue">NEXT BEST ACTION</p><h3>L0 · Компани ба нөхцөл</h3></div><span className="tag">35 мин</span></div><p>Багийн бүх ярианы суурь: Member ба Partner-ийн ялгаа, зөв хүлээлт, амлалтгүй тайлбар.</p><div className="mini-progress"><span style={{ width: `${progressPercent}%` }} /></div><button className="text-button" onClick={() => onSelectLevel(0)}>Хичээл нээх →</button></article>
      <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">MEMBER SUCCESS</p><h3>Анхаарах дараалал</h3></div><button className="text-button" onClick={() => onNavigate("members")}>Бүгдийг харах</button></div>{pendingTasks.length === 0 ? <EmptyState title="Task нэмээгүй байна" copy="72 цагийн onboarding-оос эхэлнэ үү." /> : pendingTasks.slice(0, 3).map((task) => <div className="compact-row" key={task.id}><span className={`risk-dot ${task.risk}`} role="img" aria-label={`Эрсдэл: ${riskLabel(task.risk)}`} /><div><strong>{task.memberName}</strong><small>{task.nextAction} · Эрсдэл: {riskLabel(task.risk)}</small></div><b>{task.dueLabel}</b></div>)}</article>
      <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">CONTENT GUARD</p><h3>Нийтлэх урсгал</h3></div><button className="text-button" onClick={() => onNavigate("content")}>Studio нээх</button></div>{drafts.length === 0 ? <EmptyState title="Ноорог алга" copy="Албан эх сурвалжтай контент үүсгэнэ үү." /> : drafts.slice(0, 3).map((draft) => <div className="compact-row" key={draft.id}><Status status={draft.status} /><div><strong>{draft.title}</strong><small>{draft.channel}</small></div><b>→</b></div>)}</article>
      <article className="panel guard-panel"><div><span className="shield">✓</span><p className="eyebrow cyan">PILOT CONTROLS</p><h3>Source + review gate</h3><p>Auto-publish хаалттай. Source lock, тусдаа reviewer, approval reference-ийн бүртгэл идэвхтэй.</p></div><button className="text-button light" onClick={() => onNavigate("vault")}>Source Vault →</button></article>
    </div>
  </section>;
}

function Metric({ label, value, copy, tone }: { label: string; value: string; copy: string; tone: string }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{copy}</small></article>;
}

function Status({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{statusLabels[status] ?? status}</span>;
}

function SourceCard({ source }: { source: OfficialSource }) {
  const sourceStatus = source.usableForReview ? "source_allowed" : source.allowedForReview ? "source_stale" : "source_blocked";
  const lifecycle = [
    source.verifiedAt ? `Verified: ${source.verifiedAt}` : "Verification огноо бүртгэгдээгүй · UNVERIFIED",
    source.versionLabel ? `Version: ${source.versionLabel}` : null,
    source.effectiveAt ? `Effective: ${source.effectiveAt}` : null,
    source.reviewDueAt ? `Review due: ${source.reviewDueAt}` : null,
  ].filter(Boolean).join(" · ");
  const content = <><div className="source-icon">{source.url ? "PDF" : "—"}</div><div><div className="source-meta"><span>{source.category}</span><Status status={sourceStatus} /></div><h3>{source.title}</h3><p>{lifecycle}</p></div><span className="external">{source.url ? "↗" : ""}</span></>;

  if (!source.url) return <article className="source-card">{content}</article>;
  return <a className="source-card" href={source.url} target="_blank" rel="noreferrer">{content}</a>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>＋</span><strong>{title}</strong><p>{copy}</p></div>;
}
