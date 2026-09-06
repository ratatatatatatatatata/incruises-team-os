"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AcademyCatalogResponse, AcademyLesson, AcademyProgress } from "@/lib/academy/contracts";
import styles from "../academy.module.css";
import { MuxVideoPlayer } from "./mux-video-player";

type ApiError = { error?: string };

export function AcademyLessonView({ lessonId }: { lessonId: string }) {
  const [catalog, setCatalog] = useState<AcademyCatalogResponse | null>(null);
  const [progress, setProgress] = useState<AcademyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLesson = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/academy", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const body = (await response.json().catch(() => ({}))) as AcademyCatalogResponse & ApiError;
      if (!response.ok) throw new Error(body.error || "Хичээлийг ачаалж чадсангүй.");
      const found = body.courses
        .flatMap((course) => course.modules)
        .flatMap((academyModule) => academyModule.lessons)
        .find((lesson) => lesson.id === lessonId);
      if (!found) throw new Error("Нийтлэгдсэн хичээл олдсонгүй.");
      setCatalog(body);
      setProgress(found.progress);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Хичээлийг ачаалж чадсангүй.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      void loadLesson(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadLesson]);

  const lessonContext = useMemo(() => {
    if (!catalog) return null;
    const ordered: Array<{
      lesson: AcademyLesson;
      courseTitle: string;
      moduleTitle: string;
    }> = [];
    for (const course of catalog.courses) {
      for (const academyModule of course.modules) {
        for (const lesson of academyModule.lessons) {
          ordered.push({ lesson, courseTitle: course.title, moduleTitle: academyModule.title });
        }
      }
    }
    const index = ordered.findIndex((item) => item.lesson.id === lessonId);
    if (index < 0) return null;
    return { ...ordered[index], nextLesson: ordered[index + 1]?.lesson ?? null };
  }, [catalog, lessonId]);

  if (loading && !lessonContext) {
    return (
      <section className={styles.statePanel} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <h2>Видео хичээлийг нээж байна…</h2>
      </section>
    );
  }

  if (error || !lessonContext) {
    return (
      <section className={styles.statePanel} role="alert">
        <h2>Хичээл нээгдсэнгүй</h2>
        <p>{error || "Хичээл олдсонгүй."}</p>
        <button type="button" onClick={() => void loadLesson()}>Дахин оролдох</button>
        <Link className={styles.backLink} href="/academy">Academy руу буцах</Link>
      </section>
    );
  }

  const percent = Math.round(progress?.percentComplete ?? 0);
  const completed = Boolean(progress?.completedAt) || percent >= 90;

  return (
    <article className={styles.lessonPage}>
      <header className={styles.lessonHeading}>
        <div>
          <Link className={styles.backLink} href="/academy">← Бүх хичээл</Link>
          <p className={styles.eyebrow}>{lessonContext.courseTitle} · {lessonContext.moduleTitle}</p>
          <h1>{lessonContext.lesson.title}</h1>
          {lessonContext.lesson.summary ? <p>{lessonContext.lesson.summary}</p> : null}
        </div>
        <div className={styles.lessonProgress} aria-label="Энэ хичээлийн ахиц">
          <strong>{completed ? "Үзсэн" : `${percent}%`}</strong>
          <span>{completed ? "Хичээл дууссан" : "Автоматаар хадгална"}</span>
        </div>
      </header>

      {lessonContext.lesson.videoReady ? (
        <MuxVideoPlayer
          lessonId={lessonContext.lesson.id}
          title={lessonContext.lesson.title}
          expectedDurationSeconds={lessonContext.lesson.durationSeconds}
          initialProgress={progress}
          onProgress={setProgress}
        />
      ) : (
        <section className={styles.statePanel}>
          <h2>Видео боловсруулж байна</h2>
          <p>Бэлэн болмогц энэ хичээлийг эндээс үзнэ.</p>
        </section>
      )}

      <footer className={styles.lessonFooter}>
        <div>
          <h2>{completed ? "Сайн байна — хичээл дууслаа." : "Хүссэн үедээ завсарлаж болно."}</h2>
          <p>Боломжтой browser дээр үзсэн байрлал ойролцоогоор 15 секунд тутам хадгалагдана.</p>
        </div>
        {lessonContext.nextLesson?.videoReady ? (
          <Link className={styles.nextLink} href={`/academy/${lessonContext.nextLesson.id}`}>
            Дараагийн хичээл →
          </Link>
        ) : (
          <Link className={styles.nextLink} href="/academy">Бүх хичээл →</Link>
        )}
      </footer>
    </article>
  );
}
