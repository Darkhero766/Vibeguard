import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle, Bell, Check, ChevronRight, CircleUserRound, CreditCard, Database,
  Download, ExternalLink, Github, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun,
} from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_EMAIL = 'nightowlclub72@gmail.com';

type Theme = 'system' | 'light' | 'dark';

type ToggleProps = { checked: boolean; onChange: (value: boolean) => void; label: string };
function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border-2 transition ${checked ? 'border-[#e83a2f] bg-[#e83a2f]' : 'border-[#686a65] bg-[#dedbd2]'}`}
    >
      <span className={`absolute top-1 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-[left] ${checked ? 'left-[23px]' : 'left-1'}`} />
    </button>
  );
}

function Section({ icon: Icon, eyebrow, title, children }: { icon: typeof ShieldCheck; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[2px] border-2 border-[#242522] bg-[#f8f5ed] shadow-[8px_8px_0_#242522]">
      <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full border border-[#e83a2f]/20 bg-[#e83a2f]/[0.035]" />
      <div className="pointer-events-none absolute right-8 top-8 h-2 w-2 rounded-full bg-[#e83a2f] shadow-[0_0_16px_rgba(232,58,47,.55)]" />
      <div className="relative border-b-2 border-[#242522]/10 bg-[#efebe1] px-5 py-5 sm:px-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#e83a2f]/50 bg-[#e83a2f]/10 text-[#c92e25] shadow-[3px_3px_0_#242522]">
            <Icon size={18} />
          </div>
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#c92e25]">{eyebrow}</div>
            <h2 className="mt-1 font-sans text-[25px] font-extrabold leading-none tracking-tight text-[#171916]">{title}</h2>
          </div>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#242522]/10 px-5 py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-[#171916]">{label}</div>
        {description && <p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-[#50534d]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusChip({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return <span className={`inline-flex items-center gap-2 border-2 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${good ? 'border-[#9bbd65] bg-[#edf4df] text-[#4d672d]' : 'border-[#242522]/15 bg-[#ebe8df] text-[#555850]'}`}>{good && <span className="h-2 w-2 rounded-full bg-[#8eae58]" />}{children}</span>;
}

export default function SettingsPage() {
  const { user, usage, signOut, hasGithubToken } = useAuth();
  const [theme, setTheme] = useState<Theme>('system');
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [scanAlerts, setScanAlerts] = useState(true);
  const [productEmails, setProductEmails] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const isAdmin = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
  const plan = isAdmin ? 'ADMIN' : usage?.plan === 'pro' ? 'PRO' : 'FREE';
  const displayName = user?.user_metadata?.full_name || user?.email || 'VibeSane user';
  const scans = isAdmin ? '∞' : usage ? String(Math.max(0, usage.scans_limit - usage.scans_used)) : '—';

  useEffect(() => {
    const stored = localStorage.getItem('vibesane-theme') as Theme | null;
    const next = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setTheme(next);
    const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    localStorage.setItem('vibesane-theme', next);
    const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  };

  const handleSignOut = async () => {
    setSignedOut(true);
    await signOut();
    window.location.assign('/');
  };

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-[#171512] text-[#f8f5ed]">
        <Nav />
        <main className="mx-auto max-w-[1040px] px-5 py-20 sm:px-8">
          <div className="border-2 border-[#e83a2f] bg-[#242522] p-8 text-center shadow-[8px_8px_0_#e83a2f]">
            <ShieldCheck className="mx-auto text-[#f4c842]" size={38} />
            <h1 className="mt-5 text-5xl font-extrabold">Sign in to settings</h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#d2d0c8]">Your account, security, billing and data controls live here.</p>
            <Link href="/auth?mode=signin" className="mt-7 inline-flex items-center gap-2 border-2 border-[#e83a2f] bg-[#e83a2f] px-6 py-3 text-sm font-bold text-white shadow-[4px_4px_0_#0e0f0e]">Sign in <ChevronRight size={16} /></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#171512] text-[#f8f5ed]">
      <Nav />
      <main className="relative mx-auto w-full max-w-[1120px] px-5 pb-20 pt-9 sm:px-8 sm:pt-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(244,200,66,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(244,200,66,.09) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />

        <header className="relative z-10 mb-9 grid gap-6 lg:grid-cols-[1fr_350px] lg:items-end">
          <div>
            <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#f04a3f]"><span className="h-px w-10 bg-[#e83a2f]" />Control center</div>
            <h1 className="mt-4 text-[48px] font-extrabold leading-[.88] tracking-[-0.04em] text-[#f8f5ed] sm:text-[70px]">Settings</h1>
            <p className="mt-5 max-w-2xl text-[14px] leading-6 text-[#d1cec4]">Your VibeSane control room — account identity, protection, billing, notifications and data controls in one place.</p>
          </div>
          <div className="relative overflow-hidden border-2 border-[#090a09] bg-[#0f1110] px-5 py-5 shadow-[7px_7px_0_#e83a2f]">
            <div className="absolute -right-9 -top-9 h-28 w-28 rounded-full border border-[#f4c842]/20" />
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#f4c842]">Account perimeter</div>
            <div className="mt-3 flex items-center gap-2 text-sm font-extrabold text-[#f8f5ed]"><span className="h-2.5 w-2.5 rounded-full bg-[#aeca7a] shadow-[0_0_12px_#aeca7a]" />{plan} ACCESS</div>
            <div className="mt-1.5 truncate font-mono text-[9px] text-[#bfc2ba]">{user.email}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 font-mono text-[9px] uppercase tracking-[0.1em]"><span className="text-[#8f938d]">Scans remaining</span><span className="text-right text-[#f8f5ed]">{scans}</span></div>
          </div>
        </header>

        <div className="relative z-10 grid gap-7 lg:grid-cols-2">
          <Section icon={CircleUserRound} eyebrow="Identity" title="Account">
            <Row label="Profile" description="Your display name and account email."><div className="text-right"><div className="text-[13px] font-extrabold text-[#171916]">{displayName}</div><div className="mt-1 max-w-[240px] truncate font-mono text-[10px] text-[#62655e]">{user.email}</div></div></Row>
            <Row label="Password & sign-in" description="Manage authentication and active sign-in sessions."><StatusChip>Authentication</StatusChip></Row>
            <Row label="Connected GitHub" description={hasGithubToken ? 'GitHub access is connected for repository workflows.' : 'No GitHub connection is currently active.'}><StatusChip good={hasGithubToken}><Github size={13} />{hasGithubToken ? 'Connected' : 'Not connected'}</StatusChip></Row>
            <Row label="Log out" description="End the current VibeSane session on this device."><button disabled={signedOut} onClick={handleSignOut} className="flex items-center gap-2 border-2 border-[#242522] bg-[#242522] px-4 py-2 text-[11px] font-bold text-white shadow-[3px_3px_0_#e83a2f]"><LogOut size={13} />{signedOut ? 'Signing out…' : 'Log out'}</button></Row>
          </Section>

          <Section icon={CreditCard} eyebrow="Commercial" title="Plan & billing">
            <Row label="Current plan" description={isAdmin ? 'Administrative account with unlimited scan access.' : plan === 'PRO' ? 'Your Pro entitlement is active.' : 'Free plan with the current starter allowance.'}><StatusChip good={plan !== 'FREE'}>{plan}</StatusChip></Row>
            <Row label="Scan allowance" description="Live allowance reported by the authoritative usage record."><span className="font-mono text-[24px] font-extrabold text-[#171916]">{scans}<span className="ml-1 text-[10px] font-normal text-[#666961]">remaining</span></span></Row>
            <Row label="Subscription management" description="Manage your plan and payment details."><Link href="/pricing" className="flex items-center gap-2 border-2 border-[#e83a2f] bg-[#e83a2f] px-4 py-2 text-[11px] font-bold text-white shadow-[3px_3px_0_#242522]">Open billing <ExternalLink size={12} /></Link></Row>
          </Section>

          <Section icon={ShieldCheck} eyebrow="Defense layer" title="Security">
            <Row label="Security alerts" description="Get notified when VibeSane detects a critical or high-severity change."><Toggle checked={securityAlerts} onChange={setSecurityAlerts} label="Security alerts" /></Row>
            <Row label="GitHub connection" description="Repository access is handled through your connected GitHub identity."><span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#555850]">{hasGithubToken ? 'Connected' : 'Not connected'}</span></Row>
            <Row label="Two-factor authentication" description="An additional authentication layer can be enabled when supported."><StatusChip>Coming soon</StatusChip></Row>
            <Row label="Active sessions" description="Review and revoke sessions across your devices."><StatusChip>Coming soon</StatusChip></Row>
          </Section>

          <Section icon={Bell} eyebrow="Signal routing" title="Notifications">
            <Row label="Scan results" description="Notify me when a scan completes or fails."><Toggle checked={scanAlerts} onChange={setScanAlerts} label="Scan result notifications" /></Row>
            <Row label="Security findings" description="Critical and high-severity security events are the priority."><Toggle checked={securityAlerts} onChange={setSecurityAlerts} label="Security finding notifications" /></Row>
            <Row label="Product updates" description="New features, product changes and important VibeSane announcements."><Toggle checked={productEmails} onChange={setProductEmails} label="Product update emails" /></Row>
            <Row label="Marketing emails" description="Optional promotional messages. Off by default."><span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#666961]">Off by default</span></Row>
          </Section>

          <Section icon={Database} eyebrow="Repository perimeter" title="Scan & repository data">
            <Row label="Protected repositories" description="Manage protected repositories and their monitoring state."><Link href="/" className="flex items-center gap-2 border-2 border-[#242522] bg-[#f8f5ed] px-4 py-2 text-[11px] font-bold text-[#171916] shadow-[3px_3px_0_#242522]">Open dashboard <ChevronRight size={13} /></Link></Row>
            <Row label="Public scan results" description="One-time public scans are temporary and are not added to protected repository history."><span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#4d672d]"><Check size={12} />Temporary</span></Row>
            <Row label="Export my data" description="Request an export of personal and account data associated with VibeSane."><button onClick={() => window.alert('Data export request received. A verified support workflow is required before data is exported.')} className="flex items-center gap-2 border-2 border-[#242522] bg-[#f8f5ed] px-4 py-2 text-[11px] font-bold text-[#171916] shadow-[3px_3px_0_#242522]"><Download size={13} />Request export</button></Row>
          </Section>

          <Section icon={Palette} eyebrow="Interface" title="Appearance">
            <Row label="Theme" description="Choose how VibeSane looks on this device.">
              <div className="grid grid-cols-3 overflow-hidden rounded-sm border-2 border-[#242522] bg-[#ebe8df]">
                <button onClick={() => changeTheme('system')} className={`flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold ${theme === 'system' ? 'bg-[#242522] text-white' : 'text-[#555850]'}`}><Monitor size={12} />System</button>
                <button onClick={() => changeTheme('light')} className={`flex items-center justify-center gap-1.5 border-l-2 border-[#242522] px-3 py-2 text-[10px] font-bold ${theme === 'light' ? 'bg-[#242522] text-white' : 'text-[#555850]'}`}><Sun size={12} />Light</button>
                <button onClick={() => changeTheme('dark')} className={`flex items-center justify-center gap-1.5 border-l-2 border-[#242522] px-3 py-2 text-[10px] font-bold ${theme === 'dark' ? 'bg-[#242522] text-white' : 'text-[#555850]'}`}><Moon size={12} />Dark</button>
              </div>
            </Row>
            <Row label="Interface language" description="More languages can be added without changing security workflows."><span className="font-mono text-[10px] font-bold uppercase text-[#666961]">English</span></Row>
          </Section>
        </div>

        <section className="relative z-10 mt-8 overflow-hidden border-2 border-[#b52b23] bg-[#fbefec] shadow-[8px_8px_0_#7d211c]">
          <div className="flex items-start gap-4 border-b-2 border-[#b52b23]/15 px-5 py-5 sm:px-7">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#b52b23]/40 bg-[#e83a2f]/10 text-[#b52b23]"><AlertTriangle size={18} /></div>
            <div><div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#b52b23]">Irreversible</div><h2 className="mt-1 text-[28px] font-extrabold leading-none text-[#7d211c]">Danger zone</h2></div>
          </div>
          <div className="px-5 py-6 sm:px-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-[13px] font-extrabold text-[#7d211c]">Delete account</div><p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-[#5f4d49]">Account deletion requires a verified server-side workflow so authentication records, repository connections, scan history and billing state are handled safely.</p></div>
              <button onClick={() => window.alert('Account deletion is not enabled yet. Contact support for a verified deletion request.')} className="shrink-0 border-2 border-[#b52b23] bg-[#fff8f6] px-4 py-2 text-[11px] font-bold text-[#8d211b] shadow-[3px_3px_0_#7d211c]">Request deletion</button>
            </div>
          </div>
        </section>

        <div className="relative z-10 mt-8 grid gap-3 border-t border-white/10 pt-5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#92958e] sm:grid-cols-3">
          <span>VibeSane security control</span><span className="sm:text-center">No code stored</span><span className="sm:text-right">Account state · {plan}</span>
        </div>
      </main>
      <Footer />
    </div>
  );
}
