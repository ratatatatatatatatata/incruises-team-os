import type { Metadata } from "next";
import { chatGPTSignInPath } from "./chatgpt-auth";
import { getCurrentTeamOsUser } from "./current-user";
import { TeamOsApp } from "./team-os-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team OS",
};

export default async function Home() {
  const user = await getCurrentTeamOsUser();

  if (!user) {
    return (
      <main className="signin-shell">
        <section className="signin-panel">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <p className="eyebrow">PRIVATE TEAM PLATFORM</p>
          <h1>inCruises<br />TEAM OS</h1>
          <p className="signin-copy">
            Сургалт, зөвшөөрөгдсөн контент, гишүүний амжилтыг нэг стандартын дагуу удирдана.
          </p>
          <a className="primary-button" href={chatGPTSignInPath("/")}>Нэвтэрч үргэлжлүүлэх</a>
          <p className="signin-note">Зөвхөн зөвшөөрөгдсөн багийн хэрэглэгч нэвтэрнэ.</p>
        </section>
      </main>
    );
  }

  return <TeamOsApp user={{ name: user.displayName, email: user.email }} />;
}
