import { Link } from 'wouter';

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-[1040px] px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[12px] leading-5 text-muted-foreground">
            VibeSane scans public repositories only and does not store submitted code.
            This tool is not a substitute for a full security audit.
          </p>
          <div className="flex shrink-0 items-center gap-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
