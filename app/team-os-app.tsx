"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "./brand";
import { learningLevels, officialSources, type WorkspacePayload } from "./team-os-data";

type Section = "overview" | "academy" | "content" | "members" | "vault" | "users";

const emptyWorkspace: WorkspacePayload = {
  viewer: { role: "builder", canReview: false, canRecordCorporateApproval: false },
  progress: [],
  drafts: [],
  memberTasks: [],
  users: [],
};

const navItems: Array<{ id: Section; label: string; short: string; symbol: string }> = [
  { id: "overview", label: "Хяналтын төв", short: "Төв", symbol: "⌂" },
  { id: "academy", label: "Academy", short: "Academy", symbol: "▤" },
  { id: "content", label: "Content Studio", short: "Контент", symbol: "✦" },
  { id: "members", label: "Member Success", short: "Members", symbol: "◎" },
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

export function TeamOsApp({ user }: { user: { name: string; email: string; role: string } }) {
  const [section, setSection] = useState<Section>("overview");
  const [workspace, setWorkspace] = useState<WorkspacePayload>(emptyWorkspace);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [approvalReferences, setApprovalReferences] = useState<Record<number, string>>({});
  const [draftForm, setDraftForm] = useState<{
    title: string;
    channel: string;
    sourceId: string;
  }>({ title: "", channel: "Facebook", sourceId: officialSources[0].id });
  const [memberForm, setMemberForm] = useState({ memberName: "", milestone: "72 цаг", nextAction: "", dueLabel: "Өнөөдөр", risk: "normal" });
  const visibleNavItems = user.role === "admin" ? navItems : navItems.filter((item) => item.id !== "users");

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
  const totalLessons = learningLevels.reduce((sum, level) => sum + level.lessons.length, 0);
  const progressPercent = Math.round((completedLessons.size / totalLessons) * 100);
  const pendingMemberTasks = workspace.memberTasks.filter((task) => task.status !== "complete");
  const activeDrafts = workspace.drafts.filter((draft) => draft.status !== "archived");
  const selected = learningLevels[selectedLevel];
  const selectedDone = selected.lessons.filter((lesson) => completedLessons.has(lesson.id)).length;

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
              completed={completedLessons.size}
              total={totalLessons}
              pendingTasks={pendingMemberTasks}
              drafts={activeDrafts}
              onNavigate={setSection}
              onSelectLevel={(index) => { setSelectedLevel(index); setSection("academy"); }}
            />
          )}

          {section === "academy" && (
            <section className="section-stack">
              <div className="section-intro">
                <div><p className="eyebrow blue">PILOT LEARNING TRACKER</p><h2>Сургалтын ахицыг нэг мөр тэмдэглэнэ.</h2><p>Одоогийн release нь completion tracking. Quiz, role-play rubric, teach-back gate дараагийн баталгаажуулсан release-д орно.</p></div>
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
                          disabled={saving}
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
              <div className="section-intro"><div><p className="eyebrow blue">SERVICE BEFORE RECRUITMENT</p><h2>Хүн бүр дараагийн зөв алхмаа мэддэг.</h2><p>72 цаг, 30/60/90 хоногийн touchpoint бүр эзэн, хугацаа, үр дүнтэй байна.</p></div><div className="summary-pill"><strong>{pendingMemberTasks.length}</strong><span>нээлттэй task</span></div></div>
              <div className="lifecycle"><div><b>0–72 цаг</b><span>Welcome + зорилго</span></div><div><b>30 хоног</b><span>Readiness + blocker</span></div><div><b>60 хоног</b><span>Value review</span></div><div><b>90 хоног</b><span>Next plan</span></div></div>
              <div className="member-layout">
                <form className="panel form-panel" onSubmit={submitMemberTask}>
                  <p className="eyebrow blue">ADD NEXT ACTION</p><h3>Member Success task</h3>
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
              onUpdate={(userId, role, status) => runAction({ action: "update_user", userId, role, status }, "Хэрэглэгчийн эрх шинэчлэгдлээ.")}
            />
          )}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Гар утасны цэс">
        {visibleNavItems.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.symbol}</span>{item.short}</button>)}
      </nav>
    </div>
  );
}

function UserDirectory({ users, currentEmail, saving, onUpdate }: {
  users: WorkspacePayload["users"];
  currentEmail: string;
  saving: boolean;
  onUpdate: (userId: string, role: WorkspacePayload["users"][number]["role"], status: WorkspacePayload["users"][number]["status"]) => Promise<void>;
}) {
  return (
    <section className="section-stack">
      <div className="section-intro">
        <div><p className="eyebrow blue">USER MANAGEMENT</p><h2>Бүртгэлтэй хэрэглэгчид</h2><p>Шинээр бүртгүүлсэн хэрэглэгч энд автоматаар нэмэгдэнэ. Админ эрх болон төлөвийг удирдана.</p></div>
        <div className="summary-pill"><strong>{users.length}</strong><span>нийт хэрэглэгч</span></div>
      </div>
      <article className="panel user-directory">
        {users.length === 0 ? <EmptyState title="Хэрэглэгч алга" copy="Эхний хэрэглэгч бүртгүүлсний дараа энд харагдана." /> : users.map((item) => {
          const isCurrent = item.email === currentEmail;
          return (
            <div className="user-directory-row" key={item.id}>
              <div className="user-avatar">{item.displayName.charAt(0).toUpperCase()}</div>
              <div className="user-identity"><strong>{item.displayName}</strong><span>{item.email}</span><small>{new Date(item.createdAt).toLocaleDateString("mn-MN")}{isCurrent ? " · Та" : ""}</small></div>
              <label>Эрх<select value={item.role} disabled={saving || isCurrent} onChange={(event) => void onUpdate(item.id, event.target.value as typeof item.role, item.status)}><option value="builder">Builder</option><option value="coach">Coach</option><option value="director">Director</option><option value="admin">Admin</option></select></label>
              <label>Төлөв<select value={item.status} disabled={saving || isCurrent} onChange={(event) => void onUpdate(item.id, item.role, event.target.value as typeof item.status)}><option value="active">Идэвхтэй</option><option value="disabled">Идэвхгүй</option></select></label>
            </div>
          );
        })}
      </article>
    </section>
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
      <article className="panel overview-queue"><div className="panel-heading"><div><p className="eyebrow blue">MEMBER SUCCESS</p><h3>Анхаарах дараалал</h3></div><button className="text-button" onClick={() => onNavigate("members")}>Бүгдийг харах</button></div>{pendingTasks.length === 0 ? <EmptyState title="Task нэмээгүй байна" copy="72 цагийн onboarding-оос эхэлнэ үү." /> : pendingTasks.slice(0, 3).map((task) => <div className="compact-row" key={task.id}><span className={`risk-dot ${task.risk}`} /><div><strong>{task.memberName}</strong><small>{task.nextAction}</small></div><b>{task.dueLabel}</b></div>)}</article>
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

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>＋</span><strong>{title}</strong><p>{copy}</p></div>;
}
