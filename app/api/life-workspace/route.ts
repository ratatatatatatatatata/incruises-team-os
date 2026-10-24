import { requestAuth } from "@/lib/supabase/request-auth";
import { isSameOrigin, RequestAuthError } from "@/lib/supabase/request-policy";
import { lifeSchema } from "@/lib/life/domain";
import { z } from "zod";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const input = z
  .object({ revision: z.number().int().nonnegative(), state: lifeSchema })
  .strict();
class LifeAccessError extends Error {}
async function context(request: Request) {
  const auth = await requestAuth(request);
  const { data, error } = await auth.supabase
    .from("team_members")
    .select("status")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.status !== "active")
    throw new LifeAccessError("Идэвхтэй гишүүний эрх шаардлагатай.");
  return auth;
}
function failure(error: unknown) {
  if (error instanceof LifeAccessError)
    return Response.json({ error: error.message }, { status: 403, headers });
  if (error instanceof RequestAuthError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers },
    );
  return Response.json(
    {
      error:
        "Хувийн төлөвлөгөөний хадгалалт бэлэн болоогүй байна. Бичсэнээ хуулж аваад дахин оролдоорой.",
    },
    { status: 503, headers },
  );
}
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await context(request);
    const { data, error } = await supabase
      .from("personal_life_workspaces")
      .select("state,revision")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return Response.json({ workspace: data }, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return Response.json(
      { error: "Энэ сайтаас хадгална уу." },
      { status: 403, headers },
    );
  try {
    const { supabase, userId } = await context(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 200_000)
      return Response.json(
        { error: "Төлөвлөгөөний хэмжээ хэтэрсэн байна." },
        { status: 413, headers },
      );
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: "Хүсэлтийн бүтэц буруу байна." },
        { status: 400, headers },
      );
    }
    const parsed = input.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Утгуудаа шалгана уу." },
        { status: 400, headers },
      );
    const { state, revision } = parsed.data;
    // The trigger takes a version snapshot in the same transaction. No service key or shared coaching table.
    const result =
      revision === 0
        ? await supabase
            .from("personal_life_workspaces")
            .insert({ user_id: userId, state, revision: 1 })
            .select("revision")
            .single()
        : await supabase
            .from("personal_life_workspaces")
            .update({ state, revision: revision + 1 })
            .eq("user_id", userId)
            .eq("revision", revision)
            .select("revision")
            .maybeSingle();
    if (result.error?.code === "23505" || (!result.error && !result.data))
      return Response.json(
        {
          error:
            "Өөр таб эсвэл төхөөрөмжөөс шинэчлэгдсэн байна. Бичсэнээ хуулж аваад хуудсаа дахин нээгээрэй.",
        },
        { status: 409, headers },
      );
    if (result.error) throw result.error;
    return Response.json({ revision: result.data!.revision }, { headers });
  } catch (error) {
    return failure(error);
  }
}
