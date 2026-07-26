import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function TermsPage() {
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
            <h1 className="mt-5 text-[32px] font-extrabold tracking-[-0.045em]">Terms of Service</h1>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Last updated: July 2025 · <span className="text-[#a06427]">Placeholder — review before launch</span>
            </p>

            <div className="prose-vg mt-10 space-y-8 text-[14px] leading-7 text-foreground">
              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">1. Acceptance of Terms</h2>
                <p className="text-muted-foreground">
                  By accessing or using VibeGuard ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">2. Description of Service</h2>
                <p className="text-muted-foreground">
                  VibeGuard is a static security analysis tool that scans publicly accessible GitHub repositories for common security misconfigurations. The Service reads repository source files without cloning or executing any code, and returns a report of findings.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">3. Permitted Use</h2>
                <p className="text-muted-foreground">
                  You may use the Service to scan repositories you own or have explicit permission to audit. You may not use the Service for any unlawful purpose, to harass others, or in any way that could damage or impair the Service.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">4. No Warranty</h2>
                <p className="text-muted-foreground">
                  The Service is provided "as is" without warranties of any kind. VibeGuard does not guarantee that scans are complete, accurate, or free from errors. Security findings are heuristic and may include false positives or miss actual issues. This tool is not a substitute for a professional security audit.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">5. Limitation of Liability</h2>
                <p className="text-muted-foreground">
                  To the maximum extent permitted by law, VibeGuard shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of, or inability to use, the Service.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">6. Data & Privacy</h2>
                <p className="text-muted-foreground">
                  VibeGuard scans publicly available source code only. We do not store the contents of any scanned repository. Your account information (email address) and scan usage count are stored to enforce usage limits. See our <a href="/privacy" className="text-primary underline underline-offset-4">Privacy Policy</a> for details.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">7. Changes to Terms</h2>
                <p className="text-muted-foreground">
                  We reserve the right to update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the revised Terms.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-[18px] font-bold tracking-[-0.03em]">8. Contact</h2>
                <p className="text-muted-foreground">
                  Questions about these Terms? Contact us at [email placeholder].
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
