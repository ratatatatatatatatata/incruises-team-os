# inSuccess Team OS

Монгол хэл дээрх хувийн Success Map, digital mentor, багийн сургалт, контентын хяналт, гишүүний дараагийн алхам болон албан эх сурвалжийг нэгтгэсэн private web platform. Системийн брэнд нэр нь **inSuccess**.

> Энэ нь багийн дотоод сургалтын хэрэгсэл бөгөөд inCruises-ийн албан ёсны бүтээгдэхүүн биш. Үнэ, урамшуулал, аялал болон бодлогын мэдээллийг нийтлэхийн өмнө албан эх сурвалжаар баталгаажуулна.

## Архитектур

- **Frontend/API:** Next.js 16 App Router
- **Web hosting:** Vercel
- **Database:** Supabase Postgres
- **Authentication:** Supabase Auth SSR cookie
- **Authorization:** Postgres Row Level Security (RLS)
- **CI/CD:** GitHub Actions verification + Vercel Git deployment

Cloudflare Worker, Vinext болон D1 runtime ашиглахгүй.

Одоогийн live (энэ personal AI release хараахан биш): <https://incruises-team-os.vercel.app>

## Үндсэн боломжууд

- 15 baseline асуултаар зорилго, одоогийн үе, боломжит цаг, тухтай суваг, гол саадыг тодруулна
- AI нь 15 baseline хариултад тулгуурлан 10 dimension бүрд 8 scale + 2 богино reflection, нийт яг 100 custom асуултын immutable snapshot үүсгэнэ; AI unavailable эсвэл output validation унавал 300-item versioned bank-аас deterministic fallback ашиглана
- 15 + 100 хариултын дараа Success Profile, 7 хоног болон 30/60/90 хоногийн хувийн guide гаргана
- Board Director хэсэг нь хангалттай self-report evidence үед боломжит хөгжлийн зам хэлбэрээр нээгдэнэ; rank/орлого амлахгүй
- Хувийн AI mentor: энгийн, алхамчилсан, хурдан горим; conversation history ба memory opt-out; автоматаар нийтлэхгүй
- Raw assessment, profile, guide нь onboarding үед pending/active owner-д, assistant history нь зөвхөн active owner-д харагдана; disabled хэрэглэгчийн уншилтыг RLS хаана
- Удирдлагын хяналтын төв
- Video Academy: course → module → lesson catalog, Mux public/signed playback, resume position ба 90%-ийн completion tracker
- Content Studio: draft → тусдаа reviewer → internal review → company approval reference workflow
- Member Success даалгаврын самбар
- Албан эх сурвалжийн Source Vault
- Invite-only Supabase email/password authentication
- Active team membership, role separation, least-privilege RLS policies
- Mobile-friendly PWA

## Локал ажиллуулах

Шаардлага: Node.js 22.13+, pnpm 11.16.

Production build нь энэ repository-д давтагдан баталгаажсан webpack горимыг ашиглана; development нь Next.js-ийн default dev bundler-ийг ашиглана.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm run dev
```

`.env.local` файлд Supabase Dashboard → Connect хэсгээс авсан утгыг оруулна:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_SUPPORT_EMAIL=support@your-domain.example
NEXT_PUBLIC_LEGAL_ENTITY_NAME=Your legal entity name
PASSWORD_RESET_ORIGIN=https://your-app.example.com
SUPABASE_SECRET_KEY=your_server_only_secret_key
AI_GATEWAY_API_KEY=your_local_ai_gateway_key
INSUCCESS_AI_MODEL=openai/gpt-5.6-luna
INSUCCESS_ASSESSMENT_MODEL=openai/gpt-5.6-luna
MUX_SIGNING_KEY_ID=your_mux_signing_key_id
MUX_SIGNING_PRIVATE_KEY=your_mux_signing_private_key
```

Publishable key, support email болон legal entity name нь frontend/public legal хуудсанд харагдах зориулалттай. Хүснэгт бүр RLS-ээр хамгаалагдсан. `SUPABASE_SECRET_KEY` болон `AI_GATEWAY_API_KEY` нь зөвхөн server environment-д байна; frontend, log, artifact болон repository-д хэзээ ч хадгалахгүй. Vercel Preview/Production дээр AI Gateway OIDC ашиглаж болох тул `AI_GATEWAY_API_KEY` заавал биш.

Personal profile/guide дамжуулах AI хүсэлт бүр `zeroDataRetention: true` шаардана. Иймээс functional preview/production нь request-level ZDR дэмждэг Vercel Pro/Enterprise төлөвлөгөөтэй байх ёстой; дэмжихгүй орчинд assistant AI руу өгөгдөл явуулахын оронд app-ийн safe guided fallback-г харуулна.

## Supabase database

Schema, membership, RLS болон content review workflow:

```text
supabase/migrations/20260810000000_team_os.sql
supabase/migrations/20260829062550_harden_membership_access.sql
supabase/migrations/20260829062600_enforce_content_review_workflow.sql
supabase/migrations/20260829063013_finalize_content_write_lockdown.sql
supabase/migrations/20260830033918_admin_membership_operations.sql
supabase/migrations/20260830033919_reconcile_learning_and_sources.sql
supabase/migrations/20260831135000_member_privacy_preferences.sql
supabase/migrations/20260831135600_pending_assessment_membership.sql
supabase/migrations/20260831135704_onboarding_assessment.sql
supabase/migrations/20260831140034_ai_assistant_persistence.sql
supabase/migrations/20260906101838_ai_tailored_assessment_v2.sql
supabase/migrations/20260906103524_account_deletion_requests.sql
supabase/migrations/20260906110000_video_academy_foundation.sql
supabase/migrations/20260906120000_launch_schema_contract.sql
```

### Video Academy

- Гишүүний catalog: `/academy`; тусдаа хичээл: `/academy/[lessonId]`
- Catalog удирдлага: `/admin/academy` — course, module, lesson-ийг draft-аар үүсгэж, бэлэн Mux playback ID холбон, publish/archive төлөв удирдана
- Admin flow нь файл upload хийхгүй, Mux account/assets-д mutation хийхгүй, catalog item устгахгүй
- Public playback ID нь signing key-гүй ажиллана, гэхдээ URL мэдсэн хүн видеог app-аас гадуур үзэх боломжтой. Member-only сургалтад `signed` policy ашиглана
- Signed playback-д `MUX_SIGNING_KEY_ID` болон `MUX_SIGNING_PRIVATE_KEY` хоёул server-only орчинд шаардлагатай. Private key нь Mux-ээс авсан base64 PEM эсвэл PEM хэлбэртэй байж болно
- Native HLS дэмждэг browser дээр үзсэн байрлал ойролцоогоор 15 секунд тутам, pause/ended үед хадгалагдана. Native HLS ажиллахгүй browser Mux iframe руу шилжинэ; iframe event автоматаар уншихгүй тул хэрэглэгч completion-оо гараар тэмдэглэж болно
- CSP нь `player.mux.com`, Mux media/image/connect source-ийг тусгайлан зөвшөөрсөн; wildcard script source эсвэл video upload domain нэмээгүй

`20260906110000_video_academy_foundation.sql` нь зөвхөн forward migration. Энэ repository update migration-ийг live Supabase project-д ажиллуулаагүй, Mux-д видео upload хийгээгүй. Эхний 100 GB видеог Mux талд тусад нь ingest/encode хийж, бэлэн playback ID-уудыг admin catalog-д холбоно; video binary нь Supabase database-д хадгалагдахгүй.

Шинэ эсвэл migration history нь repository-тэй яг таарсан isolated орчинд Supabase CLI-гаар migration ажиллуулна:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Одоогийн live Supabase project-ийн migration history энэ repository-ийн бүтэн chain-тэй таарахгүй. Тиймээс live project руу дээрх `db push` командыг шууд ажиллуулахгүй. Эхлээд тусдаа staging branch/database дээр remote history-г reconcile хийж, бүх migration болон pgTAP suite-ийг ажиллуулан, backup/rollback төлөвлөгөөтэй reviewed production migration гаргана. Final `20260906120000_launch_schema_contract.sql` нь шаардлагатай table/RPC бүр байгааг шалгаж байж exact release contract үүсгэнэ.

Supabase Auth → URL Configuration хэсэгт дараах redirect URL-уудыг зөвшөөрнө:

```text
http://localhost:3000/auth/confirm
https://incruises-team-os.vercel.app/auth/confirm
```

Production launch-аас өмнө hosted Supabase дээр email confirmation-ийг идэвхжүүлж баталгаажуулна. Supabase-ийн built-in email service нь default confirmation template ашиглана. Custom SMTP холбосны дараа SSR confirmation route ашиглах бол template холбоосыг дараах хэлбэрээр тохируулна:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Invite template-ийн холбоос (`inviteUserByEmail`-д өгсөн callback URL-г ашиглана):

```text
{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite
```

Password recovery template-ийн холбоос:

```text
{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery
```

Default Supabase recovery template ашиглаж байгаа үед `/auth/confirm` route нь PKCE `code` callback-ийг мөн дэмжинэ. Production/custom domain дээр `PASSWORD_RESET_ORIGIN`-ийг server-only environment variable болгон тохируулж, тухайн origin-ийн `/auth/confirm` URL-ийг Supabase Auth redirect allowlist-д нэмнэ. Callback origin нь `PASSWORD_RESET_ORIGIN` → stable `VERCEL_PROJECT_PRODUCTION_URL` → deployment-specific `VERCEL_URL` дарааллаар сонгогдоно.

Auth launch checklist:

- Vercel Production дээр `PASSWORD_RESET_ORIGIN`-ийг path/query-гүй canonical HTTPS origin-оор тохируулсан.
- Supabase Auth → URL Configuration дахь Site URL нь canonical production origin бөгөөд Redirect URLs жагсаалтад яг тэр origin-ийн `/auth/confirm` байна.
- Invite болон recovery template дээр дээрх `{{ .RedirectTo }}` холбоосуудыг хадгалсан; email tracking link rewrite-ийг унтраасан.
- Public email sign-up болон ашигладаггүй provider-ууд OFF; leaked-password protection, secure password change болон abuse хамгаалалт ON.
- Custom SMTP sender/domain баталгаажсан; staging invite болон recovery холбоосыг өөр browser/device дээр нээж password тохируулан шалгасан.
- `/auth/set-password?flow=recovery`-г session-гүй нээхэд encoded error бүхий redirect өгч, HTTP 500 гаргахгүйг smoke test-ээр баталгаажуулсан.

Hosted Supabase Auth дээр public email sign-up болон ашигладаггүй provider-уудыг OFF, leaked-password protection болон secure password change-ийг ON болгоно. Repository дахь `enable_signup = false`, `secure_password_change = true` нь local parity; hosted setting-үүдийг Dashboard/Management API дээр тусад нь баталгаажуулна. Password recovery form-ийн abuse хамгаалалтад hosted CAPTCHA эсвэл Vercel WAF rate limit-ийг production launch-аас өмнө баталгаажуулна.

### Нууцлал ба account deletion

- Public `/legal/privacy`, `/legal/terms`, `/account-deletion` route-ууд болон app-ийн footer/login холбоосууд нэмэгдсэн. `/privacy` дотор account deletion хүсэлт эхлүүлэх холбоос бий.
- Нэвтэрсэн, anonymous биш хэрэглэгч `POST /api/account-deletion`-ээр зөвхөн өөрийн request-ийг idempotent RPC-ээр бүртгэх/цуцлах боломжтой. RLS нь өөр хэрэглэгчийн request-ийг нууна; request/cancel нь нэг user-ийн advisory lock ашиглана.
- `/admin/account-deletion` нь идэвхтэй admin-д зориулсан read-only queue. Энэ UI account/data устгахгүй, request status өөрчлөхгүй.
- Одоогийн release automatic deletion worker-гүй. Operator identity, data inventory, retention/shared-record rule, бодит deletion/anonymization болон нотолгоог тусдаа батлагдсан runbook-оор гүйцэтгэх ёстой. Auth user устахад одоогийн queue row `on delete cascade`-аар арилдаг тул evidence/notification record-ийг хаана, хэдий хугацаанд хадгалахыг owner/legal review шийдээгүй. Request бүртгэгдсэн нь deletion дууссан гэсэн үг биш.
- Privacy/Terms текст нь code/schema-д тулгуурласан **owner-review draft**. `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_LEGAL_ENTITY_NAME` хоёр production preflight-д заавал боловч legal entity, насны бодлого, retention хугацаа, governing law, vendor/data-transfer нөхцөлийг owner/хуульч launch-аас өмнө эцэслэнэ.

Store submission хийхийн өмнө canonical production origin дээр `/legal/privacy` болон `/account-deletion` хоёрыг нэвтрэхгүйгээр нээж шалгана. App Store Connect-ийн Privacy Policy URL-д `/legal/privacy`, Google Play-ийн account deletion web resource-д `/account-deletion`-ийн бүтэн HTTPS URL-г оруулна. App/Play data-safety disclosure, retention/deletion хугацаа, support response ба бодит deletion runbook owner/legal approval авсны дараа л submission хийнэ.

Шинэ урилгатай auth user `pending` membership-ээр зөвхөн Success Map onboarding-оо хийж чадна; Team OS workspace автоматаар нээгдэхгүй. Админ `public.team_members` дахь membership-ийг тусад нь `active` болгоно. Эрх цуцлахдаа `disabled` ашиглана. Role-г `user_metadata` эсвэл `user_profiles.role`-оос authorization-д ашиглахгүй.

## Шалгалт

```bash
pnpm run lint
pnpm run typecheck
supabase db start
supabase test db supabase/tests
pnpm test
```

Pull request болон `main` push бүр дээр GitHub Actions dependency install, lint, typecheck, production build, test ажиллуулж `.next/` artifact хадгална.
Одоогийн database suite нь membership, content workflow, admin, 15+100 assessment, AI persistence, privacy lifecycle, AI-tailored generation, account deletion, Video Academy болон launch schema contract-ийн нийт 289 pgTAP assertion-тай.

## Vercel deployment

Vercel project нь GitHub repository-тэй холбоотой. 2026-09-06-ны live inspection-оор Supabase-тэй холбоотой хоёр project variable зөвхөн Production scope-д харагдсан бөгөөд нэг variable-ийн нэр expected contract-тэй casing-ээр зөрөх эрсдэлтэй байсан; утгуудыг ил гаргаж шалгаагүй. Тиймээс `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` нэр ба шаардлагатай environment scope-уудыг deploy-оос өмнө Vercel дээр засаж, preflight-аар баталгаажуулна. Production promotion хийхийн өмнө preview дээр login, auth redirect, security headers болон API 401/403 урсгалыг шалгана.

Launch environment-ийн нэр болон URL хэлбэрийг нууц утга хэвлэхгүйгээр шалгана:

```bash
pnpm run preflight:example
pnpm run preflight -- --env-file .env.local
```

Vercel runtime дээр AI Gateway OIDC ашиглах production environment-ийг шалгахдаа:

```bash
pnpm run preflight -- --env-file .vercel/.env.production.local --vercel-runtime --require-signed-video
pnpm run preflight:schema -- --env-file .vercel/.env.production.local
```

`preflight:schema` нь татсан production env-ээс Supabase URL болон server-only key-г уншиж, утгыг хэвлэхгүйгээр service-role-only `insuccess_schema_contract()` RPC яг энэ app release-ийн contract-ийг буцааж байгаа эсэхийг шалгана. Энэ gate амжилтгүй бол production build/deploy эхлэхгүй.

Academy-ийн public Mux playback-д signing key шаардахгүй. Private сургалтын catalog-ийг `signed` playback policy-тай launch хийх үед `MUX_SIGNING_KEY_ID` болон `MUX_SIGNING_PRIVATE_KEY` хоёул хамт тохирсон байх ёстой; production preflight үүнийг fail-closed шалгана.

`GET /api/health` нь publishable key-ээр өгөгдөл уншдаггүй `public.health_check()` RPC-г дуудаж, 5 секундийн бодит Postgres readiness probe хийдэг. Response нь зөвхөн `ok/degraded`, database-ийн reachability, latency болон шалгасан цагийг буцаана; URL, key, provider error болон хэрэглэгчийн өгөгдөл буцаахгүй. Database хүрэхгүй эсвэл environment/migration дутуу үед HTTP 503 өгнө.

500 хэрэглэгчийн бодит урсгалыг орлохгүй боловч public readiness smoke/load scaffold нь зөвхөн mutation хийдэггүй `/api/health` болон `/login` GET endpoint-ийг шалгана:

```bash
LOAD_BASE_URL=https://your-app.example.com \
LOAD_REQUESTS=500 \
LOAD_CONCURRENCY=50 \
LOAD_MAX_P95_MS=3000 \
pnpm run load:smoke
```

Production deploy workflow нь deploy credential-ийн нэр, isolated Supabase policy tests, lint, typecheck, source tests, production environment preflight болон Vercel production build-ийг deploy-оос өмнө ажиллуулна. Deploy-ийн дараа health/login smoke ажиллана. Smoke бүтэлгүйтвэл workflow failure болно; автомат rollback хийхгүй тул хамгийн сүүлийн баталгаажсан Vercel deployment-ийг operator гараар rollback/promote хийнэ.

Нэмэлт GitHub Actions production deploy-ийг идэвхжүүлэх бол repository secrets-д:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

гэсэн утгуудыг хадгалж, repository variable `VERCEL_DEPLOY_ENABLED=true` болгоно. Нууц утгыг commit хийж болохгүй.

## Legacy deployment

Өмнөх ChatGPT Sites/Cloudflare deployment нь тусдаа legacy production хэвээр байж болно. Supabase schema болон хэрэглэгчийн өгөгдөл түүнээс автоматаар хуулбарлагдахгүй; шинэ Supabase production баталгаажсаны дараа шилжилтийн шийдвэрийг тусад нь гаргана.

## Аюулгүй байдлын үндсэн дүрэм

- Нууц үг, карт, паспортын мэдээлэл application table-д хадгалахгүй.
- Нууц үгийг Supabase Auth удирдана.
- Хэрэглэгчийн session-г SSR cookie болон `getClaims()`-ээр баталгаажуулна.
- Public schema дахь бүх application table RLS идэвхтэй.
- AI generation бүр model call-аас өмнө server-only RPC-ээр бүртгэгдэж, result/model/token/error төлөв idempotent байдлаар хадгалагдана.
- 100 custom асуултыг үүсгэх 5 model request бүрд яг 15 bounded baseline question/answer evidence дамжина; assistant нь current message, хамгийн ихдээ 10 recent message, profile/guide allowlist context болон хамгийн ихдээ 12 bounded tailored short-text reflection ашиглаж болно. Эдгээр урсгал email, user/session ID дамжуулахгүй бөгөөд `zeroDataRetention: true` шаардана.
- AI-ийн social/content хариулт нь ноорог; автоматаар нийтлэхгүй бөгөөд хүний review/албан эх сурвалжийн шаардлагыг орлохгүй.
- `corporate_approved` нь компанийн approval reference бүртгэгдсэнийг л илэрхийлнэ; app уг external баримтыг өөрөө баталгаажуулахгүй.
