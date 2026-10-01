# iOS candidate — Expo patch alignment

This is an additive checkpoint after `mobile-release-2026-10-01.md`, not release approval.

## Confirmed

- Signed EAS build `86e1305d-6be5-4274-beab-077022ef9d95` finished for source `bf1e9914fedbeb7e5c3e6a20a16542b460a41de2`, version 1.0.1 (8), bundle `com.insuccess.teamos`.
- The exact-build identity validator passed. Existing remote signing/submission credentials were reused; no credential was created or revoked.
- EAS submission `b55556ba-5d42-4f8c-b04d-1e59e942f196` succeeded. App Store Connect lists 1.0.1 (8) as upload **Complete**, build **Ready to Submit**. This is not App Review submission or public availability.
- Cloud `expo doctor` reported 20/21 checks: 14 Expo SDK 57 packages were behind its recommended patch versions. The build itself succeeded. Those packages are aligned in this follow-up commit; build 8 does **not** contain these changes.
- Both verification and future release workflows now run pinned `expo-doctor@1.20.4` before packaging. Existing QA approval and exact-build identity gates remain in place.

## Local verification of this patch

- Dependency install and the query-string compatibility patch applied successfully; npm audit: zero known vulnerabilities.
- Mobile TypeScript, opaque release icon and router compatibility checks passed.
- All 99 source/unit tests passed.
- iOS prebuild and Hermes export with synthetic public configuration passed. They are not physical-device or authenticated API evidence.
- `expo-doctor@1.20.4`: dependency compatibility now passes; total 20/21 locally because this Mac has no usable CocoaPods installation. Do not report the full local doctor run as passed. Upstream doctor checks CocoaPods on macOS when a generated Podfile exists; GitHub Linux CI and EAS macOS have separate tooling.

## Remaining release gates

All gates in the original candidate document remain, including two independent preview API sessions, native device acceptance, supported account-deletion initiation and owner-approved policy, accurate privacy disclosures, review contact/demo credentials, screenshots, and explicitly accepted web/native scope. The new bearer backend remains on the draft PR, not production. Do not send build 8 to App Review or claim full native parity. The final accepted source must be rebuilt and its exact new build validated before submission.

No production database, membership, RLS, environment or credential change is part of this patch. Main is not merged by this checkpoint.
