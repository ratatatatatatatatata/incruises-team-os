# InSuccess AI CEO v1

Status: implementation candidate, disabled by default. This is an operational decision and learning loop for member progress, not an autonomous corporate officer.

## Purpose

Help InSuccess leadership turn onboarding into completed member actions and useful mentor support. The system observes aggregate evidence, prioritizes a bounded set of interventions, records an administrator's approval, measures the outcome, and reuses reviewed lessons in subsequent recommendations.

It does not determine compensation, financial commitments, access rights, external rank or employment outcomes. It cannot message members, modify the member planner, alter its own code/prompts/permissions, or deploy changes. An administrator approves an observation experiment; the named human owner implements the intervention through existing workflows.

## What runs

- `/ceo`: active administrators only; server page, API and database each enforce authorization.
- `/api/ceo`: reads current aggregates and history; analyzes, starts, measures, reviews and stops experiments.
- `/ceo/demo`: synthetic in-memory demonstration. Explicitly marked as a demo; no persistence, provider calls or real member data. The demo advances the observation period for illustration. Refresh resets it.
- New database objects only: `ceo_runs`, `ceo_experiments`, `ceo_events` and scoped RPCs.
- `CEO_ENABLED=true` activates the real UI/API. Omit it to leave them disabled.
- `CEO_DEMO_ENABLED=true` activates the demo outside Vercel production. It is always rejected when `VERCEL_ENV=production`.

## Evidence and learning

Every analysis reserves a durable run before calling AI, with a database-wide lock, a 60-second cooldown and a maximum of eight runs per UTC day. A failed AI call still consumes a reservation. There is no scheduler; analyses run on administrator request.

Snapshots are computed in one database transaction. Metrics cover active memberships, completed success maps, distinct members completing actions or submitting check-ins in the previous 14 days, open support, ordinary members without an active assigned coach, and actions created in that period. Active membership is not a claim of recent usage. Completed members are counted distinctly rather than dividing unrelated action totals. Superseded actions do not count as completed; future-dated completion/check-in records are excluded.

AI can only rank all eligible IDs from five predefined policies. It cannot emit new executable instructions or unverified factual prose. Unknown, duplicate, missing or ineligible IDs cause a deterministic fallback. The displayed action and evidence use fixed application text and the analysis snapshot. Suggestions are labeled as proposals, separately from database observations.

The Gateway payload is an explicit allowlist: aggregate metrics, fixed policy descriptions, and reviewed policy/verdict/delta tuples. Raw member answers, names, emails, notes, IDs and cohort hashes are excluded. Under five active members, the provider is skipped. Zero-data-retention and no-training routing constraints are preserved.

A baseline is captured again when an administrator starts an experiment. One experiment may run at a time. After at least 14 days, the database captures the outcome. Learning requires at least ten active memberships and the same cohort fingerprint, including member IDs and roles, at baseline and outcome. Roles matter because changing a member to a staff role changes mentor-assignment eligibility.

Changes are reported in percentage points of active members. A decrease in unassigned members counts in the desired direction. Cohort change or a small sample produces an inconclusive result. A human may accept an eligible positive result or reject a measured result with a reason. Stopping preserves the baseline and event history, and excludes the experiment from learning.

The last 50 eligible, reviewed outcomes feed subsequent ranking. The rule fallback gives an accepted policy +1 and a rejected policy -1; the AI receives those same reviewed observations. This is application-level learning from reviewed feedback, **not model-weight training, causal inference or demonstrated business improvement**. Simultaneous outside changes can still confound results. Ten members is a conservative engineering gate, not a statistical significance test.

## Gateway reuse: observed on 2026-10-08

The existing Vercel project and OIDC credential were reused; no new API key was created. The full official model catalog contained the existing model `openai/gpt-5.6-luna` with structured-output support. A synthetic request reached Gateway and returned HTTP 403, `no_providers_available`, stating that the free tier cannot use this model and paid credits are required. No successful model generation was observed.

The application handles this with a visible fallback. The existing Starter Success Map integration was left unchanged. Credential values must remain in ignored environment files or the deployment provider, never source control. Locally pulled OIDC tokens expire; refresh through the linked project's normal Vercel environment flow when needed.

## Verification

- TypeScript, scoped ESLint and Next.js production build: passed.
- Existing source tests plus eight CEO domain tests: 95 passed.
- New SQL migration executed in isolated PGlite PostgreSQL with minimal existing-table fixtures: access control, aggregate semantics, reservation limits, lifecycle, immutable finished reports, learning feedback and stopping checks passed. See the delivery evidence for the final assertion count.
- Browser verification: blocked by browser security policy verification, including on localhost. No browser bypass or replacement UI automation was used. Visual layout, hydration, button interactions and mobile layout remain unverified.
- No live Supabase migration, authenticated preview flow or production rollout was performed.

Run regular checks from the repository:

```sh
pnpm exec next build --webpack
pnpm run test:source
pnpm exec eslint app/ceo app/api/ceo lib/ceo
```

For the isolated database test, install `@electric-sql/pglite` in a temporary directory, then set `CEO_PGLITE_MODULE` to that installation's `dist/index.js` and run `node tests/ceo-database.mjs`. This test uses synthetic fixtures and requires no Supabase credentials.

## Activation sequence

1. Review the draft PR and additive migration.
2. Apply the migration to a suitable development database, with no production data copied into test artifacts.
3. Bind a private preview to that database; enable `CEO_ENABLED`. Test active-admin, ordinary-member, disabled-member and anonymous accounts through the actual login flow.
4. Resolve the existing Gateway model entitlement/credit blocker and make a successful synthetic request. Do not silently change model or purchase credits.
5. Verify the browser flows and mobile layout, plus persisted events and reviewed learning. The demo alone is not acceptance evidence.
6. After explicit production release authorization, deploy the migration/application and enable the feature. Verify the custom domain and provider status. If issues appear, disable the CEO feature flag while preserving all experiment history.

Model catalog: https://ai-gateway.vercel.sh/v1/models
OIDC documentation: https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc
