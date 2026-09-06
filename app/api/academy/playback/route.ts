import { academyUuidPattern, type AcademyPlaybackResponse } from "@/lib/academy/contracts";
import { buildMuxPlayback, MuxConfigurationError } from "@/lib/academy/mux";
import {
  AcademyAccessError,
  academyFailure,
  academyJson,
  requireAcademyMember,
} from "@/lib/academy/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LessonRow = {
  id: string;
  module_id: string;
  title: string;
  duration_seconds: number | null;
};

type ModuleRow = { id: string; course_id: string };
type VideoRow = {
  lesson_id: string;
  mux_playback_id: string;
  playback_policy: "public" | "signed";
  duration_seconds: number | null;
};
type ProgressRow = {
  position_seconds: number | string;
  duration_seconds: number | string;
  completed_at: string | null;
};

export async function GET(request: Request) {
  try {
    const lessonId = new URL(request.url).searchParams.get("lessonId") ?? "";
    if (!academyUuidPattern.test(lessonId)) {
      throw new AcademyAccessError(400, "invalid_lesson", "Хүчинтэй хичээл сонгоно уу.");
    }

    const { supabase } = await requireAcademyMember();
    const { data: lessonData, error: lessonError } = await supabase
      .from("academy_lessons")
      .select("id,module_id,title,duration_seconds")
      .eq("id", lessonId)
      .eq("status", "published")
      .maybeSingle();
    if (lessonError) throw lessonError;

    const lesson = lessonData as LessonRow | null;
    if (!lesson) {
      throw new AcademyAccessError(404, "lesson_not_available", "Нийтлэгдсэн хичээл олдсонгүй.");
    }

    const { data: moduleData, error: moduleError } = await supabase
      .from("academy_modules")
      .select("id,course_id")
      .eq("id", lesson.module_id)
      .eq("status", "published")
      .maybeSingle();
    if (moduleError) throw moduleError;

    const academyModule = moduleData as ModuleRow | null;
    if (!academyModule) {
      throw new AcademyAccessError(404, "lesson_not_available", "Хичээлийн модуль нийтлэгдээгүй байна.");
    }

    const { data: courseData, error: courseError } = await supabase
      .from("academy_courses")
      .select("id")
      .eq("id", academyModule.course_id)
      .eq("status", "published")
      .maybeSingle();
    if (courseError) throw courseError;
    if (!courseData) {
      throw new AcademyAccessError(404, "lesson_not_available", "Хичээлийн курс нийтлэгдээгүй байна.");
    }

    const [videoResult, progressResult] = await Promise.all([
      supabase
        .from("academy_video_assets")
        .select("lesson_id,mux_playback_id,playback_policy,duration_seconds")
        .eq("lesson_id", lessonId)
        .eq("status", "ready")
        .maybeSingle(),
      supabase
        .from("academy_watch_progress")
        .select("position_seconds,duration_seconds,completed_at")
        .eq("lesson_id", lessonId)
        .maybeSingle(),
    ]);
    if (videoResult.error) throw videoResult.error;
    if (progressResult.error) throw progressResult.error;

    const video = videoResult.data as VideoRow | null;
    if (!video) {
      throw new AcademyAccessError(404, "video_not_ready", "Энэ хичээлийн видео хараахан бэлэн биш байна.");
    }

    const durationSeconds = video.duration_seconds ?? lesson.duration_seconds;
    const progress = progressResult.data as ProgressRow | null;
    const storedPosition = Math.max(0, Number(progress?.position_seconds ?? 0));
    const storedDuration = Math.max(0, Number(progress?.duration_seconds ?? durationSeconds ?? 0));
    const resumeAtSeconds = progress?.completed_at || (storedDuration > 0 && storedPosition >= storedDuration - 8)
      ? 0
      : storedPosition;
    const playback = buildMuxPlayback({
      playbackId: video.mux_playback_id,
      policy: video.playback_policy,
      lessonId,
      title: lesson.title,
      resumeAtSeconds,
      durationSeconds,
    });

    const response: AcademyPlaybackResponse = {
      lessonId,
      title: lesson.title,
      policy: video.playback_policy,
      streamUrl: playback.streamUrl,
      embedUrl: playback.embedUrl,
      posterUrl: playback.posterUrl,
      resumeAtSeconds,
      durationSeconds,
      expiresAt: playback.expiresAt,
    };
    return academyJson(response as unknown as Record<string, unknown>);
  } catch (error) {
    if (error instanceof MuxConfigurationError) {
      return academyJson({ error: error.message, code: "mux_signing_not_configured" }, 503);
    }
    return academyFailure(error);
  }
}
