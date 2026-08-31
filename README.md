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
- 300 versioned branch item-аас эхний хариултад тулгуурлан 80 scale + 20 ойлгомжтой сонголт бүхий яг 100 асуултын immutable snapshot үүсгэнэ
- 15 + 100 хариултын дараа Success Profile, 7 хоног болон 30/60/90 хоногийн хувийн guide гаргана
- Board Director хэсэг нь хангалттай self-report evidence үед боломжит хөгжлийн зам хэлбэрээр нээгдэнэ; rank/орлого амлахгүй
- Хувийн AI mentor: энгийн, алхамчилсан, хурдан горим; conversation history ба memory opt-out; автоматаар нийтлэхгүй
- Raw assessment, profile, guide нь onboarding үед pending/active owner-д, assistant history нь зөвхөн active owner-д харагдана; disabled хэрэглэгчийн уншилтыг RLS хаана
- Удирдлагын хяналтын төв
- Academy completion tracker (quiz, rubric, certification gate дараагийн release)
- Content Studio: draft → тусдаа reviewer → internal review → company approval reference workflow
- Member Success даалгаврын самбар
- Албан эх сурвалжийн Source Vault
- Invite-only Supabase email/password authentication
- Active team membership, role separation, least-privilege RLS policies
- Mobile-friendly PWA

## Локал ажиллуулах

Шаардлага: Node.js 22.13+, pnpm 11.16.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm run dev
```

`.env.local` файлд Supabase Dashboard → Connect хэсгээс авсан утгыг оруулна:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=your_server_only_secret_key
AI_GATEWAY_API_KEY=your_local_ai_gateway_key
INSUCCESS_AI_MODEL=openai/gpt-5.6-luna
```

Publishable key нь frontend-д ашиглагдах зориулалттай боловч хүснэгт бүр RLS-ээр хамгаалагдсан. `SUPABASE_SECRET_KEY` болон `AI_GATEWAY_API_KEY` нь зөвхөн server environment-д байна; frontend, log, artifact болон repository-д хэзээ ч хадгалахгүй. Vercel Preview/Production дээр AI Gateway OIDC ашиглаж болох тул `AI_GATEWAY_API_KEY` заавал биш.

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
```

Supabase CLI-гаар project холбоод migration ажиллуулна:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Supabase Auth → URL Configuration хэсэгт дараах redirect URL-уудыг зөвшөөрнө:

```text
http://localhost:3000/auth/confirm
https://incruises-team-os.vercel.app/auth/confirm
```

Production дээр email confirmation идэвхтэй. Supabase-ийн built-in email service нь default confirmation template ашиглана. Custom SMTP холбосны дараа SSR confirmation route ашиглах бол template холбоосыг дараах хэлбэрээр тохируулна:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Invite template-ийн холбоос:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password
```

Hosted Supabase Auth дээр public email sign-up болон ашигладаггүй provider-уудыг OFF, leaked-password protection-ийг ON болгоно. Repository дахь `enable_signup = false` нь local parity; hosted setting-ийг Dashboard/Management API дээр тусад нь баталгаажуулна.

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
Одоогийн database suite нь membership, content workflow, admin, 15+100 assessment, AI persistence болон privacy lifecycle-ийн нийт 198 pgTAP assertion-тай.

## Vercel deployment

Vercel project нь GitHub repository-тэй холбоотой. Supabase-ийн хоёр public environment variable нь Development, Preview, Production орчинд тохирсон байна. Production promotion хийхийн өмнө preview дээр login, auth redirect, security headers болон API 401/403 урсгалыг шалгана.

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
- AI mentor profile/guide-ийн allowlist context ашиглана; raw assessment answer, email, user/session ID-г model context руу дамжуулахгүй.
- AI-ийн social/content хариулт нь ноорог; автоматаар нийтлэхгүй бөгөөд хүний review/албан эх сурвалжийн шаардлагыг орлохгүй.
- `corporate_approved` нь компанийн approval reference бүртгэгдсэнийг л илэрхийлнэ; app уг external баримтыг өөрөө баталгаажуулахгүй.
