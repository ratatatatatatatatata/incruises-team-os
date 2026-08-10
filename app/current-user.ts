import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type TeamOsUser = {
  userId: string;
  displayName: string;
  email: string;
};

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

  return {
    userId,
    email,
    displayName: fullName ?? email,
  };
}
