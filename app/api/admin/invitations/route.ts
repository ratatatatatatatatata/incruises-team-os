import { z } from "zod";
import { requestAuth } from "@/lib/supabase/request-auth";
import { bearerToken, isSameOrigin, RequestAuthError } from "@/lib/supabase/request-policy";
import { getSupabaseConfig } from "@/lib/supabase/config";


const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(["user", "builder", "coach", "director"]),
  sponsorUserId: z.string().uuid().nullable(),
  coachUserId: z.string().uuid().nullable(),
  teamName: z.string().trim().min(1).max(80),
}).strict();

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireAdmin(request: Request) {
  try {
    const context = await requestAuth(request);
    const { data, error } = await context.supabase.from("team_members").select("role,status").eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    return data?.status === "active" && data.role === "admin" ? context : null;
  } catch (error) {
    if (error instanceof RequestAuthError) return null;
    throw error;
  }
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return response({ error: "Admin role required" }, 403);
  const { supabase } = admin;
  const { data, error } = await supabase
    .from("member_invitations")
    .select("id,email,display_name,role,status,invited_at,expires_at,accepted_at,sponsor_user_id,coach_user_id,team_name")
    .order("invited_at", { ascending: false })
    .limit(50);
  if (error) return response({ error: "Урилгын жагсаалтыг уншиж чадсангүй." }, 503);
  return response({ invitations: data ?? [] });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return response({ error: "Хүсэлтийн эх үүсвэр зөвшөөрөгдөөгүй." }, 403);
  if (Number(request.headers.get("content-length") ?? "0") > 8_000) return response({ error: "Хүсэлт хэт том байна." }, 413);
  const admin = await requireAdmin(request);
  if (!admin) return response({ error: "Admin role required" }, 403);
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Нэр, имэйл болон эрхийг зөв оруулна уу." }, 400);

  const config = getSupabaseConfig();
  if (!config) return response({ error: "Supabase тохиргоо олдсонгүй." }, 503);
  const { supabase } = admin;
  const bearer = bearerToken(request.headers.get('authorization'));
  const accessToken = bearer ?? (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) return response({ error: "Нэвтрэх session дууссан байна." }, 401);

  const edgeResponse = await fetch(`${config.url}/functions/v1/invite-member`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: config.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  }).catch(() => null);
  if (!edgeResponse) return response({ error: "Урилгын service-тэй холбогдож чадсангүй." }, 503);
  const result = await edgeResponse.json().catch(() => ({ error: "Урилгын service буруу хариу өглөө." }));
  return response(result as Record<string, unknown>, edgeResponse.status);
}
