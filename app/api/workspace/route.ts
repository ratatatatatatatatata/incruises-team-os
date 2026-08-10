import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { officialSources } from "../../team-os-data";

const allowedSourceIds = new Set<string>(officialSources.map((source) => source.id));
const allowedChannels = new Set(["Facebook", "Instagram", "Short video", "FAQ", "Message"]);
const allowedStatuses = new Set(["draft", "review", "approved", "archived"]);

type AuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

type LessonRow = { lesson_id: string; status: string; score: number | null };
type DraftRow = {
  id: number;
  title: string;
  channel: string;
  source_id: string;
  status: string;
  excerpt: string;
  created_at: string;
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

async function authorizedContext(): Promise<AuthContext | null> {
  if (!isSupabaseConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (error || !userId || !email) return null;

  const metadata = claims?.user_metadata as Record<string, unknown> | undefined;
  const displayName = typeof metadata?.full_name === "string" ? metadata.full_name : email;
  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      email,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  return { supabase, userId };
}

function serverError(error: unknown) {
  const notConfigured = error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED";
  return Response.json(
    { error: notConfigured ? "Supabase project is not configured" : "Workspace service unavailable" },
    { status: notConfigured ? 503 : 500 },
  );
}

export async function GET() {
  try {
    const context = await authorizedContext();
    if (!context) return Response.json({ error: "Sign in required" }, { status: 401 });

    const { supabase } = context;
    const [progressResult, draftsResult, tasksResult] = await Promise.all([
      supabase.from("lesson_progress").select("lesson_id,status,score").order("completed_at", { ascending: false }),
      supabase
        .from("content_drafts")
        .select("id,title,channel,source_id,status,excerpt,created_at")
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

    return Response.json({ progress, drafts, memberTasks });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizedContext();
    if (!context) return Response.json({ error: "Sign in required" }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const { supabase, userId } = context;

    if (action === "toggle_lesson") {
      const lessonId = String(body.lessonId ?? "").slice(0, 80);
      if (!lessonId) return Response.json({ error: "lessonId required" }, { status: 400 });

      const { data: existing, error: selectError } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (selectError) throw selectError;

      if (existing) {
        const { error } = await supabase.from("lesson_progress").delete().eq("lesson_id", lessonId);
        if (error) throw error;
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
        return Response.json({ error: "Valid title, channel and approved source are required" }, { status: 400 });
      }

      const source = officialSources.find((item) => item.id === sourceId)!;
      const excerpt = `${title}. Энэ ноорог нь “${source.title}” эх сурвалжид тулгуурласан. Нийтлэхийн өмнө үнэ, боломж, үр дүнгийн claim бүрийг хянагч батална.`;
      const { data: draft, error } = await supabase
        .from("content_drafts")
        .insert({ owner_id: userId, title, channel, source_id: sourceId, excerpt })
        .select("id,title,channel,source_id,status,excerpt,created_at")
        .single();
      if (error) throw error;
      return Response.json({ draft }, { status: 201 });
    }

    if (action === "set_draft_status") {
      const id = Number(body.id);
      const status = String(body.status ?? "");
      if (!Number.isInteger(id) || !allowedStatuses.has(status)) {
        return Response.json({ error: "Valid draft and status required" }, { status: 400 });
      }
      const { error } = await supabase
        .from("content_drafts")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
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
      const { error } = await supabase
        .from("member_tasks")
        .update({ status: "complete", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return serverError(error);
  }
}
