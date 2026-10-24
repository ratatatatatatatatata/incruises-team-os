"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  areaLabels,
  areas,
  emptyLife,
  lifeSchema,
  localDay,
  suggestion,
  weeklyUsed,
  weekStart,
  type Area,
  type LifeState,
  type LifeTask,
} from "@/lib/life/domain";
import { LifeAssistant } from "./assistant";
import "./personal.css";

type Tab = "today" | "plan" | "vision" | "style" | "assistant";
const tabs: Array<{ id: Tab; title: string; icon: string }> = [
  { id: "today", title: "Өнөөдөр", icon: "◉" },
  { id: "plan", title: "Төлөвлөгөө", icon: "▤" },
  { id: "vision", title: "Мөрөөдөл", icon: "✧" },
  { id: "style", title: "Миний хэв маяг", icon: "◇" },
  { id: "assistant", title: "Туслах", icon: "✳" },
];
type Props = {
  name: string;
  demo?: boolean;
  initialState?: LifeState;
  initialGoal?: string;
  initialMinutes?: number;
};
function Field({
  label,
  value,
  onChange,
  max = 500,
  hint,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <label className="life-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          rows={3}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function PersonalApp({
  name,
  demo = false,
  initialState,
  initialGoal = "",
  initialMinutes = 60,
}: Props) {
  const [tab, setTab] = useState<Tab>("today");
  const [state, setState] = useState<LifeState>(
    () =>
      initialState ?? {
        ...emptyLife(),
        goal: {
          ...emptyLife().goal,
          title: initialGoal,
          weeklyMinutes: initialMinutes,
        },
      },
  );
  const [revision, setRevision] = useState(0);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [fresh, setFresh] = useState(demo);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [task, setTask] = useState({
    title: "",
    minutes: 10,
    time: "",
    date: "",
  });
  const [result, setResult] = useState<Record<string, string>>({});
  const [review, setReview] = useState({ win: "", obstacle: "", next: "" });
  const [habitTitle, setHabitTitle] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    function tick() {
      setDay(localDay());
    }
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demo) return;
    let active = true;
    fetch("/api/life-workspace", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!active) return;
        if (data.workspace) {
          const parsed = lifeSchema.safeParse(data.workspace.state);
          if (!parsed.success)
            throw new Error(
              "Хадгалсан төлөвлөгөөний бүтэц тохирохгүй байна. Дэмжлэг аваарай.",
            );
          setState(parsed.data);
          setRevision(data.workspace.revision);
        }
        setFresh(true);
      })
      .catch((error) => {
        if (active)
          setNotice(
            error instanceof Error ? error.message : "Холболтоо шалгаарай.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  function change(next: LifeState) {
    setState(next);
    setDirty(true);
  }
  async function save(next = state) {
    if (busy.current || !fresh) return false;
    const parsed = lifeSchema.safeParse(next);
    if (!parsed.success) {
      setNotice(parsed.error.issues[0]?.message ?? "Утгуудаа шалгана уу.");
      return false;
    }
    busy.current = true;
    setSaving(true);
    setNotice("");
    setState(next);
    setDirty(true);
    try {
      if (!demo) {
        const response = await fetch("/api/life-workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ revision, state: next }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (
            response.status === 409 ||
            response.status >= 500 ||
            response.status === 401 ||
            response.status === 403
          )
            setFresh(false);
          throw new Error(data.error || "Хадгалж чадсангүй.");
        }
        setRevision(data.revision);
      }
      setDirty(false);
      setNotice(
        demo
          ? "Демо дээр шинэчлэгдлээ. Жинхэнэ бүртгэл, өгөгдлийн санд хадгалаагүй."
          : "Таны хувийн төлөвлөгөө хадгалагдлаа.",
      );
      return true;
    } catch (error) {
      setFresh(false);
      setNotice(
        `${error instanceof Error ? error.message : "Хадгалалт баталгаажаагүй."} Бичсэн мэдээлэл энэ дэлгэцэд үлдсэн. Хуулж аваад хуудсаа дахин нээгээрэй.`,
      );
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!task.title.trim()) return;
    const next: LifeTask = {
      ...task,
      date: task.date || day,
      title: task.title.trim(),
      id: editingTaskId ?? crypto.randomUUID(),
      status: "planned",
      outcome: "",
    };
    const nextTasks = editingTaskId ? state.tasks.map((item) => item.id === editingTaskId ? next : item) : [...state.tasks, next];
    if (await save({ ...state, tasks: nextTasks })) {
      setTask({ title: "", minutes: 10, time: "", date: "" });
      setEditingTaskId(null);
    }
  }
  function prepareSuggestion(title: string, minutes = 10) {
    setEditingTaskId(null);
    setTask({ title, minutes, time: "", date: day });
    setTab("today");
    setNotice(
      "Санал бэлэн боллоо. Өдөр, цагийг нь сонгоод «Ажил нэмэх» дарна уу.",
    );
  }
  function editTask(item: LifeTask) {
    setEditingTaskId(item.id);
    setTask({ title: item.title, minutes: item.minutes, time: item.time, date: item.date });
    setTab("today");
    setNotice("Ажил, өдөр, цагаа доорх талбарт засаж хадгалаарай. Өмнөх хувилбарын түүх хадгалагдана.");
  }
  async function complete(item: LifeTask) {
    const outcome = result[item.id]?.trim();
    if (!outcome) {
      setNotice("Юу хийсэн, ямар үр дүн гарсныг нэг өгүүлбэрээр бичээрэй.");
      return;
    }
    await save({
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === item.id ? { ...t, status: "done", outcome } : t,
      ),
    });
  }
  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setNotice("Төлөвлөгөөг хууллаа. Өөрийн хадгалдаг газар буулгаарай.");
    } catch {
      setNotice("Хуулах эрхгүй байна. Доорх талбараас өөрөө хуулж авч болно.");
    }
  }
  const todayTasks = state.tasks.filter((t) => t.date === day);
  const previousTasks = state.tasks.filter(
    (t) => t.date < day && t.status === "planned",
  );
  const used = day ? weeklyUsed(state, day) : 0;
  const remaining = Math.max(0, state.goal.weeklyMinutes - used);
  const next = day ? suggestion(state, day) : null;
  const week = day ? weekStart(day) : "";
  const weekTasks = state.tasks.filter(
    (t) => day && weekStart(t.date) === week,
  );
  const done = weekTasks.filter((t) => t.status === "done");
  const disabled = saving || !fresh || !day;

  return (
    <div className="life-app">
      <a className="life-skip" href="#life-main">
        Үндсэн агуулга руу
      </a>
      <header className="life-header">
        <Link href={demo ? "/life-demo" : "/"} className="life-brand">
          in<span>Success</span>
          <small>Өөрийнхөөрөө урагшил.</small>
        </Link>
        <div className="life-header-right">
          <span className="life-save-status" role="status">
            {demo
              ? "ТУРШИХ ХУВИЛБАР"
              : loading
                ? "Ачаалж байна…"
                : saving
                  ? "Хадгалж байна…"
                  : !fresh
                    ? "Хадгалалт холбогдоогүй"
                    : dirty
                      ? "Хадгалаагүй өөрчлөлттэй"
                      : "Хувийн орчин"}
          </span>
          <span className="life-avatar" aria-label={name}>
            {name.charAt(0)}
          </span>
        </div>
      </header>
      {demo && (
        <div className="life-demo-banner">
          Зохиомол мэдээлэлтэй туршилт. Таны жинхэнэ бүртгэлийг өөрчлөхгүй.
          Дахин ачаалахад демо эхнээсээ нээгдэнэ.
        </div>
      )}
      <div className="life-layout">
        <aside className="life-sidebar">
          <p className="life-nav-caption">МИНИЙ ОРОН ЗАЙ</p>
          <nav aria-label="Хувийн хөгжлийн цэс">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? "active" : ""}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.title}
              </button>
            ))}
          </nav>
          <div className="life-sidebar-note">
            <span>
              Жижиг алхам.
              <br />
              Бодит өөрчлөлт.
            </span>
            <p>Өөрийн амьдралд хэрэгтэй зүйлээ л сонго.</p>
          </div>
          <div className="life-extra">
            <Link href="/team">Сургалт ба багийн орчин ↗</Link>
            <Link href="/onboarding">Өмнөх «Миний зам» ↗</Link>
            {!demo && (
              <form method="post" action="/auth/signout">
                <button>Гарах</button>
              </form>
            )}
          </div>
        </aside>
        <main id="life-main" className="life-main">
          {notice && (
            <div className="life-notice" role="status">
              {notice}
            </div>
          )}
          {!fresh && !loading && (
            <div className="life-notice" role="alert">
              Хадгалалт бэлэн болтол өөрчлөлт илгээхгүй.{" "}
              <button onClick={() => location.reload()}>Дахин нээх</button>
            </div>
          )}
          {loading ? (
            <section className="life-panel">
              <h1>Таны төлөвлөгөөг ачаалж байна…</h1>
              <p>Хадгалсан мэдээллийг авсны дараа ажил, ахицыг харуулна.</p>
            </section>
          ) : (
            <>
              {tab === "today" && (
                <>
                  <div className="life-page-title">
                    <div>
                      <span className="life-kicker">
                        {day || "ӨНӨӨДӨР"} · САЙН БАЙНА УУ,{" "}
                        {name.toLocaleUpperCase("mn-MN")}
                      </span>
                      <h1>
                        Өнөөдөр юуг
                        <br />
                        <em>урагшлуулах вэ?</em>
                      </h1>
                      <p>Бүгдийг амжуулах албагүй. Нэг хэрэгтэй ажлаас эхэл.</p>
                    </div>
                    <div className="life-week-meter">
                      <strong>
                        {done.length}
                        <span>
                          {" "}
                          /{" "}
                          {
                            weekTasks.filter((t) => t.status !== "paused")
                              .length
                          }
                        </span>
                      </strong>
                      <small>энэ 7 хоногт дуусгасан ажил</small>
                      <div>
                        <span
                          style={{
                            width: `${Math.min(100, (used / state.goal.weeklyMinutes) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {used} / {state.goal.weeklyMinutes} минут төлөвлөсөн
                      </small>
                    </div>
                  </div>
                  {!state.goal.title ? (
                    <section className="life-start">
                      <span className="life-kicker">ЭХНИЙ АЛХАМ · 1 МИНУТ</span>
                      <h2>Юу өөрчлөгдөөсэй гэж хүсэж байна вэ?</h2>
                      <p>
                        Урт асуулга бөглөх шаардлагагүй. Нэг чиглэл, нэг
                        зорилго, гаргаж чадах цагаа сонгоё.
                      </p>
                      <div className="life-area-grid">
                        {areas.map((area) => (
                          <button
                            key={area}
                            onClick={() => {
                              change({
                                ...state,
                                goal: { ...state.goal, area },
                              });
                              setTab("plan");
                            }}
                          >
                            <span aria-hidden="true">
                              {
                                {
                                  management: "◉",
                                  planning: "▤",
                                  vision: "✧",
                                  style: "◇",
                                }[area]
                              }
                            </span>
                            {areaLabels[area]}
                            <b>↗</b>
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="life-goal-banner">
                      <span className="life-kicker">
                        МИНИЙ 30 ХОНОГИЙН ЧИГЛЭЛ · {areaLabels[state.goal.area]}
                      </span>
                      <h2>{state.goal.title}</h2>
                      <p>
                        {state.goal.measure ||
                          "Ахиц гарсныг юугаар мэдэхээ төлөвлөгөөндөө нэмж болно."}
                      </p>
                      <button
                        className="life-link-button"
                        onClick={() => setTab("plan")}
                      >
                        Зорилгоо тодруулах ↗
                      </button>
                    </section>
                  )}
                  <div className="life-two-col">
                    <section className="life-panel">
                      <div className="life-section-heading">
                        <div>
                          <span className="life-kicker">ХИЙХ ЦАГАА СОНГО</span>
                          <h2>Миний өнөөдрийн ажил</h2>
                        </div>
                        <span className="life-dot">
                          {
                            todayTasks.filter((t) => t.status === "planned")
                              .length
                          }
                        </span>
                      </div>
                      {todayTasks.length === 0 && (
                        <p className="life-hint">
                          Өнөөдөр ажил нэмээгүй байна. Доор өөрт хэрэгтэй нэг
                          ажлаа бичээрэй.
                        </p>
                      )}
                      <div className="life-task-list">
                        {todayTasks.map((item) => (
                          <article
                            className={`life-task ${item.status}`}
                            key={item.id}
                          >
                            <div className="life-task-top">
                              <span>
                                {item.status === "done"
                                  ? "✓"
                                  : item.status === "paused"
                                    ? "Ⅱ"
                                    : "○"}
                              </span>
                              <h3>{item.title}</h3>
                              <small>
                                {item.time || "Цаг сонгоогүй"} · {item.minutes}{" "}
                                мин
                              </small>
                            </div>
                            {item.status === "done" ? (
                              <p>Үр дүн: {item.outcome}</p>
                            ) : item.status === "paused" ? (
                              <p>
                                Түр завсарласан. Өмнөх бүртгэл хадгалагдсан.
                              </p>
                            ) : (
                              <>
                                <Field
                                  label={`«${item.title}» — юу хийж, ямар үр дүн гарсан бэ?`}
                                  value={result[item.id] ?? ""}
                                  onChange={(v) =>
                                    setResult({ ...result, [item.id]: v })
                                  }
                                  max={600}
                                />
                                <div className="life-actions">
                                  <button
                                    className="life-secondary"
                                    disabled={disabled}
                                    onClick={() => complete(item)}
                                  >
                                    Дуусгасан ✓
                                  </button>
                                  <button
                                    className="life-link-button"
                                    disabled={disabled}
                                    onClick={() =>
                                      save({
                                        ...state,
                                        tasks: state.tasks.map((t) =>
                                          t.id === item.id
                                            ? { ...t, status: "paused" }
                                            : t,
                                        ),
                                      })
                                    }
                                  >
                                    Түр завсарлах
                                  </button>
                                </div>
                              </>
                            )}
                            {item.status !== "done" && <button className="life-link-button" disabled={disabled} onClick={() => editTask(item)}>{item.status === "paused" ? "Засаж үргэлжлүүлэх" : "Ажил, цагаа засах"}</button>}
                          </article>
                        ))}
                      </div>
                      {previousTasks.length > 0 && (
                        <details className="life-past">
                          <summary>
                            Өмнөх өдрөөс үлдсэн {previousTasks.length} ажил
                          </summary>
                          {previousTasks.map((t) => (
                            <div key={t.id}>
                              <p>
                                {t.date} · {t.title}
                              </p>
                              <button
                                className="life-secondary"
                                disabled={disabled}
                                onClick={() =>
                                  save({
                                    ...state,
                                    tasks: state.tasks.map((item) =>
                                      item.id === t.id
                                        ? { ...item, date: day, time: "" }
                                        : item,
                                    ),
                                  })
                                }
                              >
                                Өнөөдөр үргэлжлүүлэх
                              </button>
                            </div>
                          ))}
                        </details>
                      )}
                      <form className="life-task-form" onSubmit={addTask}>
                        <Field
                          label="Яг хийх нэг ажил"
                          value={task.title}
                          onChange={(title) => setTask({ ...task, title })}
                          max={240}
                          hint="Жишээ: Танилцуулгынхаа эхний 3 өгүүлбэрийг бичих"
                        />
                        <div className="life-fields-row">
                          <label>
                            Өдөр
                            <input
                              type="date"
                              aria-label="Ажлын өдөр"
                              value={task.date || day}
                              onChange={(e) =>
                                setTask({ ...task, date: e.target.value })
                              }
                              required
                            />
                          </label>
                          <label>
                            Хэдэн минут?
                            <input
                              type="number"
                              min={1}
                              max={480}
                              value={task.minutes}
                              onChange={(e) =>
                                setTask({
                                  ...task,
                                  minutes: Number(e.target.value),
                                })
                              }
                              required
                            />
                          </label>
                          <label>
                            Эхлэх цаг
                            <input
                              type="time"
                              value={task.time}
                              onChange={(e) =>
                                setTask({ ...task, time: e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <button
                          className="life-primary"
                          disabled={disabled || !task.title.trim()}
                        >
                          {editingTaskId ? "Ажлын өөрчлөлтийг хадгалах" : "Ажил нэмэх +"}
                        </button>
                        {editingTaskId && <button type="button" className="life-link-button" onClick={() => { setEditingTaskId(null); setTask({title:"",minutes:10,time:"",date:""}); }}>Засахаас буцах</button>}
                        <p className="life-hint">
                          Энэ 7 хоногт {remaining} минутын боломж үлдсэн. Цаг нь
                          апп дотор харагдана; мэдэгдэл илгээхгүй.
                        </p>
                      </form>
                    </section>
                    <div className="life-side-stack">
                      <section className="life-panel life-suggestion">
                        <span className="life-kicker">
                          ГАНЦ АЛХАМ САНАЛ БОЛГОЁ
                        </span>
                        <h2>
                          {next?.title || "Төлөвлөсөн цагаа дүүргэсэн байна."}
                        </h2>
                        <p>
                          {next?.why ||
                            "Одоо байгаа ажлаа хийж үзээд үр дүнгээ тэмдэглэ. Дараагийн долоо хоногт шинэ ажил сонгож болно."}
                        </p>
                        {next && (
                          <>
                            <div className="life-done-when">
                              <b>Дууссан гэж үзэх нь</b>
                              <p>{next.done}</p>
                            </div>
                            <button
                              className="life-secondary"
                              onClick={() =>
                                prepareSuggestion(next.title, next.minutes)
                              }
                            >
                              Энэ саналыг засаж төлөвлөх · {next.minutes} мин
                            </button>
                          </>
                        )}
                        <small>
                          Бэлэн чиглүүлэгчийн санал. Та өөрчилж сонгоно.
                        </small>
                      </section>
                      <section className="life-panel life-habit">
                        <span className="life-kicker">
                          ӨДӨР ТУТМЫН НЭГ ДАДАЛ
                        </span>
                        <h2>{state.habit.title || "Өөрт тохирох нэг дадал"}</h2>
                        {state.habit.title ? (
                          <>
                            <p>
                              {state.habit.dates.length} өдөр хийсэн гэж
                              тэмдэглэсэн.
                            </p>
                            <button
                              className="life-secondary"
                              disabled={
                                disabled || state.habit.dates.includes(day)
                              }
                              onClick={() =>
                                save({
                                  ...state,
                                  habit: {
                                    ...state.habit,
                                    dates: [...state.habit.dates, day],
                                  },
                                })
                              }
                            >
                              {state.habit.dates.includes(day)
                                ? "Өнөөдөр хийсэн ✓"
                                : "Өнөөдөр хийлээ ✓"}
                            </button>
                          </>
                        ) : (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (habitTitle.trim())
                                save({
                                  ...state,
                                  habit: {
                                    title: habitTitle.trim(),
                                    dates: [],
                                  },
                                });
                            }}
                          >
                            <Field
                              label="Миний жижиг дадал"
                              value={habitTitle}
                              onChange={setHabitTitle}
                              max={160}
                              hint="Жишээ: Орой маргаашийн нэг ажлаа сонгох"
                            />
                            <button
                              className="life-secondary"
                              disabled={disabled || !habitTitle.trim()}
                            >
                              Дадлаа сонгох
                            </button>
                          </form>
                        )}
                      </section>
                    </div>
                  </div>
                </>
              )}
              {tab === "plan" && (
                <>
                  <div className="life-page-title">
                    <div>
                      <span className="life-kicker">ЧИГЛЭЛ → ЦАГ → ҮР ДҮН</span>
                      <h1>
                        Өөрт багтах
                        <br />
                        <em>төлөвлөгөө.</em>
                      </h1>
                      <p>Бодит боломжоо тооцоод нэг өөрчлөлтөд төвлөр.</p>
                    </div>
                  </div>
                  <div className="life-two-col">
                    <form
                      className="life-panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save();
                      }}
                    >
                      <h2>Миний 30 хоногийн зорилго</h2>
                      <label className="life-field">
                        Юун дээр хөгжих вэ?
                        <select
                          value={state.goal.area}
                          onChange={(e) =>
                            change({
                              ...state,
                              goal: {
                                ...state.goal,
                                area: e.target.value as Area,
                              },
                            })
                          }
                        >
                          {areas.map((a) => (
                            <option key={a} value={a}>
                              {areaLabels[a]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label="30 хоногийн дараа юу өөр болсон байх вэ?"
                        value={state.goal.title}
                        onChange={(title) =>
                          change({ ...state, goal: { ...state.goal, title } })
                        }
                        max={240}
                        hint="Жишээ: Орой бүр маргаашийн чухал ажлаа сонгодог болно."
                      />
                      <Field
                        label="Надад яагаад чухал вэ?"
                        value={state.goal.why}
                        onChange={(why) =>
                          change({ ...state, goal: { ...state.goal, why } })
                        }
                        max={400}
                      />
                      <Field
                        label="Ахиц гарсныг юугаар мэдэх вэ?"
                        value={state.goal.measure}
                        onChange={(measure) =>
                          change({ ...state, goal: { ...state.goal, measure } })
                        }
                        max={240}
                        hint="Жишээ: 7 хоногийн 3 орой төлөвлөгөөгөө ашигласан байна."
                      />
                      <label className="life-field">
                        7 хоногт нийт гаргаж чадах минут
                        <input
                          type="number"
                          min={5}
                          max={10080}
                          value={state.goal.weeklyMinutes}
                          onChange={(e) =>
                            change({
                              ...state,
                              goal: {
                                ...state.goal,
                                weeklyMinutes: Number(e.target.value),
                              },
                            })
                          }
                          required
                        />
                        <small>
                          Өдөр бүрийн минут биш. Одоогоор {used} минут
                          төлөвлөсөн байна.
                        </small>
                      </label>
                      <button
                        className="life-primary"
                        disabled={disabled || !state.goal.title.trim()}
                      >
                        Зорилгоо хадгалах
                      </button>
                    </form>
                    <section className="life-panel">
                      <h2>Энэ 7 хоног</h2>
                      <p>
                        {done.length} ажил дууссан · {used}/
                        {state.goal.weeklyMinutes} минут төлөвлөсөн
                      </p>
                      {weekTasks.length === 0 && (
                        <p className="life-hint">
                          Өнөөдөр хэсгээс хийх ажлаа өдөр, цагтай нь нэмээрэй.
                        </p>
                      )}
                      {[...weekTasks]
                        .sort((a, b) =>
                          `${a.date}${a.time}`.localeCompare(
                            `${b.date}${b.time}`,
                          ),
                        )
                        .map((t) => (
                          <article className="life-agenda" key={t.id}>
                            <span>
                              {t.date.slice(5)}
                              <small>{t.time || "—"}</small>
                            </span>
                            <div>
                              <h3>{t.title}</h3>
                              <p>
                                {t.minutes} мин ·{" "}
                                {t.status === "done"
                                  ? "Дууссан"
                                  : t.status === "paused"
                                    ? "Завсарласан"
                                    : "Төлөвлөсөн"}
                              </p>
                              {t.outcome && <p>{t.outcome}</p>}
                            </div>
                          </article>
                        ))}
                    </section>
                  </div>
                  <form
                    className="life-panel"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (review.win.trim() && review.next.trim())
                        save({
                          ...state,
                          reviews: [
                            ...state.reviews.filter((r) => r.week !== week),
                            { ...review, week },
                          ],
                        });
                    }}
                  >
                    <span className="life-kicker">ДОЛОО ХОНОГИЙН ДҮГНЭЛТ</span>
                    <h2>Дараа нь юуг өөрчлөх вэ?</h2>
                    <p>
                      Дууссан ажлын тоо нь таны үнэ цэнийн үнэлгээ биш. Танд
                      тохирсон аргаа олно.
                    </p>
                    <Field
                      label="Юу хийсэн, юу тус болсон бэ?"
                      value={review.win}
                      onChange={(win) => setReview({ ...review, win })}
                      max={600}
                      multiline
                    />
                    <Field
                      label="Хаана гацсан бэ?"
                      value={review.obstacle}
                      onChange={(obstacle) =>
                        setReview({ ...review, obstacle })
                      }
                      max={600}
                    />
                    <Field
                      label="Дараагийн нэг өөрчлөлт"
                      value={review.next}
                      onChange={(next) => setReview({ ...review, next })}
                      max={240}
                    />
                    <button
                      className="life-primary"
                      disabled={
                        disabled || !review.win.trim() || !review.next.trim()
                      }
                    >
                      Дүгнэлт хадгалах
                    </button>
                    {state.reviews.map((r) => (
                      <article className="life-review" key={r.week}>
                        <b>{r.week} эхэлсэн 7 хоног</b>
                        <p>{r.win}</p>
                        {r.obstacle && <p>Саад: {r.obstacle}</p>}
                        <p>Дараа: {r.next}</p>
                        <button
                          type="button"
                          className="life-link-button"
                          onClick={() => prepareSuggestion(r.next)}
                        >
                          Дараагийн ажлаа төлөвлөх ↗
                        </button>
                      </article>
                    ))}
                  </form>
                </>
              )}
              {tab === "vision" && (
                <>
                  <div className="life-page-title">
                    <div>
                      <span className="life-kicker">
                        ТӨСӨӨЛ → СААДАА ТАНЬ → ҮЙЛД
                      </span>
                      <h1>
                        Хүссэн ирээдүйгээ
                        <br />
                        <em>өнөөдрөөс эхэл.</em>
                      </h1>
                      <p>
                        Manifest бол хүслээ тодруулж, өөрийн хийж чадах алхамтай
                        холбох дадал.
                      </p>
                    </div>
                  </div>
                  <form
                    className="life-panel life-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save();
                    }}
                  >
                    <Field
                      label="01 · Би юу хүсэж байна вэ?"
                      value={state.vision.wish}
                      onChange={(wish) =>
                        change({ ...state, vision: { ...state.vision, wish } })
                      }
                      multiline
                      hint="Өөрт чухал нэг өөрчлөлтийг өөрийн үгээр дүрслээрэй."
                    />
                    <Field
                      label="02 · Энэ өөрчлөлт надад юу өгөх вэ?"
                      value={state.vision.reason}
                      onChange={(reason) =>
                        change({
                          ...state,
                          vision: { ...state.vision, reason },
                        })
                      }
                      multiline
                    />
                    <Field
                      label="03 · Бодитой ямар саад тулгарч болох вэ?"
                      value={state.vision.obstacle}
                      onChange={(obstacle) =>
                        change({
                          ...state,
                          vision: { ...state.vision, obstacle },
                        })
                      }
                      multiline
                    />
                    <Field
                      label="04 · Хэрэв тэр саад гарвал би юу хийх вэ?"
                      value={state.vision.ifThen}
                      onChange={(ifThen) =>
                        change({
                          ...state,
                          vision: { ...state.vision, ifThen },
                        })
                      }
                      hint="Хэрэв орой ядарвал төлөвлөгөөгөө 2 минутанд багасгана."
                    />
                    <Field
                      label="05 · Өөрийн хийж чадах эхний бодит үйлдэл"
                      value={state.vision.action}
                      onChange={(action) =>
                        change({
                          ...state,
                          vision: { ...state.vision, action },
                        })
                      }
                      max={240}
                    />
                    <div className="life-actions">
                      <button className="life-primary" disabled={disabled}>
                        Мөрөөдлийн тэмдэглэлээ хадгалах
                      </button>
                      <button
                        type="button"
                        className="life-secondary"
                        disabled={!state.vision.action.trim()}
                        onClick={() => prepareSuggestion(state.vision.action)}
                      >
                        Үйлдлээ төлөвлөгөөнд оруулах ↗
                      </button>
                    </div>
                    <p className="life-hint">
                      Бодол дангаараа үр дүнг батлахгүй. Хийсэн үйлдэл, бодит үр
                      дүнгээ ажиглана.
                    </p>
                  </form>
                </>
              )}
              {tab === "style" && (
                <>
                  <div className="life-page-title">
                    <div>
                      <span className="life-kicker">
                        ХЭН БЭ → ЯАЖ ИЛЭРХИЙЛЭХ ВЭ
                      </span>
                      <h1>
                        Өөрийнхөөрөө
                        <br />
                        <em>харагд. Илэрхийл.</em>
                      </h1>
                      <p>
                        Гадаад төрх, харилцаа, хийдэг зүйлээ өөрийн үнэт зүйлтэй
                        холбо.
                      </p>
                    </div>
                  </div>
                  <div className="life-two-col">
                    <form
                      className="life-panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save();
                      }}
                    >
                      <Field
                        label="Намайг илэрхийлэх 3 үг"
                        value={state.style.words}
                        onChange={(words) =>
                          change({ ...state, style: { ...state.style, words } })
                        }
                        max={160}
                        hint="Жишээ: Энгийн, найдвартай, бүтээлч."
                      />
                      <Field
                        label="Миний үнэт зүйл, давуу тал"
                        value={state.style.values}
                        onChange={(values) =>
                          change({
                            ...state,
                            style: { ...state.style, values },
                          })
                        }
                        multiline
                      />
                      <Field
                        label="Өөрийгөө танилцуулах 3 өгүүлбэр"
                        value={state.style.introduction}
                        onChange={(introduction) =>
                          change({
                            ...state,
                            style: { ...state.style, introduction },
                          })
                        }
                        max={600}
                        multiline
                        hint="Хэн бэ? Юунд анхаардаг вэ? Бусдад юугаар тусалдаг вэ?"
                      />
                      <Field
                        label="Энэ долоо хоногт турших нэг зүйл"
                        value={state.style.practice}
                        onChange={(practice) =>
                          change({
                            ...state,
                            style: { ...state.style, practice },
                          })
                        }
                        max={240}
                        hint="Одоогийн хувцсаар нэг зохицол гаргах, эсвэл танилцуулгаа хэлж турших."
                      />
                      <div className="life-actions">
                        <button className="life-primary" disabled={disabled}>
                          Хэв маягаа хадгалах
                        </button>
                        <button
                          type="button"
                          className="life-secondary"
                          disabled={!state.style.practice.trim()}
                          onClick={() =>
                            prepareSuggestion(state.style.practice)
                          }
                        >
                          Туршилтаа төлөвлөх ↗
                        </button>
                      </div>
                    </form>
                    <article className="life-style-card">
                      <span className="life-kicker">
                        МИНИЙ ХЭВ МАЯГИЙН КАРТ
                      </span>
                      <span className="life-monogram" aria-hidden="true">
                        {name.charAt(0)}
                      </span>
                      <h2>{state.style.words || "Таны өөрийн өнгө төрх"}</h2>
                      <p>
                        {state.style.introduction ||
                          "Өөрийн үгээр бичсэн танилцуулга энд харагдана."}
                      </p>
                      <div>
                        <small>НАДАД ЧУХАЛ</small>
                        <p>
                          {state.style.values ||
                            "Өөрийн үнэт зүйлээ нэрлээрэй."}
                        </p>
                      </div>
                      <p className="life-hint">
                        Зураг, биеийн хэлбэрээр хүнийг оношлохгүй. Худалдан
                        авалт хийх шаардлагагүй.
                      </p>
                    </article>
                  </div>
                </>
              )}
              <div hidden={tab !== "assistant"}>
                <LifeAssistant state={state} day={day} />
              </div>
            </>
          )}
          <footer className="life-footer">
            <span>Таны хэмнэл. Таны зам.</span>
            <details>
              <summary>Миний мэдээлэл</summary>
              <p>
                Зорилго, мөрөөдөл, хэв маяг, үр дүнг зөвхөн өөрийн бүртгэлээр
                харна. Багийн зөвшөөрөл энэ шинэ хувийн тэмдэглэлийг
                хуваалцахгүй.
              </p>
              <button className="life-link-button" onClick={copyPlan}>
                Төлөвлөгөөгөө хуулж авах
              </button>
              <details>
                <summary>Хуулах боломжгүй бол эндээс авах</summary>
                <textarea
                  readOnly
                  aria-label="Хувийн төлөвлөгөөний хуулбар"
                  value={JSON.stringify(state, null, 2)}
                  rows={8}
                />
              </details>
            </details>
          </footer>
        </main>
      </div>
    </div>
  );
}
