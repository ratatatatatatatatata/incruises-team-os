import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import { createClient as createSessionClient } from "./server";

export type TeamRole = "builder" | "coach" | "director" | "admin";
export type MembershipStatus = "pending" | "active" | "disabled";

export class AdminAccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ActiveAdminAuthorization = {
  actorId: string;
  sessionClient: Awaited<ReturnType<typeof createSessionClient>>;
  verified: true;
};

function getSecretKey(): string | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  return secretKey?.trim() || null;
}

export function isSupabaseAdminConfigured(): boolean {
  return getSupabaseConfig() !== null && getSecretKey() !== null;
}

/**
 * Verifies the request's signed Supabase session and server-authoritative
 * membership before any elevated client may be constructed.
 */
export async function requireActiveAdmin(): Promise<ActiveAdminAuthorization> {
  if (!getSupabaseConfig()) {
    throw new AdminAccessError(503, "supabase_not_configured", "Supabase project тохируулаагүй байна.");
  }

  const sessionClient = await createSessionClient();
  const { data, error } = await sessionClient.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const actorId = typeof claims?.sub === "string" ? claims.sub : null;

  if (error || !actorId) {
    throw new AdminAccessError(401, "sign_in_required", "Нэвтрэх шаардлагатай.");
  }

  const { data: membership, error: membershipError } = await sessionClient
    .from("team_members")
    .select("role,status")
    .eq("user_id", actorId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  const member = membership as { role: TeamRole; status: MembershipStatus } | null;
  if (!member || member.status !== "active" || member.role !== "admin") {
    throw new AdminAccessError(403, "active_admin_required", "Идэвхтэй admin эрх шаардлагатай.");
  }

  return { actorId, sessionClient, verified: true };
}

/**
 * Constructs an elevated Supabase client only after an active admin has been
 * verified for the current request. Never import this module into client code.
 */
export function createPrivilegedAdminClient(authorization: ActiveAdminAuthorization) {
  if (!authorization.verified) {
    throw new AdminAccessError(403, "active_admin_required", "Идэвхтэй admin эрх шаардлагатай.");
  }

  const config = getSupabaseConfig();
  const secretKey = getSecretKey();
  if (!config || !secretKey) {
    throw new AdminAccessError(
      503,
      "admin_secret_missing",
      "Server-only SUPABASE_SECRET_KEY тохируулаагүй байна.",
    );
  }

  return createSupabaseClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
