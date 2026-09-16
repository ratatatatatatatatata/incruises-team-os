import { z } from "zod";
import { getCurrentTeamOsUser } from "@/app/current-user";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(["user", "builder", "coach", "director"]),
}).strict();

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(forwardedHost && new URL(origin).host === forwardedHost);
}

async function requireAdmin() {
  const user = await getCurrentTeamOsUser();
  return user?.access === "active" && user.role === "admin" ? user : null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return response({ error: "Admin role required" }, 403);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_invitations")
    .select("id,email,display_name,role,status,invited_at,expires_at,accepted_at")
    .order("invited_at", { ascending: false })
    .limit(50);
  if (error) return response({ error: "Урилгын жагсаалтыг уншиж чадсангүй." }, 503);
  return response({ invitations: data ?? [] });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Хүсэлтийн эх үүсвэр зөвшөөрөгдөөгүй." }, 403);
  if (Number(request.headers.get("content-length") ?? "0") > 8_000) return response({ error: "Хүсэлт хэт том байна." }, 413);
  const admin = await requireAdmin();
  if (!admin) return response({ error: "Admin role required" }, 403);
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Нэр, имэйл болон эрхийг зөв оруулна уу." }, 400);

  const config = getSupabaseConfig();
  if (!config) return response({ error: "Supabase тохиргоо олдсонгүй." }, 503);
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
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
