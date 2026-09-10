import { useEffect, useRef } from 'react';
import OriginalApp from './AppOriginal';
import AffiliatePage from './pages/AffiliatePage';
import AffiliateWelcomePopup from './components/AffiliateWelcomePopup';
import SEOPage from './pages/SEOPage';
import CheckoutPage from './pages/CheckoutPage';
import PublicScanPage from './pages/PublicScanPage';
import AdminPage from './pages/AdminPage';
import { AuthProvider } from './contexts/AuthContext';
import { supabase } from './lib/supabase';

const REFERRAL_STORAGE_KEY = 'vs_referral_code';
const SEO_PATHS = new Set(['/github-security-scanner','/github-protection','/vibe-coding-security','/supabase-security','/nextjs-security']);

function BrandMigration() {
  useEffect(() => {
    const replaceBrand = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      for (const text of nodes) if (text.nodeValue?.includes('VibeGuard')) text.nodeValue = text.nodeValue.replaceAll('VibeGuard', 'VibeSane');
      if (document.title.includes('VibeGuard')) document.title = document.title.replaceAll('VibeGuard', 'VibeSane');
    };
    replaceBrand();
    const observer = new MutationObserver(replaceBrand);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function ReferralAttribution() {
  useEffect(() => {
    const claim = async () => {
      const code = localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (!code) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { error } = await supabase.rpc('claim_affiliate_referral', { p_code: code });
      if (!error) localStorage.removeItem(REFERRAL_STORAGE_KEY);
    };
    void claim();
  }, []);
  return null;
}

/**
 * Keeps the existing dashboard scan tabs intact while routing the Paste URL
 * action into the dedicated temporary public-scan experience. The existing
 * AppOriginal scan form is intentionally not used for public URL scans because
 * those scans have their own quota and must never become protected history.
 */
function PublicScanFlowBridge() {
  const startedRef = useRef(false);

  useEffect(() => {
    const onSubmit = (event: Event) => {
      const target = event.target as HTMLFormElement | null;
      if (!target || !(target instanceof HTMLFormElement)) return;
      const input = target.querySelector<HTMLInputElement>('#repo-url');
      if (!input) return;

      const repoUrl = input.value.trim().replace(/\/$/, '');
      if (!/^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repoUrl)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(`/scan-public?repo=${encodeURIComponent(repoUrl)}`);
    };

    document.addEventListener('submit', onSubmit, true);
    return () => document.removeEventListener('submit', onSubmit, true);
  }, []);

  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, '');
    if (path !== '/scan-public' || startedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const repo = params.get('repo');
    if (!repo) return;

    startedRef.current = true;
    let attempts = 0;
    const launch = () => {
      attempts += 1;
      const input = document.querySelector<HTMLInputElement>('input[placeholder="https://github.com/owner/repository"]');
      const button = input?.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!input || !button) {
        if (attempts < 30) window.setTimeout(launch, 100);
        return;
      }

      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, repo);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      window.setTimeout(() => button.click(), 80);
    };

    window.setTimeout(launch, 120);
  }, []);

  return null;
}

export default function App() {
  const rawPath = window.location.pathname.replace(/\/$/, '') || '/';

  if (rawPath === '/dashboard') {
    window.history.replaceState(null, '', `/?${window.location.search.replace(/^\?/, '') || 'upgraded=true'}`);
  }

  const path = rawPath === '/dashboard' ? '/' : rawPath;
  const isAffiliatePage = path === '/refer';
  const isCheckoutPage = path === '/checkout';
  const isPublicScanPage = path === '/scan-public';
  const isAdminPage = path === '/admin';

  if (isAdminPage) return <><BrandMigration /><AuthProvider><AdminPage /></AuthProvider></>;
  if (isCheckoutPage) return <><BrandMigration /><AuthProvider><CheckoutPage /></AuthProvider></>;
  if (isPublicScanPage) return <><BrandMigration /><AuthProvider><PublicScanFlowBridge /><PublicScanPage /></AuthProvider></>;
  if (isAffiliatePage) return <><BrandMigration /><ReferralAttribution /><AuthProvider><AffiliatePage /></AuthProvider></>;
  if (SEO_PATHS.has(path)) return <AuthProvider><SEOPage path={path} /></AuthProvider>;
  return <><BrandMigration /><ReferralAttribution /><PublicScanFlowBridge /><OriginalApp /><AffiliateWelcomePopup /></>;
}
