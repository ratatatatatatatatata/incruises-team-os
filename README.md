# inSuccess Team OS

Монгол хэл дээрх багийн сургалт, контентын хяналт, гишүүний дараагийн алхам болон албан эх сурвалжийг нэгтгэсэн private web platform. Системийн брэнд нэр нь **inSuccess**.

> Энэ нь багийн дотоод сургалтын хэрэгсэл бөгөөд inCruises-ийн албан ёсны бүтээгдэхүүн биш. Үнэ, урамшуулал, аялал болон бодлогын мэдээллийг нийтлэхийн өмнө албан эх сурвалжаар баталгаажуулна.

## Архитектур

- **Frontend/API:** Next.js 16 App Router
- **Web hosting:** Vercel
- **Database:** Supabase Postgres
- **Authentication:** Supabase Auth SSR cookie
- **Authorization:** Postgres Row Level Security (RLS)
- **CI/CD:** GitHub Actions verification + Vercel Git deployment

Cloudflare Worker, Vinext болон D1 runtime ашиглахгүй.

Production: <https://incruises-team-os.vercel.app>

## Үндсэн боломжууд

- Удирдлагын хяналтын төв
- Academy completion tracker (quiz, rubric, certification gate дараагийн release)
- Content Studio: draft → тусдаа reviewer → internal review → company approval reference workflow
- Member Success даалгаврын самбар
- Албан эх сурвалжийн Source Vault
- Supabase email/password registration and authentication
- New user profile + active user membership automation
- Admin-only user directory with role and access management
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
```

Publishable key нь frontend-д ашиглагдах зориулалттай боловч хүснэгт бүр RLS-ээр хамгаалагдсан. Service role/secret key-ийг frontend болон repository-д хэзээ ч хадгалахгүй.

## Supabase database

Schema, membership, RLS болон content review workflow:

```text
supabase/migrations/20260810000000_team_os.sql
supabase/migrations/20260829062550_harden_membership_access.sql
supabase/migrations/20260829062600_enforce_content_review_workflow.sql
supabase/migrations/20260829063013_finalize_content_write_lockdown.sql
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

Hosted Supabase Auth дээр email sign-up-ийг ON, ашигладаггүй provider-уудыг OFF, leaked-password protection-ийг ON болгоно. Repository дахь `enable_signup = true` нь local parity; hosted setting-ийг Dashboard/Management API дээр тусад нь баталгаажуулна.

Шинэ auth user-д `public.user_profiles` болон идэвхтэй `user` membership автоматаар үүснэ. Админ шаардлагатай үед Builder, Coach, Director эсвэл Admin эрх олгоно. Role-г `user_metadata` эсвэл `user_profiles.role`-оос authorization-д ашиглахгүй.

## Шалгалт

```bash
pnpm run lint
pnpm run typecheck
pnpm test
```

Pull request болон `main` push бүр дээр GitHub Actions dependency install, lint, typecheck, production build, test ажиллуулж `.next/` artifact хадгална.

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
- Generative AI credential болон automatic claim scanner одоогоор холбогдоогүй.
- `corporate_approved` нь компанийн approval reference бүртгэгдсэнийг л илэрхийлнэ; app уг external баримтыг өөрөө баталгаажуулахгүй.
