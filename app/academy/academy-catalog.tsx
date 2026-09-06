"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyCatalogResponse, AcademyLesson } from "@/lib/academy/contracts";
import styles from "./academy.module.css";

type ApiError = { error?: string };

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Хугацаа тодорхойгүй";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} минут`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} цаг ${remainder} минут` : `${hours} цаг`;
}

function lessonState(lesson: AcademyLesson) {
  if (!lesson.videoReady) return { label: "Удахгүй", className: styles.pendingBadge };
  if (lesson.progress?.completedAt || (lesson.progress?.percentComplete ?? 0) >= 90) {
    return { label: "Үзсэн", className: styles.completeBadge };
  }
  if ((lesson.progress?.positionSeconds ?? 0) > 0) {
    return { label: "Үргэлжлүүлэх", className: styles.resumeBadge };
  }
  return { label: "Эхлэх", className: styles.readyBadge };
}

export function AcademyCatalog() {
  const [catalog, setCatalog] = useState<AcademyCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/academy", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const body = (await response.json().catch(() => ({}))) as AcademyCatalogResponse & ApiError;
      if (!response.ok) throw new Error(body.error || "Academy-г ачаалж чадсангүй.");
      setCatalog(body);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Academy-г ачаалж чадсангүй.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      void loadCatalog(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadCatalog]);

  const nextLesson = useMemo(
    () =>
      catalog?.courses
        .flatMap((course) => course.modules)
        .flatMap((academyModule) => academyModule.lessons)
        .find(
          (lesson) =>
            lesson.videoReady &&
            !lesson.progress?.completedAt &&
            (lesson.progress?.percentComplete ?? 0) < 90,
        ) ?? null,
    [catalog],
  );

  return (
    <div className={styles.catalogPage}>
      <section className={styles.hero} aria-labelledby="academy-title">
        <div>
          <p className={styles.eyebrow}>VIDEO ACADEMY</p>
          <h1 id="academy-title">Нэг хичээл. Нэг ойлгомжтой алхам.</h1>
          <p>
            Хичээлээ өөрийн хурдаар үзнэ. Видео хаасан ч боломжтой browser дээр үзсэн газрыг тань хадгалж,
            дараагийн удаа тэндээс үргэлжлүүлнэ.
          </p>
          {nextLesson ? (
            <Link className={styles.primaryAction} href={`/academy/${nextLesson.id}`}>
              {nextLesson.progress ? "Үргэлжлүүлэн үзэх" : "Эхний хичээлээ эхлэх"}
            </Link>
          ) : null}
        </div>
        <div className={styles.progressSummary} aria-label="Нийт Academy ахиц">
          <strong>{catalog?.summary.percentComplete ?? 0}%</strong>
          <span>{catalog?.summary.completedCount ?? 0} / {catalog?.summary.lessonCount ?? 0} хичээл</span>
          <div aria-hidden="true"><i style={{ width: `${catalog?.summary.percentComplete ?? 0}%` }} /></div>
        </div>
      </section>

      {loading && !catalog ? (
        <section className={styles.statePanel} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <h2>Хичээлүүдийг бэлдэж байна…</h2>
        </section>
      ) : null}

      {error ? (
        <section className={styles.statePanel} role="alert">
          <h2>Academy нээгдсэнгүй</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadCatalog()}>Дахин оролдох</button>
        </section>
      ) : null}

      {!loading && !error && catalog?.courses.length === 0 ? (
        <section className={styles.statePanel}>
          <p className={styles.eyebrow}>CATALOG READY</p>
          <h2>Эхний курс удахгүй орно.</h2>
          <p>Админ курс, модуль, хичээл болон бэлэн Mux playback ID-г нийтэлсний дараа энд автоматаар харагдана.</p>
        </section>
      ) : null}

      <div className={styles.courseList}>
        {catalog?.courses.map((course, courseIndex) => {
          const lessons = course.modules.flatMap((academyModule) => academyModule.lessons);
          const completed = lessons.filter(
            (lesson) => lesson.progress?.completedAt || (lesson.progress?.percentComplete ?? 0) >= 90,
          ).length;
          return (
            <section className={styles.courseCard} key={course.id} aria-labelledby={`course-${course.id}`}>
              <header className={styles.courseHeader}>
                <span>{String(courseIndex + 1).padStart(2, "0")}</span>
                <div>
                  <p className={styles.eyebrow}>{completed} / {lessons.length} ХИЧЭЭЛ ҮЗСЭН</p>
                  <h2 id={`course-${course.id}`}>{course.title}</h2>
                  {course.description ? <p>{course.description}</p> : null}
                </div>
              </header>

              <div className={styles.moduleList}>
                {course.modules.map((academyModule, moduleIndex) => (
                  <section className={styles.moduleCard} key={academyModule.id}>
                    <header>
                      <span>Модуль {moduleIndex + 1}</span>
                      <h3>{academyModule.title}</h3>
                      {academyModule.description ? <p>{academyModule.description}</p> : null}
                    </header>
                    <ol className={styles.lessonList}>
                      {academyModule.lessons.map((lesson, lessonIndex) => {
                        const state = lessonState(lesson);
                        const progress = Math.round(lesson.progress?.percentComplete ?? 0);
                        return (
                          <li key={lesson.id}>
                            <span className={styles.lessonNumber}>{lessonIndex + 1}</span>
                            <div className={styles.lessonCopy}>
                              <strong>{lesson.title}</strong>
                              <small>{formatDuration(lesson.durationSeconds)}{progress > 0 ? ` · ${progress}% үзсэн` : ""}</small>
                            </div>
                            {lesson.videoReady ? (
                              <Link className={state.className} href={`/academy/${lesson.id}`}>{state.label}</Link>
                            ) : (
                              <span className={state.className}>{state.label}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
