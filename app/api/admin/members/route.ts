import {
  AdminAccessError,
  createPrivilegedAdminClient,
  requireActiveAdmin,
  type MembershipStatus,
  type TeamRole,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const roles = new Set<TeamRole>(["builder", "coach", "director", "admin"]);
const statuses = new Set<MembershipStatus>(["pending", "active", "disabled"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AdminRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
    },
  });
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AdminRequestError(403, "invalid_origin", "Хүсэлтийн origin зөвшөөрөгдсөнгүй.");
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!contentType.includes("application/json") || contentLength > 8_192) {
    throw new AdminRequestError(400, "invalid_request", "JSON хүсэлт шаардлагатай.");
  }

  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new AdminRequestError(400, "invalid_json", "Хүсэлтийн JSON буруу байна.");
  }
}

function safeEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminRequestError(400, "invalid_email", "Хүчинтэй имэйл оруулна уу.");
  }
  return email;
}

function safeUserId(value: unknown): string {
  const userId = String(value ?? "");
  if (!uuidPattern.test(userId)) {
    throw new AdminRequestError(400, "invalid_user", "Хүчинтэй хэрэглэгч сонгоно уу.");
  }
  return userId;
}

function databaseFailure(error: { code?: string }): never {
  if (error.code === "42501") {
    throw new AdminRequestError(403, "membership_guard", "Өөрийн эрхийг хаах эсвэл сүүлийн админыг устгах боломжгүй.");
  }
  if (error.code === "P0002") {
    throw new AdminRequestError(404, "member_not_found", "Хэрэглэгч эсвэл membership олдсонгүй.");
  }
  if (error.code === "23505") {
    throw new AdminRequestError(409, "membership_exists", "Энэ хэрэглэгчийн membership аль хэдийн бүртгэлтэй байна.");
  }
  if (error.code === "22023") {
    throw new AdminRequestError(400, "invalid_membership", "Role эсвэл access төлөв буруу байна.");
  }
  throw error;
}

function requestFailure(error: unknown) {
  if (error instanceof AdminAccessError || error instanceof AdminRequestError) {
    return json({ error: error.message, code: error.code }, error.status);
  }

  console.error("Admin membership request failed");
  return json({ error: "Admin service түр ажиллахгүй байна.", code: "admin_service_unavailable" }, 500);
}

export async function GET(request: Request) {
  try {
    const authorization = await requireActiveAdmin();
    const adminClient = createPrivilegedAdminClient(authorization);
    const url = new URL(request.url);
    const page = boundedInteger(url.searchParams.get("page"), 1, 1, 10_000);
    const perPage = boundedInteger(url.searchParams.get("perPage"), 50, 10, 100);

    const { data: authPage, error: authError } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (authError) throw authError;

    const userIds = authPage.users.map((user) => user.id);
    let memberships: Array<{
      user_id: string;
      role: TeamRole;
      status: MembershipStatus;
      created_at: string;
      updated_at: string;
    }> = [];

    if (userIds.length > 0) {
      const { data, error } = await adminClient
        .from("team_members")
        .select("user_id,role,status,created_at,updated_at")
        .in("user_id", userIds);
      if (error) throw error;
      memberships = (data ?? []) as typeof memberships;
    }

    const membershipByUser = new Map(memberships.map((membership) => [membership.user_id, membership]));
    const users = authPage.users.map((user) => {
      const membership = membershipByUser.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        invitedAt: user.invited_at ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: user.created_at,
        membership: membership
          ? {
              role: membership.role,
              status: membership.status,
              createdAt: membership.created_at,
              updatedAt: membership.updated_at,
            }
          : null,
      };
    });

    return json({
      actorId: authorization.actorId,
      users,
      pagination: {
        page,
        perPage,
        total: Math.max(authPage.total ?? 0, (page - 1) * perPage + users.length),
        lastPage: Math.max(authPage.lastPage ?? 0, page),
        nextPage: authPage.nextPage ?? null,
      },
    });
  } catch (error) {
    return requestFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readBody(request);
    const action = String(body.action ?? "");
    const authorization = await requireActiveAdmin();

    if (action === "invite") {
      const email = safeEmail(body.email);
      const adminClient = createPrivilegedAdminClient(authorization);
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);

      if (error || !data.user) {
        throw new AdminRequestError(
          409,
          "invite_failed",
          "Урилга илгээж чадсангүй. Хэрэглэгч өмнө нь бүртгэлтэй эсэх болон Auth email тохиргоог шалгана уу.",
        );
      }

      const { error: membershipError } = await authorization.sessionClient.rpc("admin_register_invited_member", {
        p_user_id: data.user.id,
      });
      if (membershipError) {
        return json(
          {
            error: "Урилга үүссэн байж болно, харин onboarding хүлээж буй membership бүртгэгдсэнгүй. Migration-ийг шалгаад жагсаалтыг дахин ачаална уу.",
            code: "membership_registration_failed",
            userId: data.user.id,
          },
          409,
        );
      }

      return json(
        {
          ok: true,
          user: { id: data.user.id, email: data.user.email ?? email },
          membership: { role: "builder", status: "pending" },
        },
        201,
      );
    }

    if (action === "register_membership") {
      const userId = safeUserId(body.userId);
      const { error } = await authorization.sessionClient.rpc("admin_register_invited_member", {
        p_user_id: userId,
      });
      if (error) databaseFailure(error);
      return json({ ok: true, membership: { role: "builder", status: "pending" } }, 201);
    }

    if (action === "update_membership") {
      const userId = safeUserId(body.userId);
      const role = String(body.role ?? "") as TeamRole;
      const status = String(body.status ?? "") as MembershipStatus;
      if (!roles.has(role) || !statuses.has(status)) {
        throw new AdminRequestError(400, "invalid_membership", "Role эсвэл access төлөв буруу байна.");
      }

      const { error } = await authorization.sessionClient.rpc("admin_update_team_member", {
        p_user_id: userId,
        p_role: role,
        p_status: status,
      });
      if (error) databaseFailure(error);
      return json({ ok: true, membership: { role, status } });
    }

    throw new AdminRequestError(400, "unknown_action", "Танигдаагүй admin үйлдэл байна.");
  } catch (error) {
    return requestFailure(error);
  }
}
