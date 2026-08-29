import { useEffect, useState } from 'react';
import { Activity, Crown, Database, GitBranch, Lock, RefreshCw, Search, ShieldCheck, Users, Zap } from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { supabase } from '@/lib/supabase';

type Overview = { users: number; proUsers: number; freeUsers: number; scans: number; protectedRepositories: number; events30d: number; proLimits: { monthlyScans: number; repositories: number } };
type UserRow = { id: string; email: string; created_at: string; plan: string; scans_used: number; scans_limit: number; pro_expires_at: string | null };

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string | number; detail?: string }) {
  return <div className="relative overflow-hidden border border-border bg-card p-5 shadow-[6px_6px_0_hsl(var(--foreground)/0.08)]">
    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/[0.10] blur-xl" />
    <div className="relative flex items-center justify-between"><Icon size={17} className="text-primary"/><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span></div>
    <div className="relative mt-5 text-[32px] font-black tracking-[-0.05em]">{value}</div>
    {detail && <div className="relative mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{detail}</div>}
  </div>;
}

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function api(path: string, options?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in as the administrator.');
    const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}), Authorization: `Bearer ${session.access_token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Admin request failed');
    return data;
  }

  async function load() {
    setLoading(true); setError('');
    try {
      const [stats, userData] = await Promise.all([api('/admin/overview'), api(`/admin/users?search=${encodeURIComponent(search)}`)]);
      setOverview(stats); setUsers(userData.users ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load admin data'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [search]);

  async function grantPro(userId: string, days = 30) {
    setBusy(userId); setError('');
    try { await api(`/admin/users/${userId}/pro`, { method: 'POST', body: JSON.stringify({ days }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not grant Pro'); }
    finally { setBusy(''); }
  }

  async function revokePro(userId: string) {
    setBusy(userId); setError('');
    try { await api(`/admin/users/${userId}/revoke-pro`, { method: 'POST' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke Pro'); }
    finally { setBusy(''); }
  }

  return <div className="flex min-h-[100dvh] flex-col bg-background"><Nav/><main className="flex-1">
    <section className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-16">
      <div className="relative overflow-hidden border-2 border-foreground bg-card p-6 shadow-[9px_9px_0_hsl(var(--foreground)/0.10)] sm:p-9">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full border border-primary/20 translate-x-1/3 -translate-y-1/3" />
        <div className="absolute right-10 top-10 h-28 w-28 rounded-full border border-primary/20" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary"><Crown size={14}/> VibeSane Command Center</div><h1 className="mt-4 text-[38px] font-black tracking-[-0.06em] sm:text-[52px]">Admin control.</h1><p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">Private operations dashboard for users, Pro access, scans and repository protection.</p></div>
          <button onClick={() => void load()} className="vg-button vg-focus inline-flex h-11 items-center justify-center gap-2 border border-foreground bg-background px-4 text-[11px] font-bold uppercase tracking-[0.08em]"><RefreshCw size={14}/> Refresh</button>
        </div>
      </div>

      {error && <div className="mt-5 border border-destructive/40 bg-destructive/[0.06] p-4 text-[12px] text-destructive">{error}</div>}

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat icon={Users} label="Users" value={overview?.users ?? '—'} />
        <Stat icon={Crown} label="Pro" value={overview?.proUsers ?? '—'} detail="active" />
        <Stat icon={Users} label="Free" value={overview?.freeUsers ?? '—'} />
        <Stat icon={Zap} label="Scans" value={overview?.scans ?? '—'} detail="monthly total" />
        <Stat icon={GitBranch} label="Repos" value={overview?.protectedRepositories ?? '—'} detail="protected" />
        <Stat icon={Activity} label="Activity" value={overview?.events30d ?? '—'} detail="last 30 days" />
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_340px]">
        <section className="border border-border bg-card">
          <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Accounts</div><h2 className="mt-1 text-[21px] font-bold">User management</h2></div><div className="relative w-full sm:w-72"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email" className="vg-focus h-10 w-full border border-border bg-background pl-9 pr-3 text-[12px] outline-none focus:border-primary"/></div></div>
          <div className="divide-y divide-border">{loading ? <div className="p-8 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Loading command center…</div> : users.length === 0 ? <div className="p-8 text-center text-[13px] text-muted-foreground">No users found.</div> : users.map(user => <div key={user.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate text-[13px] font-semibold">{user.email}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{user.plan === 'pro' ? 'PRO' : 'FREE'} · {user.scans_used}/{user.scans_limit} scans{user.pro_expires_at ? ` · expires ${new Date(user.pro_expires_at).toLocaleDateString()}` : ''}</div></div><div className="flex shrink-0 gap-2">{user.plan === 'pro' ? <button disabled={busy===user.id} onClick={()=>void revokePro(user.id)} className="vg-button vg-focus border border-border bg-background px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] disabled:opacity-50">Revoke</button> : <button disabled={busy===user.id} onClick={()=>void grantPro(user.id)} className="vg-button vg-focus border border-primary bg-primary px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-primary-foreground disabled:opacity-50">+30d Pro</button>}</div></div>)}</div>
        </section>

        <aside className="space-y-4">
          <div className="border-2 border-primary bg-gradient-to-br from-primary/[0.13] via-card to-accent/[0.10] p-6 shadow-[7px_7px_0_hsl(var(--foreground)/0.10)]"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary"><ShieldCheck size={15}/> Pro controls</div><div className="mt-5 grid grid-cols-2 gap-3"><div className="border border-border bg-background/60 p-4"><div className="text-[25px] font-black">{overview?.proLimits.monthlyScans ?? 10}</div><div className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">scans / month</div></div><div className="border border-border bg-background/60 p-4"><div className="text-[25px] font-black">{overview?.proLimits.repositories ?? 5}</div><div className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">repos / user</div></div></div></div>
          <div className="border border-border bg-card p-6"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><Database size={14}/> Operations</div><div className="mt-4 space-y-3 text-[12px]"><div className="flex justify-between"><span className="text-muted-foreground">Plan</span><b>Pro v1</b></div><div className="flex justify-between"><span className="text-muted-foreground">Price</span><b>$11.99 / month</b></div><div className="flex justify-between"><span className="text-muted-foreground">Protection</span><b>5 repositories</b></div><div className="flex justify-between"><span className="text-muted-foreground">Access</span><b className="inline-flex items-center gap-1"><Lock size={11}/> Admin only</b></div></div></div>
        </aside>
      </div>
    </section>
  </main><Footer/></div>;
}
