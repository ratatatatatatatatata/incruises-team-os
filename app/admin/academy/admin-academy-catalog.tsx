"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyPublishStatus } from "@/lib/academy/contracts";
import styles from "./admin-academy.module.css";

type CourseRow = { id: string; slug: string; title: string; description: string; status: AcademyPublishStatus; sort_order: number };
type ModuleRow = { id: string; course_id: string; title: string; description: string; status: AcademyPublishStatus; sort_order: number };
type LessonRow = { id: string; module_id: string; slug: string; title: string; summary: string; duration_seconds: number | null; status: AcademyPublishStatus; sort_order: number };
type VideoRow = { id: string; lesson_id: string; mux_asset_id: string | null; mux_playback_id: string; playback_policy: "public" | "signed"; status: "preparing" | "ready" | "errored" | "disabled"; duration_seconds: number | null };
type CatalogData = { courses: CourseRow[]; modules: ModuleRow[]; lessons: LessonRow[]; videos: VideoRow[] };
type ApiError = { error?: string };

async function postAction(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/academy", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as ApiError;
  if (!response.ok) throw new Error(result.error || "Үйлдлийг гүйцэтгэж чадсангүй.");
  return result;
}

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function StatusButtons({
  entity,
  id,
  status,
  disabled,
  onChange,
}: {
  entity: "course" | "module" | "lesson";
  id: string;
  status: AcademyPublishStatus;
  disabled: boolean;
  onChange: (entity: "course" | "module" | "lesson", id: string, status: AcademyPublishStatus) => void;
}) {
  return (
    <div className={styles.statusButtons}>
      {status !== "published" ? <button type="button" disabled={disabled} onClick={() => onChange(entity, id, "published")}>Нийтлэх</button> : null}
      {status !== "draft" ? <button type="button" disabled={disabled} onClick={() => onChange(entity, id, "draft")}>Draft болгох</button> : null}
      {status !== "archived" ? <button type="button" disabled={disabled} onClick={() => onChange(entity, id, "archived")}>Архивлах</button> : null}
    </div>
  );
}

export function AdminAcademyCatalog() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/academy", { credentials: "same-origin", cache: "no-store", signal });
      const body = (await response.json().catch(() => ({}))) as CatalogData & ApiError;
      if (!response.ok) throw new Error(body.error || "Catalog ачаалж чадсангүй.");
      setCatalog(body);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Catalog ачаалж чадсангүй.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadCatalog(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadCatalog]);

  const videoByLesson = useMemo(() => new Map((catalog?.videos ?? []).map((video) => [video.lesson_id, video])), [catalog]);

  async function runAction(body: Record<string, unknown>, successMessage: string, form?: HTMLFormElement) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await postAction(body);
      form?.reset();
      setNotice(successMessage);
      await loadCatalog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Үйлдэл амжилтгүй.");
    } finally {
      setBusy(false);
    }
  }

  function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runAction({ action: "create_course", title: value(data, "title"), slug: value(data, "slug"), description: value(data, "description"), sortOrder: Number(value(data, "sortOrder") || 0) }, "Draft курс үүслээ.", form);
  }

  function createModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runAction({ action: "create_module", courseId: value(data, "courseId"), title: value(data, "title"), description: value(data, "description"), sortOrder: Number(value(data, "sortOrder") || 0) }, "Draft модуль үүслээ.", form);
  }

  function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runAction({ action: "create_lesson", moduleId: value(data, "moduleId"), title: value(data, "title"), slug: value(data, "slug"), summary: value(data, "summary"), durationSeconds: value(data, "durationSeconds"), sortOrder: Number(value(data, "sortOrder") || 0) }, "Draft хичээл үүслээ.", form);
  }

  function setVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void runAction({ action: "set_video", lessonId: value(data, "lessonId"), muxPlaybackId: value(data, "muxPlaybackId"), muxAssetId: value(data, "muxAssetId"), playbackPolicy: value(data, "playbackPolicy"), status: value(data, "status"), durationSeconds: value(data, "durationSeconds"), aspectRatio: value(data, "aspectRatio") }, "Mux video мэдээлэл хадгалагдлаа.", form);
  }

  function setStatus(entity: "course" | "module" | "lesson", id: string, status: AcademyPublishStatus) {
    void runAction({ action: "set_status", entity, id, status }, `Төлөв ${status} боллоо.`);
  }

  return (
    <div className={styles.console}>
      <section className={styles.rules} aria-label="Нийтлэх дараалал">
        <strong>Аюулгүй дараалал</strong>
        <span>1. Course → module → lesson-ээ draft-аар үүсгэнэ</span>
        <span>2. Mux playback ID-г холбоно</span>
        <span>3. Video-г ready болгоно</span>
        <span>4. Lesson → module → course-ээ нийтэлнэ</span>
      </section>

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <section className={styles.formGrid} aria-label="Academy catalog үүсгэх">
        <form onSubmit={createCourse}>
          <p className={styles.eyebrow}>1 · COURSE</p><h2>Курс үүсгэх</h2>
          <label>Нэр<input name="title" required maxLength={140} /></label>
          <label>Slug<input name="slug" required maxLength={80} placeholder="ehnii-alham" pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label>Тайлбар<textarea name="description" maxLength={5000} rows={3} /></label>
          <label>Дараалал<input name="sortOrder" type="number" min={0} max={100000} defaultValue={0} /></label>
          <button type="submit" disabled={busy}>Draft курс үүсгэх</button>
        </form>

        <form onSubmit={createModule}>
          <p className={styles.eyebrow}>2 · MODULE</p><h2>Модуль үүсгэх</h2>
          <label>Курс<select name="courseId" required defaultValue=""><option value="" disabled>Сонгох</option>{catalog?.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
          <label>Нэр<input name="title" required maxLength={140} /></label>
          <label>Тайлбар<textarea name="description" maxLength={5000} rows={3} /></label>
          <label>Дараалал<input name="sortOrder" type="number" min={0} max={100000} defaultValue={0} /></label>
          <button type="submit" disabled={busy || !catalog?.courses.length}>Draft модуль үүсгэх</button>
        </form>

        <form onSubmit={createLesson}>
          <p className={styles.eyebrow}>3 · LESSON</p><h2>Хичээл үүсгэх</h2>
          <label>Модуль<select name="moduleId" required defaultValue=""><option value="" disabled>Сонгох</option>{catalog?.modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>Нэр<input name="title" required maxLength={160} /></label>
          <label>Slug<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label>Тайлбар<textarea name="summary" maxLength={8000} rows={3} /></label>
          <div className={styles.inlineFields}><label>Секунд<input name="durationSeconds" type="number" min={1} max={43200} /></label><label>Дараалал<input name="sortOrder" type="number" min={0} max={100000} defaultValue={0} /></label></div>
          <button type="submit" disabled={busy || !catalog?.modules.length}>Draft хичээл үүсгэх</button>
        </form>

        <form onSubmit={setVideo}>
          <p className={styles.eyebrow}>4 · MUX VIDEO</p><h2>Видео холбох</h2>
          <label>Хичээл<select name="lessonId" required defaultValue=""><option value="" disabled>Сонгох</option>{catalog?.lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
          <label>Playback ID<input name="muxPlaybackId" required minLength={6} maxLength={255} /></label>
          <label>Asset ID (заавал биш)<input name="muxAssetId" minLength={6} maxLength={255} /></label>
          <div className={styles.inlineFields}><label>Policy<select name="playbackPolicy" defaultValue="signed"><option value="signed">Signed</option><option value="public">Public</option></select></label><label>Төлөв<select name="status" defaultValue="preparing"><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="errored">Error</option><option value="disabled">Disabled</option></select></label></div>
          <div className={styles.inlineFields}><label>Секунд (ready үед заавал)<input name="durationSeconds" type="number" min={1} max={43200} /></label><label>Харьцаа<input name="aspectRatio" maxLength={20} placeholder="16:9" /></label></div>
          <button type="submit" disabled={busy || !catalog?.lessons.length}>Видео мэдээлэл хадгалах</button>
        </form>
      </section>

      <section className={styles.catalog} aria-labelledby="catalog-heading">
        <header><div><p className={styles.eyebrow}>CURRENT CATALOG</p><h2 id="catalog-heading">Нийтлэх төлөв</h2></div><button type="button" onClick={() => void loadCatalog()} disabled={busy || loading}>{loading ? "Ачаалж байна…" : "Дахин ачаалах"}</button></header>
        {!loading && catalog?.courses.length === 0 ? <p>Одоогоор курс алга.</p> : null}
        {catalog?.courses.map((course) => (
          <article key={course.id} className={styles.course}>
            <div className={styles.itemHeading}><div><span className={styles[course.status]}>{course.status}</span><h3>{course.title}</h3><small>/{course.slug}</small></div><StatusButtons entity="course" id={course.id} status={course.status} disabled={busy} onChange={setStatus} /></div>
            {(catalog.modules.filter((item) => item.course_id === course.id)).map((academyModule) => (
              <section key={academyModule.id} className={styles.module}>
                <div className={styles.itemHeading}><div><span className={styles[academyModule.status]}>{academyModule.status}</span><h4>{academyModule.title}</h4></div><StatusButtons entity="module" id={academyModule.id} status={academyModule.status} disabled={busy} onChange={setStatus} /></div>
                {(catalog.lessons.filter((lesson) => lesson.module_id === academyModule.id)).map((lesson) => {
                  const video = videoByLesson.get(lesson.id);
                  return <div key={lesson.id} className={styles.lesson}><div><span className={styles[lesson.status]}>{lesson.status}</span><strong>{lesson.title}</strong><small>{video ? `Mux: ${video.playback_policy} · ${video.status}` : "Видео холбоогүй"}</small></div><StatusButtons entity="lesson" id={lesson.id} status={lesson.status} disabled={busy} onChange={setStatus} /></div>;
                })}
              </section>
            ))}
          </article>
        ))}
      </section>
    </div>
  );
}
