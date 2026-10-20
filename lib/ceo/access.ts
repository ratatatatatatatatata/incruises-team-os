export function isCeoAdmin(member: { role: string | null; access: string } | null) {
  return member?.access === "active" && member.role === "admin";
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
