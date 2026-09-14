import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Support' };

export default function SupportPage() {
  return <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px', lineHeight: 1.8, color: '#172d43', background: '#fff', minHeight: '100vh' }}>
    <p>inSuccess Team OS</p><h1>Тусламж / Support</h1>
    <p>Нэвтрэх, хичээлийн ахиц, даалгавар болон бүртгэлийн талаар тусламж авах бол <a href="mailto:tumee.jav@gmail.com">tumee.jav@gmail.com</a> хаягаар холбогдоно уу.</p>
    <p>For account, learning progress or task support, contact Tumendelgerjav Jargaltogtokh at the email address above. Include your app version, device model and a description of the problem. Do not send passwords or verification codes.</p>
    <h2>Нэвтрэхэд асуудалтай юу?</h2><p><Link href="/auth/forgot-password">Нууц үгээ шинэчлэх</Link> холбоосыг ашиглана уу. Багийн эрх хүлээгдэж байвал өөрийн багийн админтай холбогдоно.</p>
    <h2>Хувийн мэдээлэл</h2><p><Link href="/privacy">Нууцлалын бодлого</Link>-оос мэдээлэл ашиглалт болон бүртгэл устгах тайлбарыг уншина уу.</p>
    <p><Link href="/login">Апп руу орох</Link></p>
  </main>;
}
