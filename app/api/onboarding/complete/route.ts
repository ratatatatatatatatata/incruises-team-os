import {
  assertSameOrigin,
  assessmentFailure,
  assessmentJson,
  completeAssessment,
  loadAssessmentSnapshot,
  parseCompletionSessionId,
  readAssessmentBody,
  requireAssessmentConsent,
  requireAssessmentContext,
} from "@/lib/assessment/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readAssessmentBody(request);
    const sessionId = parseCompletionSessionId(body);
    const context = await requireAssessmentContext();
    await requireAssessmentConsent(context);
    await completeAssessment(context, sessionId);
    const snapshot = await loadAssessmentSnapshot(context);
    return assessmentJson(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    return assessmentFailure(error);
  }
}
