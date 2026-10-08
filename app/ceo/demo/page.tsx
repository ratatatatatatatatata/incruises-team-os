import { notFound } from "next/navigation";
import { CeoDashboard } from "../ceo-dashboard";
export const dynamic = "force-dynamic";
export default function CeoDemo() {
  if (process.env.CEO_DEMO_ENABLED !== "true" || process.env.VERCEL_ENV === "production") notFound();
  return <CeoDashboard demo />;
}
