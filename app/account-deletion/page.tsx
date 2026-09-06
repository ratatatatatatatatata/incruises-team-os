import type { Metadata } from "next";
import Link from "next/link";
import { getPublicLegalConfig } from "@/lib/legal-config";
import { PRODUCT_NAME } from "../brand";
import { AccountDeletionControl } from "./account-deletion-control";
import styles from "./account-deletion.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account устгах хүсэлт",
  description: `${PRODUCT_NAME} account болон холбогдох хувийн өгөгдлийг устгуулах хүсэлт гаргах хуудас.`,
  alternates: { canonical: "/account-deletion" },
  robots: { index: true, follow: true },
};

export default function AccountDeletionPage() {
  const legal = getPublicLegalConfig();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/">{PRODUCT_NAME}</Link>
        <Link href="/legal/privacy">Нууцлалын мэдэгдэл</Link>
      </header>

      <section className={styles.hero}>
        <p>ACCOUNT & DATA CONTROL</p>
        <h1>Account устгах хүсэлт</h1>
        <span>App болон web-ээс өөрийн хүсэлтийг эхлүүлэх, төлөвийг харах, боловсруулалт эхлэхээс өмнө цуцлах боломжтой.</span>
      </section>

      {!legal.ready && (
        <aside className={styles.ownerWarning} role="note">
          Production холбоо барих имэйл эсвэл үйлчилгээ хариуцагчийн хууль ёсны нэр тохируулагдаагүй. Энэ хуудас launch-аас өмнө owner/legal review шаардлагатай.
        </aside>
      )}

      <section className={styles.grid}>
        <article className={styles.card}>
          <p className={styles.kicker}>01 · Юу болох вэ?</p>
          <h2>Хүсэлт эхлээд аюулгүй дараалалд орно</h2>
          <ol>
            <li>Нэвтэрсэн account эзэмшигч хүсэлтээ баталгаажуулна.</li>
            <li>Систем хүсэлтийн төлөв, огноог бүртгэнэ; энэ алхам өгөгдөл устгахгүй.</li>
            <li>Үйлчилгээ хариуцагч таних болон хадгалалтын шаардлагыг шалгаж, бодит устгалыг тусдаа хяналттайгаар гүйцэтгэнэ.</li>
          </ol>
        </article>

        <article className={styles.card}>
          <p className={styles.kicker}>02 · Юу хамрагдах вэ?</p>
          <h2>Account болон түүнтэй холбогдсон хувийн өгөгдөл</h2>
          <p>Auth account, profile, Success Map-ийн хариулт ба үр дүн, AI conversation, сургалтын ахиц зэрэг тухайн хэрэглэгчтэй холбогдох өгөгдөл хамрагдана.</p>
          <p>Багийн хамтын record, аюулгүй байдал, хууль эсвэл аудитын зайлшгүй хадгалалт байгаа эсэхийг owner/legal review эцэслээгүй; одоогоор тодорхой хугацаа амлахгүй.</p>
        </article>
      </section>

      <section className={styles.manage} id="manage" aria-labelledby="manage-title">
        <p className={styles.kicker}>03 · Миний хүсэлт</p>
        <h2 id="manage-title">Хүсэлтээ удирдах</h2>
        <AccountDeletionControl supportEmail={legal.supportEmail} />
      </section>

      <section className={styles.contact}>
        <h2>Холбоо барих</h2>
        <p>
          Үйлчилгээ хариуцагч: {legal.legalEntityName ?? "хууль ёсны нэр тохируулагдаагүй"}.<br />
          {legal.supportEmail ? <>Тусламжийн имэйл: <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>.</> : "Тусламжийн имэйл тохируулагдаагүй."}
        </p>
      </section>
    </main>
  );
}
