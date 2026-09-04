import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "../redirects.mjs";

const SUPPORTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function redirectWithoutAuthArtifacts(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const requestedType = searchParams.get("type");
  const type = requestedType && SUPPORTED_EMAIL_OTP_TYPES.has(requestedType as EmailOtpType)
    ? requestedType as EmailOtpType
    : null;
  const requestedNext = safeNextPath(searchParams.get("next"), request.nextUrl.origin);
  const next = type === "recovery"
    ? "/auth/set-password?flow=recovery"
    : type === "invite"
      ? "/auth/set-password"
      : requestedNext;

  if (code || (tokenHash && type)) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });
    if (!error) return redirectWithoutAuthArtifacts(new URL(next, request.url));
  }

  return redirectWithoutAuthArtifacts(
    new URL("/login?error=Баталгаажуулах холбоос хүчингүй эсвэл хугацаа дууссан байна.", request.url),
  );
}
