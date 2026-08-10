# inCruises Team OS

Монгол хэл дээрх багийн сургалт, контентын хяналт, гишүүний дараагийн алхам болон албан эх сурвалжийг нэгтгэсэн private web platform.

> Энэ нь багийн дотоод сургалтын хэрэгсэл бөгөөд inCruises-ийн албан ёсны бүтээгдэхүүн биш. Үнэ, урамшуулал, аялал болон бодлогын мэдээллийг нийтлэхийн өмнө албан эх сурвалжаар баталгаажуулна.

## Үндсэн боломжууд

- Удирдлагын хяналтын төв
- L0–L6 шаталсан Academy ба хичээлийн явц
- Content Studio: draft → review → approved workflow
- Member Success даалгаврын самбар
- Албан эх сурвалжийн Source Vault
- ChatGPT Sites private authentication
- Cloudflare D1 дээр хэрэглэгч тус бүрээр тусгаарлагдсан өгөгдөл
- Mobile-friendly PWA

## Шаардлага

- Node.js 22.13 буюу түүнээс шинэ
- pnpm 11.16

## Локал ажиллуулах

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

`http://localhost:3000` хаягаар нээнэ. Local preview нь зөвхөн хөгжүүлэлтийн зориулалттай туршилтын хэрэглэгч ашигладаг.

## Шалгалт

```bash
pnpm run lint
pnpm test
```

Pull request болон `main` branch руу хийсэн push бүр дээр GitHub Actions dependency суулгаж, lint, production build, тестийг ажиллуулна. Амжилттай build-ийн `dist/` хавтас deploy artifact хэлбэрээр хадгалагдана.

## Deployment

Одоогийн private production:

- https://incruises-team-os-mn.tumee-jav.chatgpt.site

Repository нь ChatGPT Sites/Vinext/Cloudflare Workers орчинд deploy хийхэд бэлэн. Cloudflare-аас GitHub push бүрээр автоматаар deploy хийх бол repository secrets-д `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, мөн production D1 database binding-ийн мэдээллийг нэг удаа тохируулна. Нууц утгыг repository файлд хадгалж болохгүй.

## Өгөгдлийн аюулгүй байдал

- Нууц үг, карт, паспортын мэдээлэл хадгалахгүй.
- Хэрэглэгчийн өгөгдлийг authenticated user ID-аар тусгаарлана.
- API нь нэвтрээгүй production хүсэлтийг зөвшөөрөхгүй.
- Generative AI model credential одоогоор холбогдоогүй; Content Studio нь батлагдсан template engine ашигладаг.
