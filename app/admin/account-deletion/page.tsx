import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTeamOsUser } from "../../current-user";
import { AccountDeletionQueue } from "./queue";
import styles from "./queue.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account deletion queue" };

export default async function AdminAccountDeletionPage() {
  const user = await getCurrentTeamOsUser();
  if (!user) redirect("/login?next=/admin/account-deletion");
  if (user.access !== "active") redirect("/access-pending");
  if (user.role !== "admin") redirect("/");

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p>PRIVATE SUPER ADMIN ACCESS</p>
          <h1>Account deletion queue</h1>
          <span>Хэрэглэгчийн хүсэлтийг харах read-only самбар. Энэ дэлгэцээс account эсвэл өгөгдөл устгахгүй.</span>
        </div>
        <Link href="/admin">← Админ хэсэг</Link>
      </header>

      <section className={styles.operatorNote}>
        <h2>Operator completion шаардлага</h2>
        <ol>
          <li>Хүсэлт гаргагчийн identity болон account ownership-ийг баталгаажуулна.</li>
          <li>Auth, profile, assessment, AI, Academy болон Team OS data inventory-г шалгана.</li>
          <li>Хууль ёсоор хадгалах болон shared/audit record-ийн шийдвэрийг owner/legal policy-оор баримтжуулна.</li>
          <li>Бодит deletion/anonymization болон хэрэглэгчид өгөх мэдэгдлийг батлагдсан runbook-оор гүйцэтгэнэ.</li>
        </ol>
        <p>Одоогийн application-д автомат deletion worker болон status өөрчлөх товч байхгүй. Auth user устахад queue row cascade-аар арилдаг тул audit/evidence record-ийн тусдаа хадгалалтыг owner/legal policy-оор шийдэх шаардлагатай. Queue-д орсон нь устгал дууссан гэсэн үг биш.</p>
      </section>

      <AccountDeletionQueue />
    </main>
  );
}
