import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { learningLevels, officialSources } from "../../team-os-data";

const allowedSourceIds = new Set<string>(officialSources.map((source) => source.id));
const allowedLessonIds = new Set<string>(learningLevels.flatMap((level) => level.lessons.map((lesson) => lesson.id)));
const allowedChannels = new Set(["Facebook", "Instagram", "Short video", "FAQ", "Message"]);

type TeamRole = "builder" | "coach" | "director" | "admin";

type AuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: TeamRole;
};

type LessonRow = { lesson_id: string; status: string; score: number | null };
type DraftRow = {
  id: number;
  owner_id: string;
  title: string;
  channel: string;
  source_id: string;
  status: string;
  excerpt: string;
  created_at: string;
  review_note: string | null;
  corporate_approval_ref: string | null;
  corporate_approved_at: string | null;
};
type TaskRow = {
  id: number;
  member_name: string;
  milestone: string;
  next_action: string;
  due_label: string;
  risk: string;
  status: string;
};

class WorkspaceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authorizedContext(): Promise<AuthContext> {
  if (!isSupabaseConfigured()) throw new WorkspaceError(503, "Supabase project is not configured");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (error || !userId) throw new WorkspaceError(401, "Sign in required");

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) throw membershipError;

  const member = membership as { role: TeamRole; status: "active" | "disabled" } | null;
  if (!member || member.status !== "active") throw new WorkspaceError(403, "Team access is not active");

  return { supabase, userId, role: member.role };
}

function transitionFailure(error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new WorkspaceError(403, "Энэ үйлдэлд шаардлагатай эрх эсвэл тусдаа хянагч алга.");
  if (error.code === "P0002") throw new WorkspaceError(404, "Ноорог олдсонгүй.");
  if (error.code === "22023") throw new WorkspaceError(409, "Контентын төлөв эсвэл эх сурвалж энэ шилжилтийг зөвшөөрөхгүй байна.");
  throw error;
}

function serverError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("Workspace request failed", error);
  return Response.json({ error: "Workspace service unavailable" }, { status: 500 });
}

export async function GET() {
  try {
    const { supabase, userId, role } = await authorizedContext();
    const [progressResult, draftsResult, tasksResult] = await Promise.all([
      supabase.from("lesson_progress").select("lesson_id,status,score").order("completed_at", { ascending: false }),
      supabase
        .from("content_drafts")
        .select("id,owner_id,title,channel,source_id,status,excerpt,created_at,review_note,corporate_approval_ref,corporate_approved_at")
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("member_tasks")
        .select("id,member_name,milestone,next_action,due_label,risk,status")
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

    const firstError = progressResult.error ?? draftsResult.error ?? tasksResult.error;
    if (firstError) throw firstError;

    const progress = ((progressResult.data ?? []) as LessonRow[]).map((row) => ({
      lessonId: row.lesson_id,
      status: row.status,
      score: row.score,
    }));
    const drafts = ((draftsResult.data ?? []) as DraftRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      channel: row.channel,
      sourceId: row.source_id,
      status: row.status,
      excerpt: row.excerpt,
      createdAt: row.created_at,
      isOwner: row.owner_id === userId,
      reviewNote: row.review_note,
      corporateApprovalRef: row.corporate_approval_ref,
      corporateApprovedAt: row.corporate_approved_at,
    }));
    const memberTasks = ((tasksResult.data ?? []) as TaskRow[]).map((row) => ({
      id: row.id,
      memberName: row.member_name,
      milestone: row.milestone,
      nextAction: row.next_action,
      dueLabel: row.due_label,
      risk: row.risk,
      status: row.status,
    }));

    return Response.json({
      viewer: {
        role,
        canReview: ["coach", "director", "admin"].includes(role),
        canRecordCorporateApproval: role === "admin",
      },
      progress,
      drafts,
      memberTasks,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, role } = await authorizedContext();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "toggle_lesson") {
      const lessonId = String(body.lessonId ?? "");
      if (!allowedLessonIds.has(lessonId)) return Response.json({ error: "Unknown lesson" }, { status: 400 });

      const { data: existing, error: selectError } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (selectError) throw selectError;

      if (existing) {
        const { data: deleted, error } = await supabase
          .from("lesson_progress")
          .delete()
          .eq("user_id", userId)
          .eq("lesson_id", lessonId)
          .select("lesson_id")
          .maybeSingle();
        if (error) throw error;
        if (!deleted) throw new WorkspaceError(404, "Lesson progress not found");
        return Response.json({ completed: false });
      }

      const { error } = await supabase.from("lesson_progress").insert({
        user_id: userId,
        lesson_id: lessonId,
        status: "completed",
      });
      if (error) throw error;
      return Response.json({ completed: true }, { status: 201 });
    }

    if (action === "create_draft") {
      const title = String(body.title ?? "").trim().slice(0, 140);
      const channel = String(body.channel ?? "");
      const sourceId = String(body.sourceId ?? "");
      if (!title || !allowedChannels.has(channel) || !allowedSourceIds.has(sourceId)) {
        return Response.json({ error: "Valid title, channel and official source are required" }, { status: 400 });
      }

      const source = officialSources.find((item) => item.id === sourceId)!;
      const excerpt = `${title}. Энэ ноорог нь “${source.title}” эх сурвалжид тулгуурласан. Нийтлэхийн өмнө claim бүрийг тусдаа хянагч шалгаж, компанийн approval reference-ийг админ бүртгэнэ.`;
      const { data: draft, error } = await supabase
        .from("content_drafts")
        .insert({ owner_id: userId, title, channel, source_id: sourceId, excerpt })
        .select("id,title,channel,source_id,status,excerpt,created_at")
        .single();
      if (error) throw error;
      return Response.json({ draft }, { status: 201 });
    }

    if (action === "submit_draft") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return Response.json({ error: "Valid draft required" }, { status: 400 });
      const { error } = await supabase.rpc("submit_content_draft", { p_id: id });
      if (error) transitionFailure(error);
      return Response.json({ ok: true });
    }

    if (action === "review_draft") {
      if (!["coach", "director", "admin"].includes(role)) throw new WorkspaceError(403, "Reviewer role required");
      const id = Number(body.id);
      const decision = String(body.decision ?? "");
      const note = String(body.note ?? "").trim().slice(0, 500);
      if (!Number.isInteger(id) || !["internal_approved", "return_to_draft"].includes(decision)) {
        return Response.json({ error: "Valid review decision required" }, { status: 400 });
      }
      const { error } = await supabase.rpc("review_content_draft", {
        p_id: id,
        p_decision: decision,
        p_note: note || null,
      });
      if (error) transitionFailure(error);
      return Response.json({ ok: true });
    }

    if (action === "record_corporate_approval") {
      if (role !== "admin") throw new WorkspaceError(403, "Admin role required");
      const id = Number(body.id);
      const evidenceRef = String(body.evidenceRef ?? "").trim().slice(0, 240);
      if (!Number.isInteger(id) || evidenceRef.length < 3) {
        return Response.json({ error: "Approval reference required" }, { status: 400 });
      }
      const { error } = await supabase.rpc("record_corporate_approval_reference", {
        p_id: id,
        p_evidence_ref: evidenceRef,
      });
      if (error) transitionFailure(error);
      return Response.json({ ok: true });
    }

    if (action === "archive_draft") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return Response.json({ error: "Valid draft required" }, { status: 400 });
      const { error } = await supabase.rpc("archive_content_draft", { p_id: id });
      if (error) transitionFailure(error);
      return Response.json({ ok: true });
    }

    if (action === "add_member_task") {
      const memberName = String(body.memberName ?? "").trim().slice(0, 80);
      const milestone = String(body.milestone ?? "72 цаг").trim().slice(0, 40);
      const nextAction = String(body.nextAction ?? "").trim().slice(0, 180);
      const dueLabel = String(body.dueLabel ?? "Өнөөдөр").trim().slice(0, 40);
      const risk = ["normal", "attention", "urgent"].includes(String(body.risk)) ? String(body.risk) : "normal";
      if (!memberName || !nextAction) {
        return Response.json({ error: "Member name and next action are required" }, { status: 400 });
      }
      const { data: task, error } = await supabase
        .from("member_tasks")
        .insert({ owner_id: userId, member_name: memberName, milestone, next_action: nextAction, due_label: dueLabel, risk })
        .select("id,member_name,milestone,next_action,due_label,risk,status")
        .single();
      if (error) throw error;
      return Response.json({ task }, { status: 201 });
    }

    if (action === "complete_member_task") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return Response.json({ error: "Valid task required" }, { status: 400 });
      const { data: task, error } = await supabase
        .from("member_tasks")
        .update({ status: "complete", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", userId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!task) throw new WorkspaceError(404, "Task not found");
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return serverError(error);
  }
}
