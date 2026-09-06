export type AcademyPublishStatus = "draft" | "published" | "archived";
export type AcademyVideoStatus = "preparing" | "ready" | "errored" | "disabled";
export type AcademyPlaybackPolicy = "public" | "signed";

export type AcademyProgress = {
  positionSeconds: number;
  durationSeconds: number;
  percentComplete: number;
  completedAt: string | null;
  lastWatchedAt: string;
};

export type AcademyLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  durationSeconds: number | null;
  sortOrder: number;
  videoReady: boolean;
  progress: AcademyProgress | null;
};

export type AcademyModule = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  lessons: AcademyLesson[];
};

export type AcademyCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  modules: AcademyModule[];
};

export type AcademyCatalogResponse = {
  courses: AcademyCourse[];
  summary: {
    lessonCount: number;
    completedCount: number;
    percentComplete: number;
  };
};

export type AcademyPlaybackResponse = {
  lessonId: string;
  title: string;
  policy: AcademyPlaybackPolicy;
  streamUrl: string;
  embedUrl: string;
  posterUrl: string | null;
  resumeAtSeconds: number;
  durationSeconds: number | null;
  expiresAt: string | null;
};

export const academyUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const academySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const muxIdentifierPattern = /^[A-Za-z0-9_-]{6,255}$/;
