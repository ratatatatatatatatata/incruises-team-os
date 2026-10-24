# Personal planning assistant

The assistant helps a member choose and start work already present in their personal workspace. It also supports weekly reflection, measurable goals, habits, manifestation linked to action, and personal style. It does not provide general unrestricted chat.

## Language and grounding

The reply renderer uses authored Mongolian text and quoted workspace facts. It prioritizes today's planned work, distinguishes overdue, future, completed and paused tasks, and separates allocated task time from capacity for new work. Follow-up turns retain the selected task, available minutes and obstacle. A new topic clears unrelated context. Unknown questions ask for clarification.

Suggestions never mutate the workspace. Progress summaries describe recorded outcomes rather than verified real-world achievements. Proposed measures and habit anchors are clearly marked as unsaved. Dreams are linked to controllable actions without promising results.

## Optional local AI

Members can explicitly load Qwen3 4B through WebLLM in a worker on a WebGPU-capable device. The model classifies intent, the referenced task and the obstacle using constrained JSON. It does not write user-facing prose, invent task records, call tools or save changes. Only complete schema-valid decisions with candidate task IDs are accepted. Explicit user intent, typed time limits and application boundaries take precedence. A failed or timed-out inference returns the local guide; stopping the worker prevents stale responses from changing the conversation.

The default guide requires no model download. The optional model needs substantial memory, bandwidth and battery. Its semantic interpretation can still be wrong; the UI identifies which path answered. The conversation stays in component memory and is lost on reload.

## Cost and privacy contract

- No hosted generation service, API key, payment card or metered AI endpoint is used by this assistant.
- Only model assets are downloaded from the configured model hosts. Conversation and workspace context are processed locally.
- Model context contains a bounded set of planned task titles and dates, the goal, a small conversation memory and the last two user questions. It excludes recorded outcomes, review prose and account identifiers.
- This removes provider AI usage charges for this implementation. It does not remove ordinary site hosting, storage, network or device costs.
- The legacy starter-plan enhancement is also blocked by a server-side cost policy, even if a member previously consented and gateway or platform OIDC credentials exist. Existing credentials and historical consent records are retained; the form explains that the guide is used instead.

## Verification

`tests/personal-coach.test.mjs` covers multi-turn context, task selection, time and week boundaries, completed/paused work, clarification, goal/habit follow-ups, recorded outcomes, manifestation, style, bounded structured decisions, model fallback boundaries and the no-paid-API contract. Browser acceptance also requires an actual local model load and semantic follow-up conversation, not just mocked model output.
