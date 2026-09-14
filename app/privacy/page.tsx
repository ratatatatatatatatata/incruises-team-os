import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | inSuccess Team OS',
  description: 'Privacy policy for the inSuccess Team OS mobile application.',
};

const sectionStyle = { marginTop: 32 } as const;
const headingStyle = { color: '#f4f9fd', fontSize: 24, marginBottom: 10 } as const;
const bodyStyle = { color: '#aec2d3', fontSize: 16, lineHeight: 1.75, margin: 0 } as const;

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#061729', padding: '64px 20px', color: '#fff' }}>
      <article style={{ maxWidth: 820, margin: '0 auto', background: '#0a2236', border: '1px solid #173b55', borderRadius: 20, padding: 'clamp(28px, 6vw, 64px)' }}>
        <p style={{ color: '#72b7ff', fontWeight: 800, letterSpacing: 2, margin: 0 }}>INSUCCESS TEAM OS</p>
        <h1 style={{ fontSize: 'clamp(38px, 7vw, 64px)', lineHeight: 1.05, margin: '18px 0' }}>Privacy Policy</h1>
        <p style={bodyStyle}>Effective date: September 14, 2026</p>
        <p style={{ ...bodyStyle, marginTop: 24 }}>
          inSuccess Team OS is a private learning and team-productivity application for authorized members. This policy explains what information the app processes, why it is used, and the choices available to users.
        </p>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Information we process</h2>
          <p style={bodyStyle}>
            We process account information such as your name, email address, internal user ID, and membership role. We also process content and activity you create in the app, including lesson progress, completed lessons, assigned tasks, task status, and related team-workflow information.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>How information is used</h2>
          <p style={bodyStyle}>
            Information is used only to authenticate users, provide the app&apos;s learning and task-management features, save progress, display authorized team resources, maintain account security, and support normal app operations.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Service providers</h2>
          <p style={bodyStyle}>
            The app uses Supabase as a service provider for authentication, database storage, and secure delivery of app functionality. Service providers process information only to provide these services on our behalf and under their applicable security and privacy commitments.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>No advertising or tracking</h2>
          <p style={bodyStyle}>
            inSuccess Team OS does not sell personal information, show third-party advertising, use advertising identifiers, or track users across apps and websites owned by other companies.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>External resources</h2>
          <p style={bodyStyle}>
            The app may open official reference documents or websites in your browser. Those external services operate under their own privacy policies, and this policy does not control their practices.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Retention and deletion</h2>
          <p style={bodyStyle}>
            Account and activity information is retained while it is needed to provide the workspace, meet legitimate operational requirements, or protect the service. Users may request access, correction, or deletion of their account information through their team administrator or the support page below.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Security</h2>
          <p style={bodyStyle}>
            We use reasonable technical and organizational safeguards, including authenticated access and database access controls. No method of electronic storage or transmission is completely secure.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Children</h2>
          <p style={bodyStyle}>
            The app is intended for authorized team members and is not directed to children under 13. We do not knowingly collect personal information from children under 13.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Changes and contact</h2>
          <p style={bodyStyle}>
            We may update this policy when the app or legal requirements change. The effective date above will be revised when material changes are published. For privacy questions or data requests, visit the{' '}
            <a href="/support" style={{ color: '#68b7ff', fontWeight: 700 }}>inSuccess Team OS Support page</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
