import { notFound, redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "@/app/current-user";
import { isCeoAdmin } from "@/lib/ceo/access";
import { CeoDashboard } from "./ceo-dashboard";
export const dynamic = "force-dynamic";
export const metadata = { title: "InSuccess · AI CEO" };
export default async function CeoPage() {
  if (process.env.CEO_ENABLED !== "true") notFound();
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login");
  if (!isCeoAdmin(user)) redirect("/");
  return <CeoDashboard demo={false} />;
}
