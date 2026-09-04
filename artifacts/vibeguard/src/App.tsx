import { useEffect } from 'react';
import OriginalApp from './AppOriginal';
import AffiliatePage from './pages/AffiliatePage';
import AffiliateWelcomePopup from './components/AffiliateWelcomePopup';
import SEOPage from './pages/SEOPage';
import CheckoutPage from './pages/CheckoutPage';
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

export default function App() {
  const rawPath = window.location.pathname.replace(/\/$/, '') || '/';

  // Dodo's successful-payment return URL historically used /dashboard, but
  // the main app's Wouter router intentionally serves the dashboard at '/'.
  // Normalize the legacy return path synchronously so users never hit the
  // NotFound screen after a successful payment. Keep the query string so the
  // dashboard can still know this was an upgrade return.
  if (rawPath === '/dashboard') {
    window.history.replaceState(null, '', `/?${window.location.search.replace(/^\?/, '') || 'upgraded=true'}`);
  }

  const path = rawPath === '/dashboard' ? '/' : rawPath;
  const isAffiliatePage = path === '/refer';
  const isCheckoutPage = path === '/checkout';
  const isAdminPage = path === '/admin';

  if (isAdminPage) return <><BrandMigration /><AuthProvider><AdminPage /></AuthProvider></>;
  if (isCheckoutPage) return <><BrandMigration /><AuthProvider><CheckoutPage /></AuthProvider></>;
  if (isAffiliatePage) return <><BrandMigration /><ReferralAttribution /><AuthProvider><AffiliatePage /></AuthProvider></>;
  if (SEO_PATHS.has(path)) return <AuthProvider><SEOPage path={path} /></AuthProvider>;
  return <><BrandMigration /><ReferralAttribution /><OriginalApp /><AffiliateWelcomePopup /></>;
}
