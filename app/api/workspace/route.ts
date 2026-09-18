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
  support_request_id: string | null;
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
  support_summary_consent?: boolean;
  completed_at: string;
  updated_at: string;
};
type MemberActionRow = {
  id: string;
  member_user_id: string;
  title: string;
  detail: string;
  done_when: string;
  minutes: number;
  capacity_minutes: number;
  status: "proposed" | "accepted" | "started" | "done" | "blocked" | "paused" | "superseded";
  blocked_reason: string;
  resource_lesson_id: string | null;
  sequence_no: number;
  updated_at: string;
};
type SupportRequestRow = {
  id: string;
  member_user_id: string;
  action_id: string;
  assigned_to: string | null;
  request_type: string;
  request_text: string;
  status: string;
  resolution_note: string;
  outcome_helpful: boolean | null;
  next_check_at: string | null;
  created_at: string;
  updated_at: string;
};
type AcademyPracticeRow = {
  id: string;
  member_user_id: string;
  action_id: string;
  lesson_id: string;
  prompt: string;
  submission: string;
  status: string;
  reviewer_user_id: string | null;
  feedback: string;
  updated_at: string;
};
type RankClaimRow = {
  id: string;
  member_user_id: string;
  claimed_label: string;
  source_kind: string;
  evidence_reference: string;
  status: string;
  created_at: string;
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
  if (error.code === "P0002") throw new WorkspaceError(404, "Хүссэн бүртгэл олдсонгүй.");
  if (error.code === "22023") throw new WorkspaceError(409, "Одоогийн төлөв энэ шилжилтийг зөвшөөрөхгүй байна.");
  throw error;
}

function serverError(error: unknown) {
  if (error instanceof WorkspaceError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("Workspace request failed", error);
  return Response.json({ error: "Workspace service unavailable" }, { status: 500 });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(forwardedHost && new URL(origin).host === forwardedHost);
}

export async function GET() {
  try {
    const { supabase, userId, role } = await authorizedContext();
    const first30DayEnabled = process.env.FIRST_30_DAY_LOOP_ENABLED === "true";
    const successMapSelect = first30DayEnabled
      ? "current_context,goal_30_day,weekly_capacity,primary_blocker,growth_preferences,plan,plan_source,ai_consent,support_summary_consent,completed_at,updated_at"
      : "current_context,goal_30_day,weekly_capacity,primary_blocker,growth_preferences,plan,plan_source,ai_consent,completed_at,updated_at";
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
        .select(successMapSelect)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("user_profiles").select("id,email,display_name,created_at").order("created_at", { ascending: false }),
      supabase.from("team_members").select("user_id,role,status,onboarding_required"),
      supabase.from("member_relationships").select("member_user_id,sponsor_user_id,coach_user_id,team_name"),
      supabase.from("member_success_summaries").select("user_id,goal_30_day,weekly_capacity,primary_blocker,support_needs,today_action,updated_at"),
      supabase.from("member_checkins").select("id,user_id,progress_summary,blocker,help_request,next_focus,progress_percent,needs_help,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("coach_notes").select(first30DayEnabled
        ? "id,member_user_id,author_user_id,note,next_action,visible_to_member,support_request_id,created_at"
        : "id,member_user_id,author_user_id,note,next_action,visible_to_member,created_at").order("created_at", { ascending: false }).limit(200),
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

    let actionRows: MemberActionRow[] = [];
    let supportRequestRows: SupportRequestRow[] = [];
    let academyPracticeRows: AcademyPracticeRow[] = [];
    let rankClaimRows: RankClaimRow[] = [];
    if (first30DayEnabled) {
      const [actionsResult, supportRequestsResult, academyPracticesResult, rankClaimsResult] = await Promise.all([
        supabase
          .from("member_actions")
          .select("id,member_user_id,title,detail,done_when,minutes,capacity_minutes,status,blocked_reason,resource_lesson_id,sequence_no,updated_at")
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase
          .from("support_requests")
          .select("id,member_user_id,action_id,assigned_to,request_type,request_text,status,resolution_note,outcome_helpful,next_check_at,created_at,updated_at")
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase
          .from("member_academy_practices")
          .select("id,member_user_id,action_id,lesson_id,prompt,submission,status,reviewer_user_id,feedback,updated_at")
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase
          .from("external_rank_claims")
          .select("id,member_user_id,claimed_label,source_kind,evidence_reference,status,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      const featureError = actionsResult.error
        ?? supportRequestsResult.error
        ?? academyPracticesResult.error
        ?? rankClaimsResult.error;
      if (featureError) throw featureError;
      actionRows = (actionsResult.data ?? []) as MemberActionRow[];
      supportRequestRows = (supportRequestsResult.data ?? []) as SupportRequestRow[];
      academyPracticeRows = (academyPracticesResult.data ?? []) as AcademyPracticeRow[];
      rankClaimRows = (rankClaimsResult.data ?? []) as RankClaimRow[];
    }

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
      supportSummaryConsent: successMapRow.support_summary_consent ?? true,
      completedAt: successMapRow.completed_at,
      updatedAt: successMapRow.updated_at,
    } : null;

    const profiles = (profilesResult.data ?? []) as ProfileRow[];
    const memberships = (membershipsResult.data ?? []) as MembershipRow[];
    const relationships = (relationshipsResult.data ?? []) as RelationshipRow[];
    const summaries = (summariesResult.data ?? []) as SuccessSummaryRow[];
    const checkins = (checkinsResult.data ?? []) as CheckinRow[];
    // The selected columns are feature-flagged so older production schemas stay readable.
    // Supabase's compile-time select parser cannot represent that runtime union.
    const coachNotesRows = (coachNotesResult.data ?? []) as unknown as CoachNoteRow[];
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const membershipsById = new Map(memberships.map((membership) => [membership.user_id, membership]));
    const relationshipsById = new Map(relationships.map((relationship) => [relationship.member_user_id, relationship]));
    const summariesById = new Map(summaries.map((summary) => [summary.user_id, summary]));
    const latestCheckinsById = new Map<string, CheckinRow>();
    for (const checkin of checkins) {
      if (!latestCheckinsById.has(checkin.user_id)) latestCheckinsById.set(checkin.user_id, checkin);
    }
    const activeActionsByMember = new Map<string, MemberActionRow>();
    const completedActionCountByMember = new Map<string, number>();
    for (const actionRow of actionRows) {
      if (!["done", "superseded"].includes(actionRow.status) && !activeActionsByMember.has(actionRow.member_user_id)) {
        activeActionsByMember.set(actionRow.member_user_id, actionRow);
      }
      if (actionRow.status === "done") {
        completedActionCountByMember.set(actionRow.member_user_id, (completedActionCountByMember.get(actionRow.member_user_id) ?? 0) + 1);
      }
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
        const currentAction = activeActionsByMember.get(membership.user_id);
        const completedActionCount = completedActionCountByMember.get(membership.user_id) ?? 0;
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
            todayAction: currentAction?.title ?? (completedActionCount >= 3 ? "Эхний алхмууд дууссан · check-in хүлээж байна" : summary.today_action),
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

    const ownActions = actionRows.filter((action) => action.member_user_id === userId);
    const activeActionRow = ownActions.find((action) => !["done", "superseded"].includes(action.status)) ?? null;
    const activeAction = activeActionRow ? {
      id: activeActionRow.id,
      title: activeActionRow.title,
      detail: activeActionRow.detail,
      doneWhen: activeActionRow.done_when,
      minutes: activeActionRow.minutes,
      capacityMinutes: activeActionRow.capacity_minutes,
      status: activeActionRow.status,
      blockedReason: activeActionRow.blocked_reason,
      resourceLessonId: activeActionRow.resource_lesson_id,
      sequenceNo: activeActionRow.sequence_no,
      updatedAt: activeActionRow.updated_at,
    } : null;
    const myActionHistory = ownActions.filter((action) => action.id !== activeActionRow?.id).map((action) => ({
      id: action.id,
      title: action.title,
      status: action.status,
      minutes: action.minutes,
      sequenceNo: action.sequence_no,
      updatedAt: action.updated_at,
    }));
    const supportRequests = supportRequestRows.map((request) => ({
      id: request.id,
      memberUserId: request.member_user_id,
      actionId: request.action_id,
      assignedTo: request.assigned_to,
      requestType: request.request_type,
      requestText: request.request_text,
      status: request.status,
      resolutionNote: request.resolution_note,
      outcomeHelpful: request.outcome_helpful,
      nextCheckAt: request.next_check_at,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    }));
    const academyPractices = academyPracticeRows.map((practice) => ({
      id: practice.id,
      memberUserId: practice.member_user_id,
      actionId: practice.action_id,
      lessonId: practice.lesson_id,
      prompt: practice.prompt,
      submission: practice.submission,
      status: practice.status,
      reviewerUserId: practice.reviewer_user_id,
      feedback: practice.feedback,
      updatedAt: practice.updated_at,
    }));
    const rankClaims = rankClaimRows.map((claim) => ({
      id: claim.id,
      memberUserId: claim.member_user_id,
      claimedLabel: claim.claimed_label,
      sourceKind: claim.source_kind,
      evidenceReference: claim.evidence_reference,
      status: claim.status,
      createdAt: claim.created_at,
    }));

    return Response.json({
      first30DayEnabled,
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
      activeAction,
      myActionHistory,
      supportRequests,
      academyPractices,
      rankClaims,
      successMap,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Хүсэлтийн эх үүсвэр зөвшөөрөгдөөгүй." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32_000) {
    return Response.json({ error: "Хүсэлтийн хэмжээ хэтэрсэн байна." }, { status: 413 });
  }

  try {
    const { supabase, userId, role } = await authorizedContext();
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const first30DayEnabled = process.env.FIRST_30_DAY_LOOP_ENABLED === "true";
    const featureActions = new Set([
      "transition_member_action",
      "change_member_action_time",
      "advance_support_request",
      "confirm_support_request",
      "submit_academy_practice",
      "review_academy_practice",
      "record_rank_claim",
    ]);
    if (featureActions.has(action) && !first30DayEnabled) {
      return Response.json({ error: "Эхний 30 хоногийн шинэ урсгал одоогоор идэвхжээгүй байна." }, { status: 503 });
    }

    if (action === "transition_member_action") {
      const actionId = String(body.actionId ?? "");
      const nextStatus = String(body.nextStatus ?? "");
      const blockedReason = String(body.blockedReason ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
      const requestType = body.requestType ? String(body.requestType) : null;
      const requestText = String(body.requestText ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(actionId) || !["accepted", "started", "done", "blocked", "paused", "superseded"].includes(nextStatus)) {
        return Response.json({ error: "Ажлын төлөв буруу байна." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("transition_my_member_action", {
        p_action_id: actionId,
        p_next_status: nextStatus,
        p_blocked_reason: blockedReason,
        p_request_type: requestType,
        p_request_text: requestText,
      });
      if (error) transitionFailure(error);
      return Response.json({ action: data });
    }

    if (action === "change_member_action_time") {
      const actionId = String(body.actionId ?? "");
      const minutes = Number(body.minutes);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(actionId) || !Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
        return Response.json({ error: "Хугацааг зөв оруулна уу." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("change_my_member_action_time", {
        p_action_id: actionId,
        p_minutes: minutes,
      });
      if (error) transitionFailure(error);
      return Response.json({ action: data });
    }

    if (action === "advance_support_request") {
      const supportRequestId = String(body.supportRequestId ?? "");
      const nextStatus = String(body.nextStatus ?? "");
      const resolutionNote = String(body.resolutionNote ?? "").replace(/\s+/g, " ").trim().slice(0, 1600);
      const nextCheckAt = body.nextCheckAt ? String(body.nextCheckAt) : null;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(supportRequestId) || !["acknowledged", "in_progress", "resolved"].includes(nextStatus)) {
        return Response.json({ error: "Тусламжийн төлөв буруу байна." }, { status: 400 });
      }
      const parsedNextCheck = nextCheckAt ? new Date(nextCheckAt) : null;
      if (parsedNextCheck && Number.isNaN(parsedNextCheck.getTime())) {
        return Response.json({ error: "Дараагийн шалгах хугацаа буруу байна." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("advance_assigned_support_request", {
        p_support_request_id: supportRequestId,
        p_next_status: nextStatus,
        p_resolution_note: resolutionNote,
        p_next_check_at: parsedNextCheck?.toISOString() ?? null,
      });
      if (error) transitionFailure(error);
      return Response.json({ supportRequest: data });
    }

    if (action === "confirm_support_request") {
      const supportRequestId = String(body.supportRequestId ?? "");
      const helpful = body.helpful;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(supportRequestId) || typeof helpful !== "boolean") {
        return Response.json({ error: "Тусламжийн үр дүнг зөв сонгоно уу." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("confirm_my_support_request", {
        p_support_request_id: supportRequestId,
        p_helpful: helpful,
      });
      if (error) transitionFailure(error);
      return Response.json({ supportRequest: data });
    }

    if (action === "submit_academy_practice") {
      const practiceId = String(body.practiceId ?? "");
      const submission = String(body.submission ?? "").trim().slice(0, 2400);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(practiceId) || submission.length < 10) {
        return Response.json({ error: "Дадлагын үр дүнг 10-аас дээш тэмдэгтээр бичнэ үү." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("submit_my_academy_practice", {
        p_practice_id: practiceId,
        p_submission: submission,
      });
      if (error) transitionFailure(error);
      return Response.json({ practice: data });
    }

    if (action === "review_academy_practice") {
      const practiceId = String(body.practiceId ?? "");
      const feedback = String(body.feedback ?? "").trim().slice(0, 1600);
      const competencyLabel = body.competencyLabel ? String(body.competencyLabel).trim().slice(0, 160) : null;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(practiceId) || feedback.length < 3) {
        return Response.json({ error: "Дадлагын feedback-ийг зөв оруулна уу." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("review_assigned_academy_practice", {
        p_practice_id: practiceId,
        p_feedback: feedback,
        p_competency_label: competencyLabel,
      });
      if (error) transitionFailure(error);
      return Response.json({ practice: data });
    }

    if (action === "record_rank_claim") {
      if (role !== "admin") throw new WorkspaceError(403, "Admin role required");
      const memberUserId = String(body.memberUserId ?? "");
      const claimedLabel = String(body.claimedLabel ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const sourceKind = String(body.sourceKind ?? "");
      const evidenceReference = String(body.evidenceReference ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (
        !uuidPattern.test(memberUserId)
        || claimedLabel.length < 2
        || evidenceReference.length < 3
        || !["official_back_office", "official_document", "other_official"].includes(sourceKind)
      ) {
        return Response.json({ error: "Rank баримтын мэдээллийг зөв оруулна уу." }, { status: 400 });
      }
      const { data: member, error: memberError } = await supabase
        .from("team_members")
        .select("user_id,status")
        .eq("user_id", memberUserId)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member || member.status !== "active") return Response.json({ error: "Идэвхтэй гишүүн сонгоно уу." }, { status: 400 });
      const { data, error } = await supabase
        .from("external_rank_claims")
        .insert({
          member_user_id: memberUserId,
          claimed_label: claimedLabel,
          source_kind: sourceKind,
          evidence_reference: evidenceReference,
          status: "pending",
          submitted_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ rankClaim: data }, { status: 201 });
    }

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
      const supportRequestId = body.supportRequestId ? String(body.supportRequestId) : null;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(memberUserId) || memberUserId === userId || note.length < 3 || (supportRequestId !== null && !uuidPattern.test(supportRequestId))) {
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
          ...(first30DayEnabled && supportRequestId ? { support_request_id: supportRequestId } : {}),
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
