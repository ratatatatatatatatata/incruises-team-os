import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px', lineHeight: 1.8, color: '#172d43', background: '#fff', minHeight: '100vh' }}>
    <p>inSuccess Team OS · Updated 14 September 2026</p>
    <h1>Нууцлалын бодлого / Privacy Policy</h1>
    <p>inSuccess Team OS нь багийн гишүүдийн сургалт, ахиц болон дараагийн ажлыг удирдах апп юм. Хариуцагч: Tumendelgerjav Jargaltogtokh. Холбоо барих: <a href="mailto:tumee.jav@gmail.com">tumee.jav@gmail.com</a>.</p>
    <h2>Бид ямар мэдээлэл ашигладаг вэ?</h2>
    <p>Бүртгэлийн нэр, имэйл, хэрэглэгчийн дугаар, багийн эрх, хичээлийн ахиц, даалгавар болон таны оруулсан тайлбарыг бүртгэлтэй тань холбон хадгална. Нууц үгийг баталгаажуулалтын үйлчилгээ хэшлэн боловсруулдаг. Та тусламж хүсвэл илгээсэн холбоо барих мэдээлэл болон хүсэлтийг хариу өгөхөд ашиглана.</p>
    <h2>Зорилго ба үйлчилгээ үзүүлэгчид</h2>
    <p>Эдгээр мэдээллийг нэвтрүүлэх, багийн эрхийг шалгах, сургалтын ахиц болон ажлыг хадгалах, тусламж үзүүлэх, үйлчилгээний аюулгүй ажиллагааг хангахад ашиглана. Бүртгэл ба өгөгдлийн санг Supabase, вэб үйлчилгээг Vercel ажиллуулдаг. Үйлчилгээний техникийн бүртгэлд IP хаяг, хүсэлтийн цаг, алдааны мэдээлэл орж болно. Өгөгдлийг Монгол Улсаас гаднах үйлчилгээний дэд бүтцээр боловсруулж болно.</p>
    <p>Бид таны хэрэглээг бусад аппын хэрэглээтэй холбон зар сурталчилгаанд ашигладаггүй, хувийн мэдээллийг зар сурталчилгааны сүлжээнд худалддаггүй. Апп дотор аяллын захиалга болон төлбөр боловсруулахгүй.</p>
    <h2>Хандалт ба хадгалалт</h2>
    <p>Нэвтрэх болон эрхийн хяналтаар мэдээлэлд хандах боломжийг хязгаарлана. Таны хичээлийн ахиц, хувийн даалгавар өөрийн бүртгэлд хамаарна. Багийн админ хэрэглэгчийн нэр, имэйл, эрх болон төлөвийг удирдана. Бүртгэл ажиллаж байх хугацаанд эдгээр мэдээллийг хадгална.</p>
    <h2>Бүртгэлээ устгах</h2>
    <p>Аппын «Бүртгэл» хэсгээс «Бүртгэл устгах»-ыг сонгож баталгаажуулна. Амжилттай устгаснаар нэвтрэх бүртгэл, профайл, багийн эрх, хичээлийн ахиц, хувийн даалгавар болон өөрийн draft контент үндсэн сангаас устна. Нийтлэгдсэн багийн хичээл, хяналтын түүх нь хэрэглэгчийн дугаарын холбоосгүй үлдэж болно. Үйлчилгээ үзүүлэгчийн нөөц хуулбар болон техникийн бүртгэл тус үйлчилгээний хадгалалтын хугацаанд үлдэж болно. Мэдээллээ шалгах, засуулах эсвэл хуулбарыг хүсэх бол дээрх имэйлээр холбогдоно уу.</p>
    <h2>English summary</h2>
    <p>We use your name, email, account identifier, membership status, learning progress and task content to provide the learning workspace. Supabase processes authentication and database records; Vercel hosts the website. Technical logs may include IP addresses, timestamps and errors. Data may be processed outside Mongolia. The app does not include advertising tracking or payment processing. Account deletion is available in the app’s Account section. It removes the account and associated personal workspace records from the primary database. Published team lessons and audit records may remain without the account identifier; provider backups and technical logs follow provider retention. Contact tumee.jav@gmail.com for access, correction, export or privacy questions.</p>
    <p><Link href="/support">Тусламж / Support</Link> · <Link href="/login">Апп руу орох</Link></p>
  </main>;
}
