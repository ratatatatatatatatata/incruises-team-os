import type { Metadata } from "next";
import Link from "next/link";
import { getPublicLegalConfig } from "@/lib/legal-config";
import { PRODUCT_NAME } from "../../brand";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Үйлчилгээний нөхцөл — төсөл",
  description: `${PRODUCT_NAME}-ийг ашиглах нөхцөлийн owner-review draft.`,
  alternates: { canonical: "/legal/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  const legal = getPublicLegalConfig();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/">{PRODUCT_NAME}</Link>
        <Link href="/legal/privacy">Нууцлалын мэдэгдэл</Link>
      </header>

      <article className={styles.article}>
        <p className={styles.eyebrow}>PUBLIC TERMS · OWNER-REVIEW DRAFT</p>
        <h1>Үйлчилгээний нөхцөл</h1>
        <p className={styles.lead}>Энэ нь одоогийн бүтээгдэхүүний ажиллагааг тайлбарласан төсөл бөгөөд production хэрэглэгчтэй байгуулах эцсийн хууль зүйн нөхцөл биш.</p>

        <aside className={styles.draft}>
          <strong>Launch blocker:</strong> үйлчилгээ хариуцагч/хуульч eligibility, payment, governing law, dispute, liability cap, refund, notice болон хүчин төгөлдөр огноог батлах шаардлагатай. Батлахаас өмнө хэрэглэгчээр энэ draft-ийг binding agreement болгон зөвшөөрүүлэхгүй.
        </aside>

        <section className={styles.section}>
          <h2>1. Үйлчилгээ ба хариуцагч</h2>
          <p>{PRODUCT_NAME} нь хувийн Success Map, AI assistant, Video Academy болон багийн хэрэгжүүлэлтийн хэрэгсэл. Үйлчилгээ хариуцагч: {legal.legalEntityName ?? "хууль ёсны нэр тохируулагдаагүй"}.</p>
          <p>Энэ нь inCruises-ийн албан ёсны бүтээгдэхүүн биш. Үнэ, урамшуулал, аялал, rank болон компанийн бодлогын тухай мэдээллийг албан эх сурвалжаар тусад нь шалгана.</p>
        </section>

        <section className={styles.section}>
          <h2>2. Account ба эрх</h2>
          <ul>
            <li>Access нь зөвхөн урилгаар олгогдоно; нэвтэрсэн account бүр Team OS-ийн бүх өгөгдөлд эрхтэй болохгүй.</li>
            <li>Хэрэглэгч нууц үгээ хамгаалж, өөрийн account-аар хийсэн үйлдлээ хариуцна.</li>
            <li>Team role, membership төлөв болон privacy choice нь харах, өөрчлөх боломжийг хязгаарлана.</li>
            <li>Security, misuse эсвэл access policy зөрчигдвөл account-ыг pending/disabled төлөвт оруулж болно; яг notice/appeal process owner review хүлээж байна.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>3. AI, Success Map ба сургалт</h2>
          <p>Асуулгын үр дүн, guide, Board Director хөгжлийн route, AI answer болон content suggestion нь self-report өгөгдөл дээр тулгуурласан туслах материал. Эдгээр нь rank, орлого, борлуулалт, аялал, эрүүл мэнд эсвэл бусад үр дүнгийн баталгаа биш.</p>
          <p>AI output алдаатай байж болно. Хэрэглэгч нийтлэх, бусдад илгээх, бизнес эсвэл хувийн шийдвэрт ашиглахын өмнө өөрөө болон шаардлагатай reviewer-аар шалгуулна.</p>
        </section>

        <section className={styles.section}>
          <h2>4. Зөвшөөрөгдөх хэрэглээ</h2>
          <p>Хэрэглэгч хууль бус, төөрөгдүүлсэн, дарамталсан, бусдын эрх зөрчсөн, credential хуваалцсан, хамгаалалт тойрсон эсвэл зөвшөөрөлгүй автомат нийтлэл хийсэн контент/үйлдэлд үйлчилгээг ашиглахгүй.</p>
          <p>Нууц үг, карт, паспорт, эрүүл мэндийн нууц зэрэг хэрэгцээгүй эмзэг мэдээллийг AI prompt, draft эсвэл task-д оруулахгүй.</p>
        </section>

        <section className={styles.section}>
          <h2>5. Контент ба гуравдагч үйлчилгээ</h2>
          <p>Хэрэглэгч өөрийн оруулсан материалд шаардлагатай эрх, зөвшөөрөлтэй байна. “Company approval reference” талбар нь гаднын зөвшөөрөл үнэхээр олгогдсоныг application өөрөө нотлохгүй.</p>
          <p>Үйлчилгээ Supabase, Vercel, AI provider болон Mux зэрэг гуравдагч дэд бүтцээс хамаарч болно. Тэдний нөхцөл, availability болон өгөгдөл боловсруулах шаардлага давхар үйлчилж болно.</p>
        </section>

        <section className={styles.section}>
          <h2>6. Account устгал</h2>
          <p><Link href="/account-deletion">Account deletion</Link>-оос устгах хүсэлт эхлүүлнэ. Хүсэлт бүртгэх нь account эсвэл өгөгдлийг шууд устгасан гэсэн үг биш. Үйлчилгээ хариуцагч хүсэлтийг identity, shared-record болон хууль ёсны хадгалалтын review-ийн дараа бодитоор гүйцэтгэж, төлөвийг шинэчлэх operational process ажиллуулах ёстой.</p>
        </section>

        <section className={styles.section}>
          <h2>7. Availability, төлбөр ба хариуцлага</h2>
          <p>Одоогийн код availability, backup recovery, support response эсвэл алдаагүй ажиллагааны баталгаа өгөхгүй. Subscription/payment/refund feature одоогийн repository-д хэрэгжээгүй.</p>
          <p>Warranty disclaimer, liability limit, indemnity, governing law, dispute resolution, termination notice болон service-level нөхцөл эцэслээгүй; эдгээрийг таамгаар нөхөөгүй.</p>
        </section>

        <section className={styles.section}>
          <h2>8. Холбоо барих</h2>
          <p>{legal.supportEmail ? <>Асуулт болон хүсэлт: <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.</> : "Support email тохируулагдаагүй."}</p>
          <p><Link href="/legal/privacy">Нууцлалын мэдэгдлийг унших</Link>.</p>
        </section>

        <p className={styles.meta}>Code/schema review snapshot: 2026-09-06. Энэ огноо нь нөхцөл хүчин төгөлдөр болсон огноо биш.</p>
      </article>
    </main>
  );
}
