import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function PrivacyPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-[720px] px-5 py-16 sm:px-8">
          <div className="vg-rise">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              <span className="inline-block h-px w-8 bg-primary" />
              Legal
            </div>
            <h1 className="mt-5 text-[32px] font-extrabold tracking-[-0.045em]">Privacy Policy</h1>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Last updated: July 2026
            </p>

            <div className="mt-10 space-y-8 text-[14px] leading-7 text-foreground">
              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">What we collect</h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li><span className="font-semibold text-foreground">Email address</span> — collected when you create an account, used for authentication only.</li>
                  <li><span className="font-semibold text-foreground">Scan usage count</span> — the number of scans you have run, stored to enforce the per-account limit (1 scan on the free tier).</li>
                  <li><span className="font-semibold text-foreground">Repository URL</span> — the URL you submit for scanning. This is used only to perform the scan and is not stored after the scan completes.</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">What we do NOT collect</h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li>We do not store the source code of any scanned repository. VibeGuard only scans public repositories, and the temporary copy used during a scan is deleted immediately afterwards.</li>
                  <li>We do not sell or share your personal data with third parties for advertising.</li>
                  <li>We do not track you across other websites.</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">Scan results</h2>
                <p className="text-muted-foreground">
                  Scan findings are returned directly to your browser session and are not stored on our servers. VibeGuard's checks are automated and heuristic — they are not a substitute for a professional security audit.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">Authentication</h2>
                <p className="text-muted-foreground">
                  Authentication is handled by Supabase Auth. Passwords are hashed and never stored in plain text. If you sign in with a third-party provider, we receive only the email address from that provider.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">Data retention</h2>
                <p className="text-muted-foreground">
                  Your account data (email and usage count) is retained for as long as your account exists. You may request account deletion by opening an issue on our GitHub repository, after which all personal data will be removed within 30 days.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">Security</h2>
                <p className="text-muted-foreground">
                  We use Row-Level Security (RLS) in our database to ensure each user can only access their own data. All data in transit is encrypted via HTTPS.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">Contact</h2>
                <p className="text-muted-foreground">
                  For privacy-related questions or data deletion requests, open an issue on our{' '}
                  <a href="https://github.com/Darkhero766/Vibeguard" className="text-primary underline underline-offset-4" target="_blank" rel="noopener noreferrer">GitHub repository</a>.
                </p>
              </section>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
