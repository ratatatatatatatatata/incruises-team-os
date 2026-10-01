# iOS parity candidate — 2026-10-01

Status: **implementation candidate, not production-ready or submitted**.
Baseline: main `f6c70827e81c98e2dc54ed532eec33474611f2c0`.

## What changed

- Replaced the active September mobile route with native Mongolian screens for invite-only PIN/legacy login, five-question clarification, the canonical current action, progress-based continuation, Academy practice/feedback, and relationship-scoped team support.
- Kept the old route under `src/legacy/` for comparison; it is not an Expo Router route. No public signup is exposed by the new route.
- Reused web `/api/workspace` and `/api/success-map`, plan contracts, Mongolian presentation, and clarification rules. No new planner, rank policy, RLS policy, service-role client, or migration.
- Added verified bearer authentication alongside existing browser cookies. Invalid bearer credentials never fall back to cookies. Every query still uses the member JWT and existing active-membership checks/RLS. Browser same-origin checks remain.
- New native sign-ins use chunked SecureStore. Previous SQLite session data is not removed or migrated, and no server session is revoked by this release work. Existing users may need to sign in again once.
- Kept the corrupt original icon unchanged. Added an opaque 1024px PNG rendered from the existing committed web favicon.
- Added icon/prebuild/bundle/dependency checks. Submission is manually gated and uses the exact successful build ID/SHA/project/bundle/version, never `--latest`.
- Patched `brace-expansion` to 5.0.12, `decode-uri-component` to 0.5.0 and xcode's `uuid` to 11.1.1. Kept Expo Router's query-string 7 API via a one-line CJS/default-export compatibility patch; query-string 9 is deliberately not used.

## Locally confirmed

- Web lint, TypeScript and Next production build passed.
- Mobile TypeScript and iOS prebuild passed.
- iOS JavaScript/Hermes bundle export passed using explicitly synthetic config. This is **not** a signed IPA or an authenticated integration test.
- 99 source/unit tests passed, including bearer/cookie isolation, malformed credential/origin handling, SecureStore Unicode/partial writes, current-action presentation, support-state transitions and release build identity.
- Mobile npm audit reported zero findings after patches. This is dependency-scan evidence, not a claim that the whole app is secure.
- Browser-rendered native login page loaded with no recorded error/warning; PIN, legacy mode, recovery and privacy controls rendered. No account credentials were entered.
- Login was also visually checked at a 390×844 browser viewport; PIN/legacy mode toggled correctly. This is not a physical iPhone test.
- Existing preview branch `kzgnvsqysdbdbazchdte` remains ACTIVE_HEALTHY with the mentor migration present, despite historical MIGRATIONS_FAILED branch metadata. The existing transactional mentor runtime matrix passed all 19 checks today; transaction rolled back and remaining synthetic users were confirmed zero. This is direct-RPC evidence, not two live API sessions.

## Must pass before merge/release

1. Preview backend: member and sponsor sessions with independent JWTs. Confirm active/disabled membership, other-team denial, self-review denial, non-assignee and NULL-assignee denial, consent=false, malformed/expired JWT and stale-cookie coexistence.
2. Real writes only in an approved isolated preview dataset: onboarding clarification, 5-minute capacity, third Done, progress continuation, negative-help reopen/deadline, delayed practice feedback, scheduling, network interruption/double-submit and refresh.
3. Native device: secure-session restore/logout, PIN numeric keyboard and legacy password, invite/recovery browser return, large text, keyboard avoidance, long Mongolian text, iPhone/iPad layouts, offline recovery and background refresh. Browser rendering is not a substitute.
4. Compare all intended web features with this candidate. Native admin invitations, role/team editing, full content-review/admin lesson editing and rank-claim submission are not yet ported; the additional-web-management link explicitly opens a separate web sign-in. Do not describe this candidate as complete native parity.
5. Review initial AI fallback visibility, consent changes on an existing plan, support next-check editing, and all account/privacy flows before final acceptance.
6. Resolve account-deletion initiation requirements and actual retention policy with the owner. The existing generic support page alone is not proof of App Store compliance. Do not run any deletion as release testing.
7. Expo CLI authorization, production EAS public configuration, signing and existing App Store Connect submission credentials must be verified without printing values. Never create/revoke keys without exact approval.
8. Build a signed IPA from the accepted commit, upload that exact build to TestFlight, then verify Apple processing. App Store review is a separate step.
9. Refresh actual iPhone/iPad screenshots, current-feature description, review contact fields and a dedicated least-privileged demo account. Do not give Apple a real member/admin account or invent credentials/contact details.
10. Verify privacy declarations/AI processing disclosure, support URL, release territories/EU trader decision and release mode. No legal declaration is implied by technical deployment approval.

## Recovery

The remote base commit remains unchanged by this branch. Old icon and mobile source are preserved. No database change or production environment change is part of this candidate. Before a future web deployment, record the then-current production deployment ID as the rollback target; do not reuse a stale report's deployment ID. Do not replace/revoke Apple/Expo credentials or delete old builds.
