import type { Metadata } from "next";
import Link from "next/link";
import { getPublicLegalConfig } from "@/lib/legal-config";
import { PRODUCT_NAME } from "../../brand";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Нууцлалын мэдэгдэл — төсөл",
  description: `${PRODUCT_NAME}-ийн өгөгдөл цуглуулах, ашиглах, хадгалах болон account deletion-ийн нээлттэй тайлбар.`,
  alternates: { canonical: "/legal/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyNoticePage() {
  const legal = getPublicLegalConfig();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/">{PRODUCT_NAME}</Link>
        <Link href="/account-deletion">Account устгах</Link>
      </header>

      <article className={styles.article}>
        <p className={styles.eyebrow}>PUBLIC PRIVACY NOTICE · OWNER-REVIEW DRAFT</p>
        <h1>Нууцлалын мэдэгдэл</h1>
        <p className={styles.lead}>Энэ мэдэгдэл нь одоогийн application code болон database schema-д тулгуурласан ил тод байдлын төсөл юм.</p>

        <aside className={styles.draft}>
          <strong>Launch blocker:</strong> үйлчилгээ хариуцагч энэ текстийг хуульчтай хянаж, хүчин төгөлдөр огноо, насны шаардлага, хадгалалтын яг хугацаа, эрх зүйн үндэслэл, улс орон дамнасан боловсруулалт болон маргаан шийдвэрлэх нөхцөлийг батлаагүй. App Store/Play submission-д үүнийг эцсийн бодлого гэж мэдүүлэхгүй.
        </aside>

        <section className={styles.section}>
          <h2>1. Хэн хариуцах вэ?</h2>
          <p>Үйлчилгээ: {PRODUCT_NAME}.</p>
          <p>Үйлчилгээ хариуцагч: {legal.legalEntityName ?? "хууль ёсны нэр тохируулагдаагүй"}.</p>
          <p>{legal.supportEmail ? <>Нууцлалын холбоо барих хаяг: <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.</> : "Нууцлалын холбоо барих имэйл тохируулагдаагүй."}</p>
        </section>

        <section className={styles.section}>
          <h2>2. Ямар өгөгдөл боловсруулдаг вэ?</h2>
          <ul>
            <li>Supabase Auth account: имэйл, session, баталгаажуулалт болон account metadata.</li>
            <li>Гишүүний profile ба эрх: display name, багийн role, pending/active/disabled төлөв.</li>
            <li>Success Map: зөвшөөрлийн төлөв, 15 + 100 асуултын хариулт, зорилго, дадал, ур чадвар, үүсгэсэн profile ба guide.</li>
            <li>AI assistant: conversation, message, хязгаарлагдсан profile/guide context, generation төлөв, model болон token хэрэглээний бүртгэл.</li>
            <li>Academy: course/lesson access, видео үзсэн байрлал, ахиц болон completion.</li>
            <li>Team OS: хэрэглэгчийн үүсгэсэн draft, task, сургалтын ахиц, review болон аудитын event.</li>
            <li>Service ажиллуулахад шаардлагатай cookie/session болон hosting, security, алдааны техникийн metadata.</li>
          </ul>
          <p>App нь нууц үг, карт, паспорт, эрүүл мэндийн нууц мэдээллийг content/AI талбарт оруулахгүй байхыг хэрэглэгчээс хүсдэг. Нууц үгийг application table биш Supabase Auth удирдана.</p>
        </section>

        <section className={styles.section}>
          <h2>3. Яагаад ашигладаг вэ?</h2>
          <ul>
            <li>Хэрэглэгчийг таних, invite-only access болон role-based эрхийг хэрэгжүүлэх.</li>
            <li>Хувийн Success Map, guide, assistant, сургалтын ахиц болон багийн workflow-ийг өгөх.</li>
            <li>Зөвшөөрлийн сонголт, AI memory болон profile sharing level-ийг хэрэгжүүлэх.</li>
            <li>Үйлчилгээний аюулгүй байдал, найдвартай ажиллагаа, алдаа болон зардлын хяналт.</li>
            <li>Account deletion болон тусламжийн хүсэлтийг бүртгэж шийдвэрлэх.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. Хэн боловсруулж болох вэ?</h2>
          <p>Одоогийн architecture-д Supabase (authentication/database), Vercel (hosting болон AI Gateway), тохируулсан AI model provider, Mux (video playback) зэрэг үйлчилгээ оролцож болно. Team OS дахь зөвшөөрөгдсөн admin/reviewer/coach нь зөвхөн role ба privacy policy-оор нээгдсэн өгөгдлийг харна.</p>
          <p>Vendor-ийн эцсийн жагсаалт, бүс нутаг, гэрээ, subprocessor болон data-transfer нөхцөл owner/legal review-ээр баталгаажаагүй.</p>
        </section>

        <section className={styles.section}>
          <h2>5. AI ба хувийн тохируулга</h2>
          <p>100 custom асуултыг одоогийн код 5 model request-аар бүлэглэн үүсгэнэ. Request бүрд 15 baseline асуулт ба хариултын bounded evidence дамжина: question 500 тэмдэгт, string хариулт 600 тэмдэгт, сонголтын array 8 item × 160 тэмдэгт хүртэл. Имэйл, user ID, session ID дамжуулахгүй.</p>
          <p>Assistant хариулт үүсгэх үед хэрэглэгчийн одоогийн message, хамгийн ихдээ 10 recent message, profile/guide-ийн allowlist context болон хамгийн ихдээ 12 tailored short-text reflection (асуулт 360, хариулт 320 тэмдэгт хүртэл) AI model руу дамжиж болно. Эдгээр reflection нь generation-ийн хадгалсан context snapshot-д нэмэгдэхгүй. AI Gateway хүсэлт бүр <code>zeroDataRetention: true</code> тохиргоо шаарддаг.</p>
          <p>AI-ийн гаргасан зөвлөгөө болон контент нь ноорог бөгөөд онош, баталгаа, хүний review эсвэл албан эх сурвалжийг орлохгүй.</p>
          <p>Хэрэглэгч Success Map зөвшөөрлөө цуцалж, assistant memory-г унтрааж, sharing level-ээ өөрчилж болно. Provider руу аль хэдийн илгээгдэж эхэлсэн хүсэлтийг буцаан татах боломжгүй байж болно.</p>
        </section>

        <section className={styles.section}>
          <h2>6. Хадгалалт ба устгал</h2>
          <p>Application нь үйлчилгээ үзүүлэх, security/audit болон хэрэглэгчийн history-д шаардлагатай хугацаанд өгөгдөл хадгалдаг. Гэхдээ өгөгдлийн төрөл бүрийн эцсийн retention хугацаа, хууль ёсоор заавал үлдээх record болон shared team record-ийг anonymize хийх дүрэм батлагдаагүй.</p>
          <p><Link href="/account-deletion">Account deletion хуудас</Link>-аас хүсэлт эхлүүлж, төлөвийг харж, хүсэлт “requested” байх үед цуцалж болно. Одоогийн release хүсэлтийг аюулгүй дараалалд бүртгэдэг боловч бодит өгөгдөл автоматаар устгахгүй; үйлчилгээ хариуцагч identity/retention review хийж гараар дуусгах ёстой.</p>
        </section>

        <section className={styles.section}>
          <h2>7. Таны сонголт ба хамгаалалт</h2>
          <p>Нэвтэрсэн хэрэглэгч <Link href="/privacy">Миний нууцлал</Link> хэсгээс assessment consent, AI memory болон sharing level-ээ удирдана. Access, correction, portability, objection эсвэл deletion хүсэлтийг дээрх support хаягаар гаргаж болно; тухайн эрхийн хамрах хүрээ нь хэрэглэгчийн харьяалах хуульд хамаарна.</p>
          <p>Application нь SSR session cookie, database Row Level Security, role checks болон server-side mutation ашигладаг. Ямар ч хамгаалалт абсолют биш; production security/incident process-ийн owner approval тусдаа шаардлагатай.</p>
        </section>

        <section className={styles.section}>
          <h2>8. Хүүхэд ба бодлогын өөрчлөлт</h2>
          <p>Үйлчилгээний хамгийн бага нас, эцэг эх/асран хамгаалагчийн зөвшөөрөл болон нас баталгаажуулах бодлого одоогоор эцэслээгүй. Эдгээрийг батлах хүртэл насанд хүрээгүй хэрэглэгчийг production-д зориудаар onboard хийхгүй байх operational шийдвэр шаардлагатай.</p>
          <p>Бодлого өөрчлөгдвөл шинэ хувилбар, огноо болон шаардлагатай тохиолдолд дахин зөвшөөрөл авах арга хэмжээг owner тогтооно.</p>
        </section>

        <p className={styles.meta}>Code/schema review snapshot: 2026-09-06. Энэ огноо нь бодлого хүчин төгөлдөр болсон огноо биш.</p>
      </article>
    </main>
  );
}
