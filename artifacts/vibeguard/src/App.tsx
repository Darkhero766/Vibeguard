import { useEffect } from 'react';
import OriginalApp from './AppOriginal';
import AffiliatePage from './pages/AffiliatePage';
import AffiliateWelcomePopup from './components/AffiliateWelcomePopup';
import { AuthProvider } from './contexts/AuthContext';
import { supabase } from './lib/supabase';

const REFERRAL_STORAGE_KEY = 'vs_referral_code';

function BrandMigration() {
  useEffect(() => {
    const replaceBrand = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      for (const text of nodes) {
        if (text.nodeValue?.includes('VibeGuard')) text.nodeValue = text.nodeValue.replaceAll('VibeGuard', 'VibeSane');
      }
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
  const isAffiliatePage = window.location.pathname.replace(/\/$/, '') === '/refer';

  if (isAffiliatePage) {
    return (
      <>
        <BrandMigration />
        <ReferralAttribution />
        <AuthProvider><AffiliatePage /></AuthProvider>
      </>
    );
  }

  return (
    <>
      <BrandMigration />
      <ReferralAttribution />
      <OriginalApp />
      <AffiliateWelcomePopup />
    </>
  );
}
