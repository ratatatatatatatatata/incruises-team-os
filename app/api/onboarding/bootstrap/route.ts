import {
  assessmentFailure,
  assessmentJson,
  loadAssessmentSnapshot,
  requireAssessmentConsent,
  requireAssessmentContext,
} from "@/lib/assessment/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const context = await requireAssessmentContext();
    await requireAssessmentConsent(context);
    const snapshot = await loadAssessmentSnapshot(context, { createIfMissing: true });
    return assessmentJson(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    return assessmentFailure(error);
  }
}
