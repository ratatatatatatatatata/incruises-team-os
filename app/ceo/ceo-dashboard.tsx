"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { demoSnapshot, metricKeys, metricLabels, policies, ruleReport, evaluateExperiment, type PolicyId, type Snapshot, type Report, type Learning } from "@/lib/ceo/domain";
import styles from "./ceo.module.css";

type Experiment = { id: string; policy_id: PolicyId; status: "running" | "measured" | "accepted" | "rejected" | "stopped"; started_at: string; before_snapshot: Snapshot; after_snapshot: Snapshot | null; learning_eligible: boolean | null; delta: number | null; review_note: string | null };
type Board = { snapshot: Snapshot; run: { id: string; snapshot: Snapshot; report: Report } | null; experiments: Experiment[] };
type Command = { action: "analyze" } | { action: "start"; runId: string; policyId: PolicyId } | { action: "measure"; id: string } | { action: "stop"; id: string; note: string } | { action: "review"; id: string; verdict: "accepted" | "rejected"; note: string };
const date = (value: string) => new Date(value).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const statusLabel = { stopped: "Зогсоосон · сургамжид ашиглахгүй", running: "Ажиглаж байна", measured: "Хэмжилт бэлэн", accepted: "Сургамжид оруулсан", rejected: "Саналын эрэмбийг бууруулсан" };
const initialDemo: Board = { snapshot: demoSnapshot, run: { id: "demo", snapshot: demoSnapshot, report: ruleReport(demoSnapshot) }, experiments: [] };
function demoCommand(board: Board, c: Command): Board {
  if (c.action === "analyze") {
    const learning: Learning[] = board.experiments.filter(e => e.learning_eligible && (e.status === "accepted" || e.status === "rejected")).map(e => ({ policyId: e.policy_id, verdict: e.status as "accepted" | "rejected", delta: e.delta ?? 0, experimentId: e.id }));
    return { ...board, run: { id: "demo", snapshot: board.snapshot, report: ruleReport(board.snapshot, learning) } };
  }
  if (c.action === "start") return { ...board, experiments: [{ id: crypto.randomUUID(), policy_id: c.policyId, status: "running", started_at: board.snapshot.asOf, before_snapshot: board.snapshot, after_snapshot: null, learning_eligible: null, delta: null, review_note: null }, ...board.experiments] };
  if (c.action === "measure") {
    const exp = board.experiments.find(e => e.id === c.id)!;
    const end = new Date(new Date(exp.before_snapshot.asOf).getTime() + 14 * 86400000).toISOString();
    const key = policies[exp.policy_id].metric;
    const metrics = { ...exp.before_snapshot.metrics, [key]: key === "unassignedMembers" ? Math.max(0, exp.before_snapshot.metrics[key] - 2) : Math.min(exp.before_snapshot.metrics.activeMembers, exp.before_snapshot.metrics[key] + 3) };
    const after = { ...exp.before_snapshot, metrics, asOf: end, windowStart: exp.before_snapshot.asOf };
    const evaluation = evaluateExperiment(exp.before_snapshot, after, exp.policy_id);
    return { ...board, snapshot: after, experiments: board.experiments.map(e => e.id === c.id ? { ...e, status: "measured", after_snapshot: after, learning_eligible: evaluation.eligible, delta: evaluation.delta } : e) };
  }
  return { ...board, experiments: board.experiments.map(e => e.id === c.id ? { ...e, status: c.action === "stop" ? "stopped" : c.verdict, review_note: c.note } : e) };
}
async function readBoard(): Promise<Board> {
  const response = await fetch("/api/ceo", { cache: "no-store" }); const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Мэдээлэл уншиж чадсангүй.");
  return data;
}
export function CeoDashboard({ demo }: { demo: boolean }) {
  const [board, setBoard] = useState<Board | null>(demo ? initialDemo : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() { setBoard(await readBoard()); }
  useEffect(() => {
    if (demo) return;
    let active = true;
    void readBoard().then(data => { if (active) setBoard(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [demo]);
  async function act(c: Command) {
    setBusy(true); setError(""); setNotice("");
    try {
      if (demo) { setBoard(current => demoCommand(current!, c)); setNotice("Жишээ орчинд өөрчиллөө. Бодит мэдээлэл хадгалаагүй."); }
      else {
        const response = await fetch("/api/ceo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Хүсэлт амжилтгүй.");
        await load(); setNotice("Шийдвэрийн түүх хадгалагдлаа.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Түр алдаа гарлаа."); }
    finally { setBusy(false); }
  }
  const report = board?.run?.report;
  const running = board?.experiments.some(e => e.status === "running") ?? false;
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>inSuccess <span>УДИРДЛАГА</span></Link><Link className={styles.back} href="/">Багийн хэсэг рүү ↗</Link></header>
    {demo && <div className={styles.demo}>ЖИШЭЭ ОРЧИН · Бүх тоо зохиомол. 14 хоногийн мөчлөгийг товчлуулж туршина.</div>}
    <section className={styles.hero}><div><p className={styles.eyebrow}>ХҮНИЙ АХИЦААР ХЭМЖИГДЭХ УДИРДЛАГА</p><h1>InSuccess AI CEO</h1><p className={styles.lead}>Өнөөдөр юунд төвлөрөх, хэнд туслах, ямар арга үр дүн өгснийг баримтаар шийдье.</p></div><button className={styles.primary} disabled={busy || !board} onClick={() => void act({ action: "analyze" })}>{busy ? "Боловсруулж байна…" : "Дүн шинжилгээ гаргах"}</button></section>
    <div aria-live="polite">{notice && <p className={styles.notice}>{notice}</p>}</div>
    {error && <div role="alert" className={styles.error}>{error} {!demo && <button onClick={() => void load().catch(e => setError(e.message))}>Дахин унших</button>}</div>}
    {!board && !error && <p role="status">Багийн мэдээллийг уншиж байна…</p>}
    {board && <>
      <section aria-label="Багийн үзүүлэлт" className={styles.metrics}>{metricKeys.map(key => <article key={key} className={styles.metric}><span>{metricLabels[key]}</span><strong>{board.snapshot.metrics[key]}</strong></article>)}</section>
      <p className={styles.caption}>{demo ? "Жишээ" : "Баталгаажсан · өгөгдлийн сангийн нэгтгэл"} · {date(board.snapshot.asOf)} · Улаанбаатарын цаг. «Идэвхтэй эрх» нь аппыг тогтмол ашигласан гэсэн үг биш.</p>
      <div className={styles.columns}>
        <section className={styles.panel}><div className={styles.sectionHead}><h2>Анхаарах ажлууд</h2><span className={styles.tag}>{report?.source === "ai_gateway" ? "AI эрэмбэлсэн" : "Үндсэн эрэмбэ"}</span></div>
          {report?.fallback && <p className={styles.warning}>{report.fallback}</p>}
          {!report && <p>Эхний дүн шинжилгээг гаргаж, турших ажлаа сонгоно уу.</p>}
          {report && <p className={styles.caption}>Санал · үр дүн нь хараахан батлагдаагүй. {report.learningCount} хянасан сургамж ашигласан. Баримтын огноо: {date(board.run!.snapshot.asOf)}.</p>}
          {report?.orderedPolicyIds.map((id, i) => <article className={styles.proposal} key={id}><span className={styles.number}>{String(i + 1).padStart(2, "0")}</span><div><h3>{policies[id].title}</h3><p>{policies[id].action}</p><p className={styles.evidence}>{metricLabels[policies[id].metric]}: {board.run!.snapshot.metrics[policies[id].metric]} / {board.run!.snapshot.metrics.activeMembers} гишүүн · Хариуцах: {policies[id].owner}</p><button className={styles.secondary} disabled={busy || running} onClick={() => void act({ action: "start", runId: board.run!.id, policyId: id })}>14 хоног туршихыг зөвшөөрөх</button></div></article>)}
          {report?.orderedPolicyIds.length === 0 && <p>Одоогийн үзүүлэлтээр санал болгох ажил алга. Энэ нь байгууллагын бүх асуудал шийдэгдсэн гэсэн дүгнэлт биш.</p>}
        </section>
        <aside className={styles.aside}><div className={styles.darkPanel}><p className={styles.eyebrow}>CEO-ИЙН ЗОРИЛГО</p><h2>Гишүүн бодит нэг алхам урагшлах.</h2><p>Төлөвлөгөө → хийсэн ажил → mentor-ийн тусламж → гишүүний баталсан үр дүн.</p><hr/><p className={styles.small}>AI нь ажлыг эрэмбэлнэ. Удирдагч туршилтыг зөвшөөрч, хүн хариуцан хэрэгжүүлнэ.</p></div><div className={styles.panel}><h2>Хэрхэн сайжрах вэ?</h2><ol className={styles.steps}><li>Өнөөгийн баримтыг хадгална.</li><li>Нэг аргыг 14 хоног туршина.</li><li>Ижил бүрэлдэхүүний өөрчлөлтийг хэмжинэ.</li><li>Админ сургамжийг хянана.</li><li>Дараагийн саналын эрэмбэд ашиглана.</li></ol><p className={styles.caption}>Орлого, үнэ, нэвтрэх эрх, үйлдвэрлэлийн кодыг энэ хэсгээс өөрчлөхгүй.</p></div></aside>
      </div>
      <section className={styles.panel}><div className={styles.sectionHead}><h2>Туршилт ба сургамж</h2><span className={styles.tag}>{board.experiments.length} бүртгэл</span></div><p className={styles.caption}>Ажигласан өөрчлөлт нь шалтгааны баталгаа биш. Бүрэлдэхүүн өөрчлөгдвөл эсвэл 10-аас цөөн гишүүнтэй бол сургамжид ашиглахгүй. Бодит ажлыг хариуцагч тусад нь гүйцэтгэнэ.</p>
        {!board.experiments.length && <div className={styles.empty}>Эхний туршилтаа дээрх ажлуудаас сонгоно уу.<br/><span>Нэг удаад нэг аргыг ажиглана.</span></div>}
        {board.experiments.map(e => <ExperimentCard key={e.id} experiment={e} demo={demo} busy={busy} observedAt={board.snapshot.asOf} act={act} />)}
      </section>
    </>}
    <footer className={styles.footer}>InSuccess · Хэмжих. Шийдэх. Суралцах.</footer>
  </main>;
}
function ExperimentCard({ experiment: e, demo, busy, observedAt, act }: { experiment: Experiment; demo: boolean; busy: boolean; observedAt: string; act: (c: Command) => Promise<void> }) {
  const [note, setNote] = useState("");
  const due = new Date(new Date(e.started_at).getTime() + 14 * 86400000);
  const canMeasure = demo || due.getTime() <= new Date(observedAt).getTime();
  return <article className={styles.experiment}><div className={styles.sectionHead}><h3>{policies[e.policy_id].title}</h3><span className={styles.tag}>{e.status === "rejected" && !e.learning_eligible ? "Баримт хүрэлцээгүй · сургамжид оруулаагүй" : statusLabel[e.status]}</span></div><p className={styles.caption}>Эхэлсэн: {date(e.started_at)} · Хэмжих: {date(due.toISOString())}</p>
    {e.status === "running" && <button className={styles.secondary} disabled={busy || !canMeasure} onClick={() => void act({ action: "measure", id: e.id })}>{demo ? "14 хоногийн жишээ үр дүнг үзэх" : canMeasure ? "Одоогийн үр дүнг хэмжих" : "Ажиглалтын хугацаа үргэлжилж байна"}</button>}
    {e.after_snapshot && <p>{metricLabels[policies[e.policy_id].metric]}: {e.before_snapshot.metrics[policies[e.policy_id].metric]} → {e.after_snapshot.metrics[policies[e.policy_id].metric]} гишүүн. {e.learning_eligible ? `Зорьсон чиглэлийн өөрчлөлт: ${e.delta && e.delta > 0 ? "+" : ""}${e.delta} нэгж хувь.` : "Бүрэлдэхүүн эсвэл түүврийн хэмжээ харьцуулах шалгуур хангахгүй."}</p>}
    {(e.status === "measured" || e.status === "running") && <div className={styles.review}><label htmlFor={`note-${e.id}`}>Үнэлгээний тайлбар · 10–1000 тэмдэгт</label><textarea id={`note-${e.id}`} value={note} maxLength={1000} rows={2} onChange={event => setNote(event.target.value)} placeholder="Өөрчлөлтөд өөр юу нөлөөлсөн, цаашид юуг ажиглах вэ?"/><div className={styles.actions}>{e.status === "running" ? <button className={styles.secondary} disabled={busy || note.trim().length < 10} onClick={() => void act({ action: "stop", id: e.id, note })}>Туршилтыг зогсоох</button> : <><button className={styles.primary} disabled={busy || note.trim().length < 10 || !e.learning_eligible || (e.delta ?? 0) <= 0} onClick={() => void act({ action: "review", id: e.id, verdict: "accepted", note })}>Сургамжид оруулах</button><button className={styles.secondary} disabled={busy || note.trim().length < 10} onClick={() => void act({ action: "review", id: e.id, verdict: "rejected", note })}>Дэмжих баримт хангалтгүй</button></>}</div></div>}
    {e.review_note && <p className={styles.caption}>Удирдагчийн үнэлгээ: {e.review_note}</p>}
  </article>;
}
