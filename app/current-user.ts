import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type TeamOsUser = {
  userId: string;
  displayName: string;
  email: string;
  role: TeamRole | null;
  access: "active" | "disabled" | "pending";
};

export type TeamRole = "builder" | "coach" | "director" | "admin";

export async function getCurrentTeamOsUser(): Promise<TeamOsUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (error || !userId || !email) return null;

  const metadata = claims?.user_metadata;
  const fullName =
    metadata && typeof metadata === "object" && "full_name" in metadata && typeof metadata.full_name === "string"
      ? metadata.full_name
      : null;

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  const activeMembership = membership as { role: TeamRole; status: "active" | "disabled" } | null;
  const access = activeMembership?.status ?? "pending";
  let displayName = fullName ?? email;

  if (access === "active") {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.display_name) displayName = String(profile.display_name);
  }

  return {
    userId,
    email,
    displayName,
    role: activeMembership?.role ?? null,
    access,
  };
}
