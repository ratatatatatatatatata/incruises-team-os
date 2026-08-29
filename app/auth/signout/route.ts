import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.headers.set("Clear-Site-Data", '"cache"');
  response.headers.set("Cache-Control", "no-store");
  return response;
}
