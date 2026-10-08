# InSuccess AI CEO v1

Status: implementation candidate; enabled on the isolated CEO preview branch, disabled in production. This is an operational decision and learning loop for member progress, not an autonomous corporate officer.

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

The existing Vercel project and OIDC credential were reused; no new API key was created. The initial `openai/gpt-5.6-luna` request returned HTTP 403 because that model is unavailable on the team's free-credit tier. The balance API confirmed $5 of unused credits, so a credit purchase was not necessary to resolve this feature's model access.

The CEO model is now `openai/gpt-5.2`, selected after the user requested the strongest suitable option within the existing free-credit tier. Both GPT-5 mini and GPT-5.2 were marked free-tier eligible in the current Vercel catalog and succeeded with this project's OIDC credential. GPT-5.2 is the capability-focused choice among those verified alternatives; no InSuccess quality benchmark or universal best-model claim is implied. The initial GPT-4.1 mini recovery test remains historical evidence, not the current model configuration.

The GPT-5.2 structured connection probe succeeded through OpenAI with zero-data-retention and no-training routing, costing $0.0006335 for that small synthetic request. The actual `createCeoReport` source then passed synthetic tests with both zero and 50 reviewed learning records: valid complete policy rankings, `source: ai_gateway`, `model: openai/gpt-5.2`, and no fallback. Observed durations were 6.3 and 13.7 seconds, not latency guarantees. Medium reasoning uses a 1,024-token output cap, including reasoning tokens, within the existing 20-second request timeout and eight-runs-per-day database limit.

Free-tier access consumes the team's shared $5 monthly allowance; it is not unlimited zero-price inference or a guarantee of eight requests every day for a month. No credits were purchased and no billing settings were changed. If the Gateway rejects a request because credits are exhausted or access changes, the existing rule fallback remains visible; application code never buys credits. Pricing and tier eligibility can change: https://vercel.com/docs/ai-gateway/pricing.

The existing Starter Success Map integration remains unchanged. The visible rule fallback remains available for outages or exhausted entitlements. Credential values stay in ignored environment files or the deployment provider. Locally pulled OIDC tokens expire; refresh through the linked project's normal Vercel environment flow when needed.

## Verification

- TypeScript, scoped ESLint and Next.js production build: passed.
- Existing source tests plus eight CEO domain tests: 95 passed.
- New SQL migration executed in isolated PGlite PostgreSQL with minimal existing-table fixtures: access control, aggregate semantics, reservation limits, lifecycle, immutable finished reports, learning feedback and stopping checks passed. See the delivery evidence for the final assertion count.
- Browser verification: blocked by browser security policy verification, including on localhost. No browser bypass or replacement UI automation was used. Visual layout, hydration, button interactions and mobile layout remain unverified.
- The additive migration was applied to the existing development Supabase branch. Its security advisor returned no lints. On that real schema, a rolled-back transaction verified member denial, admin snapshot/run/report/start, early measurement denial, stopping, and event history. This is database-role verification, not a browser login test.
- Preview environment values are scoped only to `codex/insuccess-ai-ceo-v1` and reference the development database. No production migration, environment change or rollout was performed.
- Browser login, authenticated application API integration, visual layout and mobile interaction remain pending.

Run regular checks from the repository:

```sh
pnpm exec next build --webpack
pnpm run test:source
pnpm exec eslint app/ceo app/api/ceo lib/ceo
```

For the isolated database test, install `@electric-sql/pglite` in a temporary directory, then set `CEO_PGLITE_MODULE` to that installation's `dist/index.js` and run `node tests/ceo-database.mjs`. This test uses synthetic fixtures and requires no Supabase credentials.

## Activation sequence

1. Review the draft PR and additive migration.
2. Development migration is applied; preserve isolation and existing test data.
3. The CEO preview is bound to that development database with `CEO_ENABLED`. Test active-admin, ordinary-member, disabled-member and anonymous accounts through the actual login flow.
4. Gateway entitlement is resolved using the verified free-credit-compatible model. Continue to monitor balance and entitlement; do not silently purchase credits.
5. Verify the browser flows and mobile layout, plus persisted events and reviewed learning. The demo alone is not acceptance evidence.
6. After explicit production release authorization, deploy the migration/application and enable the feature. Verify the custom domain and provider status. If issues appear, disable the CEO feature flag while preserving all experiment history.

Model catalog: https://ai-gateway.vercel.sh/v1/models
OIDC documentation: https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc
