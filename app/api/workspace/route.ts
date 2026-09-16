import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { officialSources } from "../../team-os-data";
import type { SuccessMapPlan } from "@/lib/success-map/contracts";

const allowedSourceIds = new Set<string>(officialSources.map((source) => source.id));
const allowedChannels = new Set(["Facebook", "Instagram", "Short video", "FAQ", "Message"]);
const allowedLevelIds = new Set(["l0", "l1", "l2", "l3", "l5"]);

type TeamRole = "user" | "builder" | "coach" | "director" | "admin";

type AuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: TeamRole;
};

type LessonRow = { lesson_id: string; status: string; score: number | null };
type AcademyLessonRow = {
  id: string;
  level_id: string;
  title: string;
  lesson_type: string;
  minutes: number;
  content: string;
  sort_order: number;
  is_published: boolean;
};
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
type ProfileRow = { id: string; email: string; display_name: string; created_at: string };
type MembershipRow = { user_id: string; role: TeamRole; status: "active" | "disabled"; onboarding_required: boolean };
type RelationshipRow = {
  member_user_id: string;
  sponsor_user_id: string | null;
  coach_user_id: string | null;
  team_name: string;
};
type SuccessSummaryRow = {
  user_id: string;
  goal_30_day: string;
  weekly_capacity: string;
  primary_blocker: string;
  support_needs: string;
  today_action: string;
  updated_at: string;
};
type CheckinRow = {
  id: number;
  user_id: string;
  progress_summary: string;
  blocker: string;
  help_request: string;
  next_focus: string;
  progress_percent: number;
  needs_help: boolean;
  created_at: string;
};
type CoachNoteRow = {
  id: number;
  member_user_id: string;
  author_user_id: string;
  note: string;
  next_action: string;
  visible_to_member: boolean;
  created_at: string;
};
type SuccessMapRow = {
  current_context: string;
  goal_30_day: string;
  weekly_capacity: string;
  primary_blocker: string;
  growth_preferences: string;
  plan: SuccessMapPlan;
  plan_source: "deterministic" | "ai_gateway";
  ai_consent: boolean;
  completed_at: string;
  updated_at: string;
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
    const [
      progressResult,
      lessonsResult,
      draftsResult,
      tasksResult,
      successMapResult,
      profilesResult,
      membershipsResult,
      relationshipsResult,
      summariesResult,
      checkinsResult,
      coachNotesResult,
    ] = await Promise.all([
      supabase.from("lesson_progress").select("lesson_id,status,score").order("completed_at", { ascending: false }),
      supabase
        .from("academy_lessons")
        .select("id,level_id,title,lesson_type,minutes,content,sort_order,is_published")
        .order("level_id")
        .order("sort_order")
        .order("created_at"),
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
      supabase
        .from("member_success_maps")
        .select("current_context,goal_30_day,weekly_capacity,primary_blocker,growth_preferences,plan,plan_source,ai_consent,completed_at,updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("user_profiles").select("id,email,display_name,created_at").order("created_at", { ascending: false }),
      supabase.from("team_members").select("user_id,role,status,onboarding_required"),
      supabase.from("member_relationships").select("member_user_id,sponsor_user_id,coach_user_id,team_name"),
      supabase.from("member_success_summaries").select("user_id,goal_30_day,weekly_capacity,primary_blocker,support_needs,today_action,updated_at"),
      supabase.from("member_checkins").select("id,user_id,progress_summary,blocker,help_request,next_focus,progress_percent,needs_help,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("coach_notes").select("id,member_user_id,author_user_id,note,next_action,visible_to_member,created_at").order("created_at", { ascending: false }).limit(200),
    ]);

    const firstError = progressResult.error
      ?? lessonsResult.error
      ?? draftsResult.error
      ?? tasksResult.error
      ?? successMapResult.error
      ?? profilesResult.error
      ?? membershipsResult.error
      ?? relationshipsResult.error
      ?? summariesResult.error
      ?? checkinsResult.error
      ?? coachNotesResult.error;
    if (firstError) throw firstError;

    const progress = ((progressResult.data ?? []) as LessonRow[]).map((row) => ({
      lessonId: row.lesson_id,
      status: row.status,
      score: row.score,
    }));
    const lessons = ((lessonsResult.data ?? []) as AcademyLessonRow[]).map((row) => ({
      id: row.id,
      levelId: row.level_id,
      title: row.title,
      type: row.lesson_type,
      minutes: row.minutes,
      content: row.content,
      sortOrder: row.sort_order,
      isPublished: row.is_published,
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
    const successMapRow = successMapResult.data as SuccessMapRow | null;
    const successMap = successMapRow ? {
      answers: {
        currentContext: successMapRow.current_context,
        goal30Day: successMapRow.goal_30_day,
        weeklyCapacity: successMapRow.weekly_capacity,
        primaryBlocker: successMapRow.primary_blocker,
        growthPreferences: successMapRow.growth_preferences,
      },
      plan: successMapRow.plan,
      planSource: successMapRow.plan_source,
      aiConsent: successMapRow.ai_consent,
      completedAt: successMapRow.completed_at,
      updatedAt: successMapRow.updated_at,
    } : null;

    const profiles = (profilesResult.data ?? []) as ProfileRow[];
    const memberships = (membershipsResult.data ?? []) as MembershipRow[];
    const relationships = (relationshipsResult.data ?? []) as RelationshipRow[];
    const summaries = (summariesResult.data ?? []) as SuccessSummaryRow[];
    const checkins = (checkinsResult.data ?? []) as CheckinRow[];
    const coachNotesRows = (coachNotesResult.data ?? []) as CoachNoteRow[];
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const membershipsById = new Map(memberships.map((membership) => [membership.user_id, membership]));
    const relationshipsById = new Map(relationships.map((relationship) => [relationship.member_user_id, relationship]));
    const summariesById = new Map(summaries.map((summary) => [summary.user_id, summary]));
    const latestCheckinsById = new Map<string, CheckinRow>();
    for (const checkin of checkins) {
      if (!latestCheckinsById.has(checkin.user_id)) latestCheckinsById.set(checkin.user_id, checkin);
    }

    let users: Array<{
      id: string;
      email: string;
      displayName: string;
      role: TeamRole;
      status: "active" | "disabled";
      createdAt: string;
      sponsorUserId: string | null;
      coachUserId: string | null;
      teamName: string;
    }> = [];
    if (role === "admin") {
      users = profiles.flatMap((profile) => {
        const membership = membershipsById.get(profile.id);
        const relationship = relationshipsById.get(profile.id);
        return membership ? [{
          id: profile.id,
          email: profile.email,
          displayName: profile.display_name,
          role: membership.role,
          status: membership.status,
          createdAt: profile.created_at,
          sponsorUserId: relationship?.sponsor_user_id ?? null,
          coachUserId: relationship?.coach_user_id ?? null,
          teamName: relationship?.team_name ?? "inSuccess Team",
        }] : [];
      });
    }

    const supportMembers = memberships
      .filter((membership) => membership.user_id !== userId)
      .flatMap((membership) => {
        const profile = profilesById.get(membership.user_id);
        if (!profile) return [];
        const relationship = relationshipsById.get(membership.user_id);
        const summary = summariesById.get(membership.user_id);
        const latestCheckin = latestCheckinsById.get(membership.user_id);
        return [{
          id: membership.user_id,
          email: profile.email,
          displayName: profile.display_name,
          role: membership.role,
          teamName: relationship?.team_name ?? "inSuccess Team",
          sponsorName: relationship?.sponsor_user_id ? profilesById.get(relationship.sponsor_user_id)?.display_name ?? null : null,
          coachName: relationship?.coach_user_id ? profilesById.get(relationship.coach_user_id)?.display_name ?? null : null,
          onboardingRequired: membership.onboarding_required,
          summary: summary ? {
            goal30Day: summary.goal_30_day,
            weeklyCapacity: summary.weekly_capacity,
            primaryBlocker: summary.primary_blocker,
            supportNeeds: summary.support_needs,
            todayAction: summary.today_action,
            updatedAt: summary.updated_at,
          } : null,
          latestCheckin: latestCheckin ? {
            progressSummary: latestCheckin.progress_summary,
            blocker: latestCheckin.blocker,
            helpRequest: latestCheckin.help_request,
            nextFocus: latestCheckin.next_focus,
            progressPercent: latestCheckin.progress_percent,
            needsHelp: latestCheckin.needs_help,
            createdAt: latestCheckin.created_at,
          } : null,
        }];
      });

    const myCheckins = checkins.filter((checkin) => checkin.user_id === userId).map((checkin) => ({
      id: checkin.id,
      progressSummary: checkin.progress_summary,
      blocker: checkin.blocker,
      helpRequest: checkin.help_request,
      nextFocus: checkin.next_focus,
      progressPercent: checkin.progress_percent,
      needsHelp: checkin.needs_help,
      createdAt: checkin.created_at,
    }));

    const coachNotes = coachNotesRows.map((note) => ({
      id: note.id,
      memberUserId: note.member_user_id,
      authorUserId: note.author_user_id,
      authorName: profilesById.get(note.author_user_id)?.display_name ?? "Sponsor / Coach",
      note: note.note,
      nextAction: note.next_action,
      visibleToMember: note.visible_to_member,
      createdAt: note.created_at,
    }));

    return Response.json({
      viewer: {
        userId,
        role,
        canReview: ["coach", "director", "admin"].includes(role),
        canRecordCorporateApproval: role === "admin",
      },
      progress,
      lessons,
      drafts,
      memberTasks,
      users,
      supportMembers,
      myCheckins,
      coachNotes,
      successMap,
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

    if (action === "update_user") {
      if (role !== "admin") throw new WorkspaceError(403, "Admin role required");
      const targetUserId = String(body.userId ?? "");
      const nextRole = String(body.role ?? "");
      const status = String(body.status ?? "");
      const sponsorUserId = body.sponsorUserId ? String(body.sponsorUserId) : null;
      const coachUserId = body.coachUserId ? String(body.coachUserId) : null;
      const teamName = String(body.teamName ?? "inSuccess Team").replace(/\s+/g, " ").trim().slice(0, 80);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (
        !uuidPattern.test(targetUserId)
        || !["user", "builder", "coach", "director", "admin"].includes(nextRole)
        || !["active", "disabled"].includes(status)
        || (sponsorUserId !== null && !uuidPattern.test(sponsorUserId))
        || (coachUserId !== null && !uuidPattern.test(coachUserId))
        || sponsorUserId === targetUserId
        || coachUserId === targetUserId
        || !teamName
      ) {
        return Response.json({ error: "Хэрэглэгчийн эрхийн мэдээлэл буруу байна." }, { status: 400 });
      }
      if (targetUserId === userId && (nextRole !== "admin" || status !== "active")) {
        return Response.json({ error: "Өөрийн админ эрхийг идэвхгүй болгох боломжгүй." }, { status: 409 });
      }
      const relationshipIds = [...new Set([sponsorUserId, coachUserId].filter((value): value is string => Boolean(value)))];
      if (relationshipIds.length > 0) {
        const { data: assignedMembers, error: assignedError } = await supabase
          .from("team_members")
          .select("user_id,role,status")
          .in("user_id", relationshipIds);
        if (assignedError) throw assignedError;
        const assignedById = new Map((assignedMembers ?? []).map((member) => [member.user_id, member]));
        const sponsor = sponsorUserId ? assignedById.get(sponsorUserId) : null;
        const coach = coachUserId ? assignedById.get(coachUserId) : null;
        if (sponsorUserId && (!sponsor || sponsor.status !== "active" || !["builder", "coach", "director", "admin"].includes(sponsor.role))) {
          return Response.json({ error: "Идэвхтэй sponsor сонгоно уу." }, { status: 400 });
        }
        if (coachUserId && (!coach || coach.status !== "active" || !["coach", "director", "admin"].includes(coach.role))) {
          return Response.json({ error: "Coach эрхтэй идэвхтэй хэрэглэгч сонгоно уу." }, { status: 400 });
        }
      }

      const { data: updated, error } = await supabase
        .from("team_members")
        .update({ role: nextRole, status, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId)
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      if (!updated) throw new WorkspaceError(404, "Хэрэглэгч олдсонгүй.");

      const { data: existingRelationship, error: relationshipLookupError } = await supabase
        .from("member_relationships")
        .select("member_user_id")
        .eq("member_user_id", targetUserId)
        .maybeSingle();
      if (relationshipLookupError) throw relationshipLookupError;
      const relationshipWrite = existingRelationship
        ? supabase.from("member_relationships").update({
            sponsor_user_id: sponsorUserId,
            coach_user_id: coachUserId,
            team_name: teamName,
            updated_at: new Date().toISOString(),
          }).eq("member_user_id", targetUserId)
        : supabase.from("member_relationships").insert({
            member_user_id: targetUserId,
            sponsor_user_id: sponsorUserId,
            coach_user_id: coachUserId,
            team_name: teamName,
            created_by: userId,
          });
      const { error: relationshipError } = await relationshipWrite;
      if (relationshipError) throw relationshipError;
      return Response.json({ ok: true });
    }

    if (action === "weekly_checkin") {
      const progressSummary = String(body.progressSummary ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
      const blocker = String(body.blocker ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
      const helpRequest = String(body.helpRequest ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
      const nextFocus = String(body.nextFocus ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
      const progressPercent = Number(body.progressPercent);
      const needsHelp = body.needsHelp === true;
      if (progressSummary.length < 3 || nextFocus.length < 3 || !Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
        return Response.json({ error: "Явц, дараагийн зорилго болон хувийг зөв оруулна уу." }, { status: 400 });
      }
      const { data: checkin, error } = await supabase
        .from("member_checkins")
        .insert({
          user_id: userId,
          progress_summary: progressSummary,
          blocker,
          help_request: helpRequest,
          next_focus: nextFocus,
          progress_percent: progressPercent,
          needs_help: needsHelp,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ checkin }, { status: 201 });
    }

    if (action === "add_coach_note") {
      if (!["builder", "coach", "director", "admin"].includes(role)) throw new WorkspaceError(403, "Sponsor эсвэл coach эрх шаардлагатай.");
      const memberUserId = String(body.memberUserId ?? "");
      const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 1600);
      const nextAction = String(body.nextAction ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
      const visibleToMember = body.visibleToMember !== false;
      if (!/^[0-9a-f-]{36}$/i.test(memberUserId) || memberUserId === userId || note.length < 3) {
        return Response.json({ error: "Гишүүн болон зөвлөгөөний мэдээллийг зөв оруулна уу." }, { status: 400 });
      }
      const { data: coachNote, error } = await supabase
        .from("coach_notes")
        .insert({
          member_user_id: memberUserId,
          author_user_id: userId,
          note,
          next_action: nextAction,
          visible_to_member: visibleToMember,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ coachNote }, { status: 201 });
    }

    if (action === "toggle_lesson") {
      const lessonId = String(body.lessonId ?? "");
      const { data: lesson, error: lessonError } = await supabase
        .from("academy_lessons")
        .select("id")
        .eq("id", lessonId)
        .maybeSingle();
      if (lessonError) throw lessonError;
      if (!lesson) return Response.json({ error: "Хичээл олдсонгүй." }, { status: 404 });

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

    if (action === "create_lesson") {
      if (role !== "admin") throw new WorkspaceError(403, "Admin role required");
      const levelId = String(body.levelId ?? "");
      const title = String(body.title ?? "").trim().slice(0, 140);
      const lessonType = String(body.lessonType ?? "Хичээл").trim().slice(0, 40);
      const content = String(body.content ?? "").trim().slice(0, 12000);
      const minutes = Number(body.minutes);
      if (!allowedLevelIds.has(levelId) || !title || !lessonType || !content || !Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
        return Response.json({ error: "Хичээлийн мэдээллийг бүрэн, зөв оруулна уу." }, { status: 400 });
      }
      const id = `${levelId}-${crypto.randomUUID().slice(0, 8)}`;
      const { data: latest, error: latestError } = await supabase
        .from("academy_lessons")
        .select("sort_order")
        .eq("level_id", levelId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      const { data: created, error } = await supabase
        .from("academy_lessons")
        .insert({
          id,
          level_id: levelId,
          title,
          lesson_type: lessonType,
          minutes,
          content,
          sort_order: Number(latest?.sort_order ?? 0) + 10,
          is_published: true,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ lesson: created }, { status: 201 });
    }

    if (action === "update_lesson") {
      if (role !== "admin") throw new WorkspaceError(403, "Admin role required");
      const lessonId = String(body.lessonId ?? "");
      const title = String(body.title ?? "").trim().slice(0, 140);
      const lessonType = String(body.lessonType ?? "").trim().slice(0, 40);
      const content = String(body.content ?? "").trim().slice(0, 12000);
      const minutes = Number(body.minutes);
      const isPublished = body.isPublished === true;
      if (!lessonId || !title || !lessonType || !content || !Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
        return Response.json({ error: "Хичээлийн мэдээллийг бүрэн, зөв оруулна уу." }, { status: 400 });
      }
      const { data: updated, error } = await supabase
        .from("academy_lessons")
        .update({ title, lesson_type: lessonType, minutes, content, is_published: isPublished, updated_at: new Date().toISOString() })
        .eq("id", lessonId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated) throw new WorkspaceError(404, "Хичээл олдсонгүй.");
      return Response.json({ ok: true });
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
