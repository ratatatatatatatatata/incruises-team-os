import {
  assertSameOrigin,
  assessmentFailure,
  assessmentJson,
  loadAssessmentSnapshot,
  parseSaveAnswerInput,
  readAssessmentBody,
  requireAssessmentConsent,
  requireAssessmentContext,
  saveAssessmentAnswer,
} from "@/lib/assessment/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readAssessmentBody(request);
    const input = parseSaveAnswerInput(body);
    const context = await requireAssessmentContext();
    await requireAssessmentConsent(context);
    await saveAssessmentAnswer(context, input);
    const snapshot = await loadAssessmentSnapshot(context);
    return assessmentJson(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    return assessmentFailure(error);
  }
}
