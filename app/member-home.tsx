import Link from "next/link";
import { BRAND_NAME, PRODUCT_DESCRIPTOR } from "./brand";
import styles from "./member-home.module.css";

type MemberHomeProps = {
  user: {
    name: string;
    email: string;
    role: string;
  };
  primaryStyle: string;
  strengths: string[];
  growthEdges: string[];
  todayAction: string;
  boardDirectorRoute: boolean;
};

export function MemberHome({
  user,
  primaryStyle,
  strengths,
  growthEdges,
  todayAction,
  boardDirectorRoute,
}: MemberHomeProps) {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={`${BRAND_NAME} нүүр`}>
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span><strong>{BRAND_NAME}</strong><small>{PRODUCT_DESCRIPTOR}</small></span>
        </Link>
        <nav className={styles.nav} aria-label="Хувийн цэс">
          <Link href="/my-guide">Миний Guide</Link>
          <Link href="/assistant">AI туслах</Link>
          <Link href="/workspace">Team OS</Link>
          {user.role === "admin" && <Link href="/admin">Admin</Link>}
        </nav>
        <form action="/auth/signout" method="post"><button type="submit">Гарах</button></form>
      </header>

      <section className={styles.hero} aria-labelledby="member-home-title">
        <div>
          <p className={styles.eyebrow}>ТАНД ЗОРИУЛСАН SUCCESS MAP</p>
          <h1 id="member-home-title">Сайн байна уу, {user.name}.</h1>
          <p className={styles.lead}>
            Таны 15 + 100 хариултад суурилсан ажлын зураглал бэлэн. Энэ нь таныг “бүрэн тодорхойлсон” онош биш —
            зорилго, дадал, ур чадвар, саадыг тань дагаж шинэчлэгддэг хувийн зам юм.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/assistant">Өнөөдрийн алхмаа эхлэх</Link>
            <Link className={styles.secondaryAction} href="/my-guide">Success Map-аа харах</Link>
          </div>
        </div>
        <div className={styles.completion} aria-label="Assessment 115 асуулт бүрэн">
          <strong>115</strong><span>/ 115</span><small>Success Map бүрэн</small>
        </div>
      </section>

      <section className={styles.today} aria-labelledby="today-title">
        <div><p className={styles.eyebrow}>ӨНӨӨДРИЙН НЭГ АЛХАМ</p><h2 id="today-title">{todayAction}</h2></div>
        <Link href="/assistant">Алхам алхмаар заалгах →</Link>
      </section>

      <section className={styles.grid} aria-label="Таны хувийн зам">
        <article className={styles.card}>
          <span className={styles.number}>01</span>
          <p className={styles.eyebrow}>АЖИЛЛАХ ХЭВ МАЯГ</p>
          <h2>{primaryStyle}</h2>
          <p>AI туслах зөвлөгөөг энэ хэв маягт тохируулж, нэг удаад нэг ойлгомжтой үйлдэл өгнө.</p>
        </article>

        <article className={styles.card}>
          <span className={styles.number}>02</span>
          <p className={styles.eyebrow}>ТҮШИХ ХҮЧ</p>
          <h2>{strengths[0] ?? "Таны бодит давуу талууд"}</h2>
          <ul>{strengths.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>

        <article className={styles.card}>
          <span className={styles.number}>03</span>
          <p className={styles.eyebrow}>ЭХЭЛЖ ХӨГЖҮҮЛЭХ</p>
          <h2>{growthEdges[0] ?? "Дараагийн жижиг ур чадвар"}</h2>
          <ul>{growthEdges.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </section>

      <section className={styles.paths} aria-label="Үндсэн хэрэгслүүд">
        <Link href="/my-guide"><span>Миний Guide</span><strong>7 хоног ба 30/60/90 хоногийн зам</strong><small>Яагаад энэ алхмыг санал болгосныг харна.</small></Link>
        <Link href="/assistant"><span>Хувийн AI туслах</span><strong>Өдөр бүр хамт ажиллах digital mentor</strong><small>Асуух, дасгал хийх, контентын ноорог бэлдэх.</small></Link>
        <Link href="/workspace"><span>Team OS</span><strong>Academy, Content Studio, Member Success</strong><small>Багийн хэрэгжүүлэлт ба хүний хяналттай workflow.</small></Link>
      </section>

      {boardDirectorRoute && (
        <section className={styles.boardRoute}>
          <div><p className={styles.eyebrow}>HIGH-AMBITION DEVELOPMENT ROUTE</p><h2>Board Director зорилгын хөгжлийн зам нээгдсэн.</h2></div>
          <p>Энэ нь зэрэглэл эсвэл орлогын баталгаа биш. Таны мэдлэг, үйлдэл, leadership-ийн хариултад тулгуурласан хөгжүүлэх чиглэл.</p>
          <Link href="/my-guide#board-director">Замаа харах →</Link>
        </section>
      )}

      <footer className={styles.footer}>
        <span>{user.email}</span>
        <Link href="/privacy">Таны raw хариулт default-аар зөвхөн танд харагдана · Нууцлалын сонголт</Link>
      </footer>
    </main>
  );
}
