import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support | inSuccess Team OS',
  description: 'Support information for the inSuccess Team OS mobile application.',
};

const card = { background: '#0a2236', border: '1px solid #173b55', borderRadius: 16, padding: 24 } as const;

export default function SupportPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#061729', padding: '64px 20px', color: '#fff' }}>
      <article style={{ maxWidth: 900, margin: '0 auto' }}>
        <p style={{ color: '#72b7ff', fontWeight: 800, letterSpacing: 2, margin: 0 }}>INSUCCESS TEAM OS</p>
        <h1 style={{ fontSize: 'clamp(40px, 7vw, 68px)', lineHeight: 1.05, margin: '18px 0' }}>App Support</h1>
        <p style={{ color: '#aec2d3', fontSize: 18, lineHeight: 1.7, maxWidth: 720 }}>
          Help for account access, learning progress, assigned tasks, and official resources in the inSuccess Team OS mobile app.
        </p>

        <div style={{ display: 'grid', gap: 16, marginTop: 40 }}>
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>Sign-in help</h2>
            <p style={{ color: '#aec2d3', lineHeight: 1.7, marginBottom: 0 }}>
              Confirm that you are using the email address registered for your team account. Passwords are case-sensitive. If your account was just created, complete any email-verification step before signing in.
            </p>
          </section>
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>Access pending</h2>
            <p style={{ color: '#aec2d3', lineHeight: 1.7, marginBottom: 0 }}>
              New accounts may display an access-pending screen until a team administrator activates the membership. Contact the administrator who invited you to the workspace.
            </p>
          </section>
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>Progress or tasks not updating</h2>
            <p style={{ color: '#aec2d3', lineHeight: 1.7, marginBottom: 0 }}>
              Check your internet connection, pull down to refresh, and reopen the app. If the issue continues, provide your registered email address, device model, iOS version, and a brief description to your team administrator.
            </p>
          </section>
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>Privacy and data requests</h2>
            <p style={{ color: '#aec2d3', lineHeight: 1.7, marginBottom: 0 }}>
              To request access, correction, or deletion of your account information, contact your team administrator. Please verify ownership of the registered account when making a request. Read our{' '}
              <a href="/privacy" style={{ color: '#68b7ff', fontWeight: 700 }}>Privacy Policy</a>.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
