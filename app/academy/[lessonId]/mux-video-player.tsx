"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AcademyPlaybackResponse, AcademyProgress } from "@/lib/academy/contracts";
import styles from "../academy.module.css";

type ApiError = { error?: string };
type PlayerMode = "native" | "iframe";

export function MuxVideoPlayer({
  lessonId,
  title,
  expectedDurationSeconds,
  initialProgress,
  onProgress,
}: {
  lessonId: string;
  title: string;
  expectedDurationSeconds: number | null;
  initialProgress: AcademyProgress | null;
  onProgress: (progress: AcademyProgress) => void;
}) {
  const [playback, setPlayback] = useState<AcademyPlaybackResponse | null>(null);
  const [playerMode, setPlayerMode] = useState<PlayerMode>("native");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("Ахиц автоматаар хадгалагдана");
  const [localPercent, setLocalPercent] = useState(Math.round(initialProgress?.percentComplete ?? 0));
  const positionRef = useRef(initialProgress?.positionSeconds ?? 0);
  const durationRef = useRef(initialProgress?.durationSeconds ?? expectedDurationSeconds ?? 0);
  const lastSentAtRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const resumeAppliedRef = useRef(false);

  const loadPlayback = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setPlayerMode("native");
    resumeAppliedRef.current = false;
    try {
      const response = await fetch(`/api/academy/playback?lessonId=${encodeURIComponent(lessonId)}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const body = (await response.json().catch(() => ({}))) as AcademyPlaybackResponse & ApiError;
      if (!response.ok) throw new Error(body.error || "Видеог нээж чадсангүй.");
      setPlayback(body);
      positionRef.current = body.resumeAtSeconds;
      durationRef.current = body.durationSeconds ?? durationRef.current;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Видеог нээж чадсангүй.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      void loadPlayback(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
    };
  }, [loadPlayback]);

  const saveProgress = useCallback(async (
    positionSeconds: number,
    durationSeconds: number,
    completed: boolean,
    force = false,
  ) => {
    if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds < 1 || positionSeconds < 0) return;
    const now = Date.now();
    if (!force && (now - lastSentAtRef.current < 15_000 || saveInFlightRef.current)) return;
    lastSentAtRef.current = now;
    saveInFlightRef.current = true;
    setSaveMessage("Ахиц хадгалж байна…");

    try {
      const response = await fetch("/api/academy", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_progress", lessonId, positionSeconds, durationSeconds, completed }),
      });
      const body = (await response.json().catch(() => ({}))) as { progress?: AcademyProgress } & ApiError;
      if (!response.ok || !body.progress) throw new Error(body.error || "Ахиц хадгалагдсангүй.");
      onProgress(body.progress);
      setLocalPercent(Math.round(body.progress.percentComplete));
      setSaveMessage(body.progress.completedAt ? "Хичээл үзсэн гэж хадгаллаа" : "Ахиц хадгалагдлаа");
    } catch (requestError) {
      setSaveMessage(requestError instanceof Error ? requestError.message : "Ахиц хадгалагдсангүй.");
    } finally {
      saveInFlightRef.current = false;
    }
  }, [lessonId, onProgress]);

  useEffect(() => {
    const flushProgress = () => {
      void saveProgress(positionRef.current, durationRef.current, false, true);
    };
    window.addEventListener("pagehide", flushProgress);
    return () => window.removeEventListener("pagehide", flushProgress);
  }, [saveProgress]);

  function applyResume(video: HTMLVideoElement) {
    const duration = Number.isFinite(video.duration) ? video.duration : durationRef.current;
    durationRef.current = duration;
    if (resumeAppliedRef.current) return;
    resumeAppliedRef.current = true;
    const resumeAt = playback?.resumeAtSeconds ?? 0;
    if (resumeAt > 1 && resumeAt < duration - 8) video.currentTime = resumeAt;
  }

  function trackNativeProgress(video: HTMLVideoElement) {
    if (!Number.isFinite(video.duration) || video.duration < 1) return;
    positionRef.current = video.currentTime;
    durationRef.current = video.duration;
    setLocalPercent(Math.min(100, Math.round((video.currentTime / video.duration) * 100)));
    void saveProgress(video.currentTime, video.duration, false);
  }

  function finishNativeProgress(video: HTMLVideoElement) {
    positionRef.current = video.duration;
    durationRef.current = video.duration;
    setLocalPercent(100);
    void saveProgress(video.duration, video.duration, true, true);
  }

  function markIframeComplete() {
    const duration = playback?.durationSeconds ?? expectedDurationSeconds ?? durationRef.current;
    if (!duration || duration < 1) {
      setSaveMessage("Хичээлийн хугацаа тохируулагдаагүй тул гараар дуусгах боломжгүй.");
      return;
    }
    positionRef.current = duration;
    durationRef.current = duration;
    void saveProgress(duration, duration, true, true);
  }

  if (loading && !playback) {
    return <section className={styles.statePanel} role="status"><span className={styles.spinner} aria-hidden="true" /><h2>Secure video link бэлдэж байна…</h2></section>;
  }

  if (error || !playback) {
    return <section className={styles.statePanel} role="alert"><h2>Видео нээгдсэнгүй</h2><p>{error || "Playback мэдээлэл олдсонгүй."}</p><button type="button" onClick={() => void loadPlayback()}>Дахин оролдох</button></section>;
  }

  return (
    <section className={styles.playerPanel} aria-label={`${title} видео`}>
      <div className={styles.playerFrame}>
        {playerMode === "native" ? (
          <video
            key={playback.streamUrl}
            controls
            controlsList="nodownload"
            playsInline
            preload="metadata"
            poster={playback.posterUrl ?? undefined}
            onLoadedMetadata={(event) => applyResume(event.currentTarget)}
            onTimeUpdate={(event) => trackNativeProgress(event.currentTarget)}
            onPause={(event) => {
              const video = event.currentTarget;
              if (Number.isFinite(video.duration)) void saveProgress(video.currentTime, video.duration, false, true);
            }}
            onEnded={(event) => finishNativeProgress(event.currentTarget)}
            onError={() => setPlayerMode("iframe")}
          >
            <source src={playback.streamUrl} type="application/vnd.apple.mpegurl" />
            Таны browser HTML video дэмжихгүй байна.
          </video>
        ) : (
          <iframe
            src={playback.embedUrl}
            title={`${title} — Mux video player`}
            allow="accelerometer; autoplay; encrypted-media; fullscreen; gyroscope; picture-in-picture"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
      <div className={styles.playerMeta} aria-live="polite">
        <span><strong>{localPercent}%</strong> · {saveMessage}</span>
        {playerMode === "native" ? (
          <button className={styles.playerButton} type="button" onClick={() => setPlayerMode("iframe")}>Өөр player ашиглах</button>
        ) : (
          <span>
            Iframe player ахицыг автоматаар уншихгүй.
            <button className={styles.playerButton} type="button" onClick={markIframeComplete}>Дуусгасан гэж тэмдэглэх</button>
          </span>
        )}
      </div>
    </section>
  );
}
