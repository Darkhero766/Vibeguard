import { useMemo, useState } from "react";
import { ArrowRight, Check, Globe, Loader2, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { apiUrl } from "@/lib/api";

type Status = "pass" | "review" | "missing";
type Severity = "high" | "medium" | "low";
type AuditCheck = { id: string; category: string; title: string; status: Status; severity: Severity; explanation: string; recommendation: string };
type Report = { url: string; scannedAt: string; score: number; passed: number; review: number; missing: number; checks: AuditCheck[]; quota?: { scansUsed: number; scansLimit: number } };

const statusLabel: Record<Status, string> = { pass: "PASS", review: "REVIEW", missing: "MISSING" };

function statusClasses(status: Status) {
  if (status === "pass") return "border-[#8fae63]/40 bg-[#edf4df] text-[#526b32]";
  if (status === "review") return "border-[#d6a65b]/40 bg-[#fbf0dc] text-[#8a5e20]";
  return "border-[#e83a2f]/30 bg-[#fbedeb] text-[#a52f27]";
}

function scoreLabel(score: number) {
  if (score >= 90) return "READY";
  if (score >= 75) return "NEEDS REVIEW";
  return "ATTENTION";
}

export default function AuditPage() {
  const { user, session, usage, usageLoading, refreshUsage } = useAuth();
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"all" | Status>("all");

  const remaining = user?.email?.trim().toLowerCase() === "nightowlclub72@gmail.com"
    ? "∞"
    : usage ? String(Math.max(0, usage.scans_limit - usage.scans_used)) : "—";

  const visibleChecks = useMemo(
    () => report?.checks.filter((item) => filter === "all" || item.status === filter) ?? [],
    [report, filter],
  );

  const runAudit = async () => {
    if (!session?.access_token) {
      window.location.assign("/auth?mode=signin");
      return;
    }
    if (!url.trim()) {
      setError("Enter your deployed website or app URL.");
      return;
    }
    setScanning(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch(apiUrl("/api/audit"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Audit failed. Please try again.");
      setReport(data as Report);
      await refreshUsage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-[#f3efe4] text-[#171916]">
        <Nav />
        <main className="mx-auto max-w-[1040px] px-5 py-20 sm:px-8">
          <div className="border-2 border-[#242522] bg-[#f8f5ed] p-8 text-center text-[#171916] shadow-[8px_8px_0_#e83a2f]">
            <ShieldCheck className="mx-auto text-[#e83a2f]" size={42} />
            <p className="mt-5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#c92e25]">SUE / Product Audit</p>
            <h1 className="mt-3 text-5xl font-extrabold tracking-[-0.05em]">Audit your product.</h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#50534d]">Sign in to run the 50-point launch-readiness audit against a deployed web product.</p>
            <Link href="/auth?mode=signin" className="mt-7 inline-flex items-center gap-2 border-2 border-[#e83a2f] bg-[#e83a2f] px-6 py-3 text-sm font-bold text-white shadow-[4px_4px_0_#242522]">Sign in <ArrowRight size={15} /></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#171512] text-[#f8f5ed]">
      <Nav />
      <main className="relative mx-auto w-full max-w-[1160px] px-5 pb-24 pt-10 sm:px-8 sm:pt-14 font-sans">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] opacity-40" style={{ backgroundImage: "linear-gradient(rgba(244,200,66,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(244,200,66,.07) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />

        <header className="relative z-10">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#f04a3f]">
            <span className="h-px w-10 bg-[#e83a2f]" />SUE / product audit <span className="border border-[#f4c842]/40 bg-[#f4c842]/10 px-2 py-1 text-[#f4c842]">50 CHECKS</span>
          </div>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_300px] lg:items-end">
            <div>
              <h1 className="text-[48px] font-extrabold leading-[.88] tracking-[-0.05em] sm:text-[72px]">Is your product<br /><span className="text-[#f4c842]">ready to ship?</span></h1>
              <p className="mt-6 max-w-2xl text-[14px] leading-6 text-[#555850]">Scan a deployed website or app landing page for legal, privacy, consent, AI, payment and trust signals that are easy to miss before launch.</p>
            </div>
            <div className="border-2 border-[#0a0b0a] bg-[#101211] p-5 shadow-[6px_6px_0_#e83a2f]">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#f4c842]">Audit perimeter</div>
              <div className="mt-3 flex items-center gap-2 text-[13px] font-extrabold"><span className="h-2.5 w-2.5 rounded-full bg-[#aeca7a] shadow-[0_0_12px_#aeca7a]" />LIVE WEB AUDIT</div>
              <div className="mt-2 font-mono text-[9px] text-[#8e928b]">SCANS REMAINING · {remaining}</div>
            </div>
          </div>
        </header>

        <section className="relative z-10 mt-10 border-2 border-[#242522] bg-[#fffdf7] p-5 text-[#171916] shadow-[8px_8px_0_#242522] sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-[#e83a2f]/40 bg-[#e83a2f]/10 text-[#c92e25] shadow-[3px_3px_0_#242522]"><Globe size={18} /></div>
            <div><div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#c92e25]">Public endpoint</div><h2 className="mt-1 text-[22px] font-extrabold">Enter your deployed URL</h2></div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runAudit(); }} placeholder="https://yourapp.com" className="h-14 min-w-0 flex-1 border-2 border-[#242522] bg-white px-4 font-mono text-[13px] outline-none focus:border-[#e83a2f]" />
            <button onClick={() => void runAudit()} disabled={scanning || usageLoading} className="flex h-14 items-center justify-center gap-2 border-2 border-[#e83a2f] bg-[#e83a2f] px-7 text-[12px] font-bold text-white shadow-[4px_4px_0_#242522] disabled:cursor-not-allowed disabled:opacity-60">
              {scanning ? <><Loader2 size={16} className="animate-spin" /> Scanning…</> : <>Run SUE <ArrowRight size={16} /></>}
            </button>
          </div>
          <p className="mt-4 border-t border-[#242522]/10 pt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6a6d65]">Public page only · no source code is stored · one scan from your monthly quota</p>
          {error && <div className="mt-4 border-2 border-[#b52b23]/30 bg-[#fbedeb] px-4 py-3 text-[12px] font-semibold text-[#8d211b]">{error}</div>}
        </section>

        <section className="relative z-10 mt-12">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#c92e25]">What SUE checks</div>
              <h2 className="mt-1 text-[32px] font-extrabold tracking-[-0.02em]">Six launch surfaces. One scan.</h2>
            </div>
            <p className="max-w-md text-[11px] leading-5 text-[#6b6e66]">Built for founders shipping fast, especially AI and vibe-coded products.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["01","LEGAL","Terms, privacy, refunds, cancellation and business identity."],
              ["02","PRIVACY","Collection, retention, deletion, sharing and user rights."],
              ["03","CONSENT","Cookies, analytics, marketing opt-out and consent signals."],
              ["04","AI","AI disclosure, data use, training and output limitations."],
              ["05","BUSINESS","Pricing, billing, renewal, payments and customer terms."],
              ["06","TRUST","Security contact, accessibility and legal-page discoverability."],
            ].map(([code, title, text]) => (
              <article key={code} className="min-h-[142px] border-2 border-[#242522] bg-[#fffdf7] p-5 text-[#171916] shadow-[5px_5px_0_#d6d0c3] transition-transform hover:-translate-y-0.5">
                <div className="font-mono text-[9px] font-bold tracking-[0.15em] text-[#e83a2f]">{code}</div>
                <h3 className="mt-4 text-[21px] font-extrabold">{title}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[#62655d]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {report && (
          <>
            <section className="relative z-10 mt-8 grid gap-5 lg:grid-cols-[320px_1fr]">
              <div className="border-2 border-[#0b0c0b] bg-[#101211] p-6 shadow-[8px_8px_0_#f4c842]">
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#f4c842]">Vibe Audit score</div>
                <div className="mt-4 flex items-end gap-3"><span className="text-[76px] font-extrabold leading-none text-[#f8f5ed]">{report.score}</span><span className="mb-2 text-sm text-[#9fa39a]">/ 100</span></div>
                <div className="mt-4 inline-flex items-center gap-2 border border-[#aeca7a]/30 bg-[#aeca7a]/10 px-3 py-2 font-mono text-[9px] font-bold tracking-[0.12em] text-[#b8ce91]"><span className="h-2 w-2 rounded-full bg-[#aeca7a]" />{scoreLabel(report.score)}</div>
                <p className="mt-5 text-[11px] leading-5 text-[#a9aca4]">This is a signal score, not a legal-compliance guarantee.</p>
              </div>
              <div className="grid grid-cols-3 border-2 border-[#242522] bg-[#f8f5ed] text-[#171916] shadow-[8px_8px_0_#242522]">
                <button onClick={() => setFilter("pass")} className="border-r border-[#242522]/15 p-5 text-left hover:bg-[#edf4df]"><div className="font-mono text-[9px] text-[#66763e]">PASSED</div><div className="mt-2 text-4xl font-extrabold">{report.passed}</div></button>
                <button onClick={() => setFilter("review")} className="border-r border-[#242522]/15 p-5 text-left hover:bg-[#fbf0dc]"><div className="font-mono text-[9px] text-[#8a5e20]">REVIEW</div><div className="mt-2 text-4xl font-extrabold">{report.review}</div></button>
                <button onClick={() => setFilter("missing")} className="p-5 text-left hover:bg-[#fbedeb]"><div className="font-mono text-[9px] text-[#a52f27]">MISSING</div><div className="mt-2 text-4xl font-extrabold">{report.missing}</div></button>
              </div>
            </section>

            <section className="relative z-10 mt-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#f04a3f]">Signal report</div><h2 className="mt-1 text-[28px] font-extrabold">50 launch-readiness checks</h2></div>
                <div className="flex gap-1 border border-white/10 bg-[#101211] p-1">
                  {(["all","pass","review","missing"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${filter === item ? "bg-[#f4c842] text-[#101111]" : "text-[#9fa39a]"}`}>{item}</button>)}
                </div>
              </div>
              <div className="grid gap-3">
                {visibleChecks.map((item) => (
                  <article key={item.id} className="group border-2 border-[#242522] bg-[#f8f5ed] p-5 text-[#171916] shadow-[5px_5px_0_#242522] transition-transform hover:-translate-y-0.5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border ${statusClasses(item.status)}`}>{item.status === "pass" ? <Check size={15} /> : item.status === "review" ? <Sparkles size={14} /> : <ShieldAlert size={14} />}</div>
                        <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-[#8b8e86]">{item.category} · {item.id}</div><h3 className="mt-1 text-[15px] font-extrabold">{item.title}</h3><p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#5c5f58]">{item.explanation}</p></div>
                      </div>
                      <span className={`shrink-0 self-start border px-3 py-2 font-mono text-[9px] font-bold tracking-[0.1em] ${statusClasses(item.status)}`}>{statusLabel[item.status]}</span>
                    </div>
                    {item.status !== "pass" && <div className="mt-4 border-t border-[#242522]/10 pt-3 text-[11px] font-semibold text-[#6d4b20]"><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#c92e25]">Recommended fix</span><div className="mt-1 text-[#50534d]">{item.recommendation}</div></div>}
                  </article>
                ))}
              </div>
            </section>

            <div className="relative z-10 mt-8 border-t border-[#242522]/15 pt-5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6b6e66]">
              <span>Audited · {report.url}</span><span className="mx-3">·</span><span>{new Date(report.scannedAt).toLocaleString()}</span>
              <p className="mt-3 max-w-3xl normal-case font-sans text-[10px] leading-5 text-[#858980]">SUE identifies publicly observable product signals and cannot verify every legal, regulatory, contractual, accessibility or security requirement. It is not legal advice and does not guarantee compliance.</p>
            </div>
          </>
        )}
        <section className="relative z-10 mt-12 grid gap-4 border-t-2 border-[#242522] pt-8 sm:grid-cols-3">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#c92e25]">01 / Paste</div>
            <p className="mt-2 text-[11px] leading-5 text-[#62655d]">Give SUE the public URL of your deployed product.</p>
          </div>
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#c92e25]">02 / Scan</div>
            <p className="mt-2 text-[11px] leading-5 text-[#62655d]">SUE follows relevant public legal and trust links and evaluates 50 signals.</p>
          </div>
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#c92e25]">03 / Fix</div>
            <p className="mt-2 text-[11px] leading-5 text-[#62655d]">Use the report to close obvious launch gaps before customers find them.</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
