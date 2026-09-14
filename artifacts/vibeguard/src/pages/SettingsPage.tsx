import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Bell, ChevronRight, CircleUserRound, CreditCard, Database, Github, KeyRound, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun, Trash2, Download, AlertTriangle, Check, ExternalLink } from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_EMAIL = 'nightowlclub72@gmail.com';

type ToggleProps = { checked: boolean; onChange: (value: boolean) => void; label: string };
function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 border-2 border-foreground transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}>
      <span className={`absolute top-0.5 h-3.5 w-3.5 bg-background transition-transform ${checked ? 'left-[21px]' : 'left-0.5'}`} />
    </button>
  );
}

function Section({ icon: Icon, eyebrow, title, children }: { icon: typeof ShieldCheck; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="vg-rise relative overflow-hidden border-2 border-foreground bg-card shadow-[7px_7px_0_hsl(var(--foreground))]">
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full border border-primary/20 bg-primary/[0.06] shadow-[inset_0_0_35px_hsl(var(--primary)/.10)]" />
      <div className="absolute right-5 top-5 h-2 w-2 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--primary))]" />
      <div className="border-b border-border bg-background/40 px-5 py-5 sm:px-7">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center border border-primary/40 bg-primary/10 text-primary shadow-[3px_3px_0_hsl(var(--foreground))]"><Icon size={17} /></div>
          <div><div className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">{eyebrow}</div><h2 className="mt-1 text-[25px] leading-none">{title}</h2></div>
        </div>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function Row({ label, description, children, danger = false }: { label: string; description?: string; children?: React.ReactNode; danger?: boolean }) {
  return <div className={`flex flex-col gap-4 border-b border-border/70 px-5 py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-7 ${danger ? 'bg-destructive/[0.035]' : ''}`}><div className="min-w-0"><div className={`text-[13px] font-semibold ${danger ? 'text-destructive' : 'text-foreground'}`}>{label}</div>{description && <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">{description}</p>}</div>{children}</div>;
}

export default function SettingsPage() {
  const { user, usage, signOut, hasGithubToken } = useAuth();
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [scanAlerts, setScanAlerts] = useState(true);
  const [productEmails, setProductEmails] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [signedOut, setSignedOut] = useState(false);

  const isAdmin = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
  const plan = isAdmin ? 'ADMIN' : usage?.plan === 'pro' ? 'PRO' : 'FREE';
  const displayName = user?.user_metadata?.full_name || user?.email || 'VibeSane user';
  const scans = isAdmin ? '∞' : usage ? `${Math.max(0, usage.scans_limit - usage.scans_used)}` : '—';

  useEffect(() => {
    const stored = localStorage.getItem('vibesane-theme') as 'system' | 'light' | 'dark' | null;
    const next = stored || 'system';
    setTheme(next);
    const apply = () => { const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); };
    apply();
  }, []);

  const changeTheme = (next: 'system' | 'light' | 'dark') => {
    setTheme(next);
    localStorage.setItem('vibesane-theme', next);
    const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  };

  const handleSignOut = async () => { setSignedOut(true); await signOut(); window.location.assign('/'); };

  if (!user) return <div className="min-h-[100dvh] bg-background text-foreground"><Nav /><main className="mx-auto max-w-[1040px] px-5 py-20 sm:px-8"><div className="border-2 border-foreground bg-card p-8 text-center shadow-[7px_7px_0_hsl(var(--foreground))]"><ShieldCheck className="mx-auto text-primary" size={30} /><h1 className="mt-5 text-4xl">Sign in to settings</h1><p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">Your account, security and billing controls live here.</p><Link href="/auth?mode=signin" className="vg-button mt-7 inline-flex border-2 border-primary bg-primary px-6 py-3 text-sm font-bold text-primary-foreground">Sign in <ChevronRight size={16} /></Link></div></main><Footer /></div>;

  return (
    <div className="vg-noise min-h-[100dvh] bg-background text-foreground">
      <Nav />
      <main className="relative mx-auto w-full max-w-[1080px] px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[460px] vg-grid opacity-40" />
        <div className="pointer-events-none absolute right-[5%] top-20 -z-0 h-44 w-44 rounded-full border border-primary/15 shadow-[inset_0_0_55px_hsl(var(--primary)/.08)]" />
        <div className="relative z-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="vg-rise"><div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"><span className="h-px w-8 bg-primary" />Control center</div><h1 className="mt-4 text-[48px] leading-[.88] sm:text-[64px]">Settings</h1><p className="mt-5 max-w-xl text-[14px] leading-6 text-muted-foreground">Account, security, scan behavior and data controls. Built for the same security-first workflow as the rest of VibeSane.</p></div>
          <div className="relative overflow-hidden border-2 border-foreground bg-[#101111] px-5 py-4 text-[#f4f1ea] shadow-[6px_6px_0_hsl(var(--primary))] sm:min-w-[245px]"><div className="absolute -right-7 -top-7 h-20 w-20 rounded-full border border-[#f4c842]/30" /><div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#f4c842]">Account perimeter</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-[#aeca7a] shadow-[0_0_12px_#aeca7a]" />{plan} ACCESS</div><div className="mt-1 truncate font-mono text-[9px] text-[#92958e]">{user.email}</div></div>
        </div>
        <div className="relative z-10 mt-12 grid gap-7 lg:grid-cols-[1fr_1fr]">
          <Section icon={CircleUserRound} eyebrow="Identity" title="Account">
            <Row label="Profile" description="Your display name and account email."><div className="text-right"><div className="text-[13px] font-semibold">{displayName}</div><div className="mt-1 max-w-[230px] truncate font-mono text-[10px] text-muted-foreground">{user.email}</div></div></Row>
            <Row label="Password & sign-in" description="Manage authentication and active sign-in sessions."><button className="vg-button border border-border bg-background px-4 py-2 text-[11px] font-semibold">Manage <ChevronRight className="inline" size={13} /></button></Row>
            <Row label="Connected GitHub" description={hasGithubToken ? 'GitHub access is connected for repository workflows.' : 'No GitHub token is currently connected.'}><span className={`inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase ${hasGithubToken ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}><Github size={13} />{hasGithubToken ? 'Connected' : 'Not connected'}</span></Row>
            <Row label="Log out" description="End the current VibeSane session on this device."><button disabled={signedOut} onClick={handleSignOut} className="vg-button flex items-center gap-2 border border-border bg-background px-4 py-2 text-[11px] font-semibold"><LogOut size={13} />{signedOut ? 'Signing out…' : 'Log out'}</button></Row>
          </Section>
          <Section icon={CreditCard} eyebrow="Commercial" title="Plan & billing">
            <Row label="Current plan" description={isAdmin ? 'Administrative account with unlimited scan access.' : plan === 'PRO' ? 'Your Pro entitlement is active.' : 'Free plan with the current starter allowance.'}><span className="border-2 border-primary bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{plan}</span></Row>
            <Row label="Scan allowance" description="Current allowance reported by the authoritative usage record."><span className="font-mono text-[20px] font-bold">{scans}<span className="ml-1 text-[10px] font-normal text-muted-foreground">remaining</span></span></Row>
            <Row label="Subscription management" description="Manage your active subscription, payment method and invoices."><Link href="/pricing" className="vg-button flex items-center gap-2 border border-primary bg-primary px-4 py-2 text-[11px] font-bold text-primary-foreground">Open billing <ExternalLink size={12} /></Link></Row>
            <Row label="Billing history" description="Invoice and payment history will appear here as billing data becomes available."><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Account billing</span></Row>
          </Section>
          <Section icon={ShieldCheck} eyebrow="Defense layer" title="Security">
            <Row label="Security alerts" description="Get notified when VibeSane detects a critical or high-severity change."><Toggle checked={securityAlerts} onChange={setSecurityAlerts} label="Security alerts" /></Row>
            <Row label="GitHub connection" description="Repository access is handled through your connected GitHub identity."><Link href="/" className="vg-button flex items-center gap-2 border border-border bg-background px-4 py-2 text-[11px] font-semibold"><Github size={13} />Manage GitHub</Link></Row>
            <Row label="Two-factor authentication" description="Add an extra authentication layer. Available when 2FA support is enabled for your account."><span className="border border-border bg-muted px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Coming soon</span></Row>
            <Row label="Active sessions" description="Review and revoke sessions across your devices."><span className="border border-border bg-muted px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Coming soon</span></Row>
          </Section>
          <Section icon={Bell} eyebrow="Signal routing" title="Notifications">
            <Row label="Scan results" description="Notify me when a scan completes or fails."><Toggle checked={scanAlerts} onChange={setScanAlerts} label="Scan result notifications" /></Row>
            <Row label="Security findings" description="Critical and high-severity security events are always the priority."><Toggle checked={securityAlerts} onChange={setSecurityAlerts} label="Security finding notifications" /></Row>
            <Row label="Product updates" description="New features, product changes and important VibeSane announcements."><Toggle checked={productEmails} onChange={setProductEmails} label="Product update emails" /></Row>
            <Row label="Marketing emails" description="Optional educational and promotional messages."><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Off by default</span></Row>
          </Section>
          <Section icon={Database} eyebrow="Repository perimeter" title="Scan & repository data">
            <Row label="Protected repositories" description="Manage protected repositories and their monitoring state."><Link href="/" className="vg-button flex items-center gap-2 border border-border bg-background px-4 py-2 text-[11px] font-semibold">Open dashboard <ChevronRight size={13} /></Link></Row>
            <Row label="Public scan results" description="One-time public repository scans are temporary and are not added to protected repository history."><span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary"><Check size={12} />Temporary</span></Row>
            <Row label="Export my data" description="Request an export of personal and account data associated with your VibeSane account."><button onClick={() => alert('Data export request: contact support to initiate a verified export.')} className="vg-button flex items-center gap-2 border border-border bg-background px-4 py-2 text-[11px] font-semibold"><Download size={13} />Request export</button></Row>
            <Row label="Data retention" description="VibeSane should only retain data needed to operate your account, security history and billing obligations. Exact retention periods should match the published Privacy Policy."><Link href="/" className="font-mono text-[9px] uppercase tracking-[0.12em] text-primary">Privacy policy →</Link></Row>
          </Section>
          <Section icon={Palette} eyebrow="Interface" title="Appearance">
            <Row label="Theme" description="Choose how VibeSane looks on this device."><div className="grid grid-cols-3 border-2 border-foreground bg-background"><button onClick={() => changeTheme('system')} className={`flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-semibold ${theme === 'system' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Monitor size={12} />System</button><button onClick={() => changeTheme('light')} className={`flex items-center justify-center gap-1.5 border-l border-foreground px-3 py-2 text-[10px] font-semibold ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Sun size={12} />Light</button><button onClick={() => changeTheme('dark')} className={`flex items-center justify-center gap-1.5 border-l border-foreground px-3 py-2 text-[10px] font-semibold ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Moon size={12} />Dark</button></div></Row>
            <Row label="Interface language" description="Additional languages can be introduced without changing security workflows."><span className="font-mono text-[10px] uppercase text-muted-foreground">English</span></Row>
          </Section>
        </div>
        <section className="relative z-10 mt-8 overflow-hidden border-2 border-destructive/60 bg-destructive/[0.045] shadow-[7px_7px_0_hsl(var(--destructive)/.22)]">
          <div className="flex items-start gap-4 border-b border-destructive/20 px-5 py-5 sm:px-7"><div className="flex h-9 w-9 items-center justify-center border border-destructive/50 text-destructive"><AlertTriangle size={17} /></div><div><div className="font-mono text-[9px] uppercase tracking-[0.18em] text-destructive">Irreversible actions</div><h2 className="mt-1 text-[25px] leading-none">Danger zone</h2><p className="mt-2 max-w-2xl text-[11px] leading-5 text-muted-foreground">Account deletion is permanent. Before enabling the final deletion action, VibeSane must verify the account and remove associated application data safely.</p></div></div>
          <div className="px-5 py-5 sm:px-7">
            {!deleteOpen ? (
              <button onClick={() => setDeleteOpen(true)} className="vg-button flex items-center gap-2 border border-destructive bg-background px-4 py-2.5 text-[11px] font-bold text-destructive"><Trash2 size={14} />Delete account</button>
            ) : (
              <div className="max-w-xl border-2 border-destructive/40 bg-card p-5"><div className="flex gap-3"><KeyRound className="mt-0.5 shrink-0 text-destructive" size={17} /><div><h3 className="text-xl">Confirm account deletion</h3><p className="mt-2 text-[11px] leading-5 text-muted-foreground">This is a confirmation gate only. Type <strong className="text-foreground">DELETE</strong> to continue to the verified deletion flow. Do not delete anything until the server-side deletion operation is available.</p><input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="TYPE DELETE" className="vg-block-input mt-4 w-full bg-background px-3 py-2.5 font-mono text-xs uppercase" /><div className="mt-4 flex gap-2"><button disabled={deleteText !== 'DELETE'} className="vg-button flex items-center gap-2 border border-destructive bg-destructive px-4 py-2 text-[11px] font-bold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={13} />Verified deletion flow required</button><button onClick={() => { setDeleteOpen(false); setDeleteText(''); }} className="vg-button border border-border bg-background px-4 py-2 text-[11px] font-semibold">Cancel</button></div></div></div>
            )}
          </div>
        </section>
        <div className="relative z-10 mt-8 flex flex-col gap-2 border-t border-border pt-6 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>VibeSane · account control plane</span><span>Security-first by design</span></div>
      </main>
      <Footer />
    </div>
  );
}
