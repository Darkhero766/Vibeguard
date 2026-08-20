import { useEffect } from 'react';
import OriginalApp from './AppOriginal';
import AffiliatePage from './pages/AffiliatePage';
import { AuthProvider } from './contexts/AuthContext';

function BrandMigration() {
  useEffect(() => {
    const replaceBrand = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      for (const text of nodes) {
        if (text.nodeValue?.includes('VibeGuard')) {
          text.nodeValue = text.nodeValue.replaceAll('VibeGuard', 'VibeSane');
        }
      }
      if (document.title.includes('VibeGuard')) {
        document.title = document.title.replaceAll('VibeGuard', 'VibeSane');
      }
    };

    replaceBrand();
    const observer = new MutationObserver(replaceBrand);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

export default function App() {
  const isAffiliatePage = window.location.pathname.replace(/\/$/, '') === '/refer';

  if (isAffiliatePage) {
    return (
      <>
        <BrandMigration />
        <AuthProvider>
          <AffiliatePage />
        </AuthProvider>
      </>
    );
  }

  return (
    <>
      <BrandMigration />
      <OriginalApp />
    </>
  );
}
