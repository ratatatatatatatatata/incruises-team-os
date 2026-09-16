import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ROLES = new Set(["user", "builder", "coach", "director"]);
const SPONSOR_ROLES = new Set(["builder", "coach", "director", "admin"]);
const COACH_ROLES = new Set(["coach", "director", "admin"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 8_000) return json({ error: "Request too large" }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Service configuration unavailable" }, 503);

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: membership, error: membershipError } = await adminClient
    .from("team_members")
    .select("role,status")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (membershipError) return json({ error: "Membership check unavailable" }, 503);
  if (!membership || membership.status !== "active" || membership.role !== "admin") {
    return json({ error: "Admin role required" }, 403);
  }

  const rawBody = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = String(rawBody?.email ?? "").trim().toLowerCase();
  const displayName = String(rawBody?.displayName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const role = String(rawBody?.role ?? "user");
  const sponsorUserId = rawBody?.sponsorUserId ? String(rawBody.sponsorUserId) : userData.user.id;
  const coachUserId = rawBody?.coachUserId ? String(rawBody.coachUserId) : null;
  const teamName = String(rawBody?.teamName ?? "inSuccess Team").replace(/\s+/g, " ").trim().slice(0, 80);
  if (
    !EMAIL_PATTERN.test(email)
    || email.length > 320
    || !displayName
    || !ALLOWED_ROLES.has(role)
    || !UUID_PATTERN.test(sponsorUserId)
    || (coachUserId !== null && !UUID_PATTERN.test(coachUserId))
    || !teamName
  ) {
    return json({ error: "Урилгын мэдээлэл буруу байна." }, 400);
  }

  const relationshipIds = [...new Set([sponsorUserId, coachUserId].filter((value): value is string => Boolean(value)))];
  const { data: relationshipMembers, error: relationshipError } = await adminClient
    .from("team_members")
    .select("user_id,role,status")
    .in("user_id", relationshipIds);
  if (relationshipError) return json({ error: "Sponsor болон coach эрхийг шалгаж чадсангүй." }, 503);
  const relationshipById = new Map((relationshipMembers ?? []).map((member) => [member.user_id, member]));
  const sponsor = relationshipById.get(sponsorUserId);
  const coach = coachUserId ? relationshipById.get(coachUserId) : null;
  if (!sponsor || sponsor.status !== "active" || !SPONSOR_ROLES.has(sponsor.role)) {
    return json({ error: "Идэвхтэй sponsor сонгоно уу." }, 400);
  }
  if (coachUserId && (!coach || coach.status !== "active" || !COACH_ROLES.has(coach.role))) {
    return json({ error: "Coach эрхтэй идэвхтэй хэрэглэгч сонгоно уу." }, 400);
  }

  const { data: existingMember } = await adminClient
    .from("user_profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingMember) return json({ error: "Энэ имэйл аль хэдийн бүртгэлтэй байна." }, 409);

  const { data: existingInvitation, error: existingInvitationError } = await adminClient
    .from("member_invitations")
    .select("id,status,auth_user_id")
    .eq("email", email)
    .maybeSingle();
  if (existingInvitationError) return json({ error: "Урилгын бүртгэлийг шалгаж чадсангүй." }, 503);
  if (existingInvitation && existingInvitation.status !== "failed") {
    return json({ error: "Энэ имэйлд урилга аль хэдийн үүссэн байна." }, 409);
  }

  const invitationPayload = {
    email,
    display_name: displayName,
    role,
    sponsor_user_id: sponsorUserId,
    coach_user_id: coachUserId,
    team_name: teamName,
    status: "pending",
    invited_by: userData.user.id,
    invited_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    auth_user_id: null,
    provisioned_at: null,
    accepted_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const invitationResult = existingInvitation
    ? await adminClient.from("member_invitations").update(invitationPayload).eq("id", existingInvitation.id).select("id").single()
    : await adminClient.from("member_invitations").insert(invitationPayload).select("id").single();
  if (invitationResult.error || !invitationResult.data) return json({ error: "Урилгыг бүртгэж чадсангүй." }, 503);

  const appOrigin = (Deno.env.get("APP_ORIGIN") ?? "https://www.insuccess.net").replace(/\/$/, "");
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appOrigin}/auth/confirm?next=/onboarding`,
    data: { full_name: displayName },
  });

  if (inviteError || !inviteData.user) {
    await adminClient
      .from("member_invitations")
      .update({ status: "failed", last_error: "Invite provider rejected the request", updated_at: new Date().toISOString() })
      .eq("id", invitationResult.data.id);
    return json({ error: "Имэйл урилгыг илгээж чадсангүй. SMTP болон Auth тохиргоог шалгана уу." }, 502);
  }

  // The auth.users trigger normally moves pending -> provisioned immediately.
  // This conditional update avoids overwriting that stronger state.
  await adminClient
    .from("member_invitations")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", invitationResult.data.id)
    .eq("status", "pending");

  return json({ ok: true, invitationId: invitationResult.data.id }, 201);
});
