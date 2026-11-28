import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const CHECKS = [
  { id: 'fetch',         label: 'Fetching repository files' },
  { id: 'rls',           label: 'RLS policy gaps' },
  { id: 'writes',        label: 'Unauthenticated database writes' },
  { id: 'service_role',  label: 'Client-side service keys' },
  { id: 'secrets',       label: 'Hardcoded secrets & .env files' },
  { id: 'rpc',           label: 'Security definer functions' },
  { id: 'cors',          label: 'CORS configuration' },
];

// ms each check stays in "running" before completing (last step held open)
const STEP_DURATIONS = [1100, 550, 480, 430, 500, 560, 420];

type CheckState = 'pending' | 'running' | 'complete';

export function ScanProgress() {
  const [states, setStates] = useState<CheckState[]>(CHECKS.map(() => 'pending'));
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 180; // initial delay before first check

    CHECKS.forEach((_, i) => {
      const isLast = i === CHECKS.length - 1;

      // Mark this check as running
      timeouts.push(
        setTimeout(() => {
          setStates(prev => {
            const next = [...prev];
            next[i] = 'running';
            return next;
          });
        }, elapsed),
      );

      // Complete it (skip for last — stays 'running' until scan finishes)
      if (!isLast) {
        elapsed += STEP_DURATIONS[i];
        timeouts.push(
          setTimeout(() => {
            setStates(prev => {
              const next = [...prev];
              next[i] = 'complete';
              return next;
            });
            setCompletedCount(i + 1);
          }, elapsed),
        );
        elapsed += 90; // gap between checks
      }
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);

  // Progress: each completed check = 1, the currently running one = 0.5
  const runningCount = states.filter(s => s === 'running').length;
  const rawProgress = ((completedCount + runningCount * 0.5) / CHECKS.length) * 100;

  return (
    <section className="vg-rise mt-10" aria-label="Scanning repository">
      {/* Header */}
      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        scanning repository
      </div>

      {/* Progress bar */}
      <div className="mt-5 h-2 w-full overflow-hidden border border-foreground bg-border">
        <div
          className="h-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${rawProgress}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>
          {completedCount} of {CHECKS.length} checks complete
        </span>
        <span className="tabular-nums">{Math.round(rawProgress)}%</span>
      </div>

      {/* Check rows */}
      <div className="mt-5 divide-y divide-border border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground)/.15)]">
        {CHECKS.map((check, i) => {
          const state = states[i];
          return (
            <div
              key={check.id}
              className="flex items-center gap-4 bg-card px-4 py-3.5 sm:px-5"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Status icon — fixed width to prevent layout shift */}
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                {state === 'complete' ? (
                  <span className="flex h-5 w-5 items-center justify-center bg-accent text-foreground">
                    <Check size={11} strokeWidth={2.5} />
                  </span>
                ) : state === 'running' ? (
                  <Loader2 size={15} className="animate-spin text-primary" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                )}
              </div>

              <span
                className={`text-[13px] font-medium transition-colors duration-300 ${
                  state === 'complete'
                    ? 'text-muted-foreground/60'
                    : state === 'running'
                      ? 'text-foreground'
                      : 'text-muted-foreground/35'
                }`}
              >
                {check.label}
              </span>

              {state === 'running' && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-primary/70">
                  running
                </span>
              )}
              {state === 'complete' && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[#66763e]/70">
                  done
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
