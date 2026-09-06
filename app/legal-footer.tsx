import Link from "next/link";
import { getPublicLegalConfig } from "@/lib/legal-config";
import { PRODUCT_NAME } from "./brand";

export function LegalFooter() {
  const { supportEmail } = getPublicLegalConfig();

  return (
    <footer className="legal-footer">
      <span>{PRODUCT_NAME}</span>
      <nav aria-label="Нууцлал ба үйлчилгээний холбоос">
        <Link href="/legal/privacy">Нууцлал</Link>
        <Link href="/legal/terms">Үйлчилгээний нөхцөл</Link>
        <Link href="/account-deletion">Account устгах</Link>
        {supportEmail && <a href={`mailto:${supportEmail}`}>Тусламж</a>}
      </nav>
    </footer>
  );
}
