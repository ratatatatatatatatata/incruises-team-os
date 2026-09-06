import type {
  AcademyCatalogResponse,
  AcademyCourse,
  AcademyProgress,
} from "@/lib/academy/contracts";
import { academyUuidPattern } from "@/lib/academy/contracts";
import {
  AcademyAccessError,
  academyFailure,
  academyJson,
  assertAcademySameOrigin,
  readAcademyJsonBody,
  requireAcademyMember,
} from "@/lib/academy/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
};

type ModuleRow = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  sort_order: number;
};

type LessonRow = {
  id: string;
  module_id: string;
  slug: string;
  title: string;
  summary: string;
  duration_seconds: number | null;
  sort_order: number;
};

type VideoRow = {
  lesson_id: string;
  status: "ready";
  duration_seconds: number | null;
};

type ProgressRow = {
  lesson_id: string;
  position_seconds: number | string;
  duration_seconds: number | string;
  percent_complete: number | string;
  completed_at: string | null;
  last_watched_at: string;
};

function mapProgress(row: ProgressRow): AcademyProgress {
  return {
    positionSeconds: Number(row.position_seconds),
    durationSeconds: Number(row.duration_seconds),
    percentComplete: Number(row.percent_complete),
    completedAt: row.completed_at,
    lastWatchedAt: row.last_watched_at,
  };
}

export async function GET() {
  try {
    const { supabase } = await requireAcademyMember();
    const [coursesResult, modulesResult, lessonsResult, videosResult, progressResult] = await Promise.all([
      supabase
        .from("academy_courses")
        .select("id,slug,title,description,sort_order")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("academy_modules")
        .select("id,course_id,title,description,sort_order")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500),
      supabase
        .from("academy_lessons")
        .select("id,module_id,slug,title,summary,duration_seconds,sort_order")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(2_000),
      supabase
        .from("academy_video_assets")
        .select("lesson_id,status,duration_seconds")
        .eq("status", "ready")
        .limit(2_000),
      supabase
        .from("academy_watch_progress")
        .select("lesson_id,position_seconds,duration_seconds,percent_complete,completed_at,last_watched_at")
        .order("last_watched_at", { ascending: false })
        .limit(2_000),
    ]);

    const firstError =
      coursesResult.error ??
      modulesResult.error ??
      lessonsResult.error ??
      videosResult.error ??
      progressResult.error;
    if (firstError) throw firstError;

    const courses = (coursesResult.data ?? []) as CourseRow[];
    const modules = (modulesResult.data ?? []) as ModuleRow[];
    const lessons = (lessonsResult.data ?? []) as LessonRow[];
    const videos = (videosResult.data ?? []) as VideoRow[];
    const progressRows = (progressResult.data ?? []) as ProgressRow[];

    const readyVideoByLesson = new Map(videos.map((video) => [video.lesson_id, video]));
    const progressByLesson = new Map(progressRows.map((row) => [row.lesson_id, mapProgress(row)]));
    const lessonsByModule = new Map<string, LessonRow[]>();
    const modulesByCourse = new Map<string, ModuleRow[]>();

    for (const lesson of lessons) {
      const group = lessonsByModule.get(lesson.module_id) ?? [];
      group.push(lesson);
      lessonsByModule.set(lesson.module_id, group);
    }
    for (const academyModule of modules) {
      const group = modulesByCourse.get(academyModule.course_id) ?? [];
      group.push(academyModule);
      modulesByCourse.set(academyModule.course_id, group);
    }

    const mappedCourses: AcademyCourse[] = courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      sortOrder: course.sort_order,
      modules: (modulesByCourse.get(course.id) ?? []).map((academyModule) => ({
        id: academyModule.id,
        title: academyModule.title,
        description: academyModule.description,
        sortOrder: academyModule.sort_order,
        lessons: (lessonsByModule.get(academyModule.id) ?? []).map((lesson) => {
          const video = readyVideoByLesson.get(lesson.id);
          return {
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            durationSeconds: video?.duration_seconds ?? lesson.duration_seconds,
            sortOrder: lesson.sort_order,
            videoReady: Boolean(video),
            progress: progressByLesson.get(lesson.id) ?? null,
          };
        }),
      })),
    }));

    const mappedLessons = mappedCourses.flatMap((course) =>
      course.modules.flatMap((academyModule) => academyModule.lessons),
    );
    const completedCount = mappedLessons.filter(
      (lesson) => lesson.progress?.completedAt || (lesson.progress?.percentComplete ?? 0) >= 90,
    ).length;
    const response: AcademyCatalogResponse = {
      courses: mappedCourses,
      summary: {
        lessonCount: mappedLessons.length,
        completedCount,
        percentComplete:
          mappedLessons.length === 0 ? 0 : Math.round((completedCount / mappedLessons.length) * 100),
      },
    };

    return academyJson(response as unknown as Record<string, unknown>);
  } catch (error) {
    return academyFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertAcademySameOrigin(request);
    const body = await readAcademyJsonBody(request);
    if (body.action !== "save_progress") {
      throw new AcademyAccessError(400, "unknown_action", "Танигдаагүй Academy үйлдэл байна.");
    }

    const lessonId = String(body.lessonId ?? "");
    const positionSeconds = Number(body.positionSeconds);
    const durationSeconds = Number(body.durationSeconds);
    const completed = body.completed === true;

    if (
      !academyUuidPattern.test(lessonId) ||
      !Number.isFinite(positionSeconds) ||
      !Number.isFinite(durationSeconds) ||
      positionSeconds < 0 ||
      durationSeconds < 1 ||
      durationSeconds > 43_200 ||
      positionSeconds > durationSeconds + 60
    ) {
      throw new AcademyAccessError(400, "invalid_progress", "Видео ахицын утга буруу байна.");
    }

    const { supabase } = await requireAcademyMember();
    const { data, error } = await supabase.rpc("save_academy_watch_progress", {
      p_lesson_id: lessonId,
      p_position_seconds: positionSeconds,
      p_duration_seconds: durationSeconds,
      p_completed: completed,
    });

    if (error?.code === "42501") {
      throw new AcademyAccessError(403, "progress_not_allowed", "Энэ хичээлийн ахицыг хадгалах эрхгүй байна.");
    }
    if (error?.code === "P0002") {
      throw new AcademyAccessError(404, "lesson_not_available", "Нийтлэгдсэн видео хичээл олдсонгүй.");
    }
    if (error?.code === "22023") {
      throw new AcademyAccessError(400, "invalid_progress", "Видео ахицын утга буруу байна.");
    }
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as ProgressRow | undefined;
    if (!row) throw new Error("Academy progress RPC returned no row");
    return academyJson({ progress: mapProgress(row) });
  } catch (error) {
    return academyFailure(error);
  }
}
