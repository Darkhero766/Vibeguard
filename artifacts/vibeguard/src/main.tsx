import { createRoot } from 'react-dom/client';

import App from './App';
import PublicScanPage from './pages/PublicScanPage';
import { AuthProvider } from './contexts/AuthContext';

import './index.css';

// Only the isolated staging build has this marker. No secrets or credentials
// are embedded in the browser bundle.
const isStaging = import.meta.env.VITE_DEPLOYMENT_ENV === 'staging';
const stagingNotice = isStaging ? (
  <div role="status" className="relative z-50 border-b border-amber-600 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-950">
    VibeSane STAGING — test accounts and test repositories only. No real purchases.
  </div>
) : null;

// Keep the dedicated public-scan route at the entry point as a hard fallback.
// This prevents the legacy Wouter router in AppOriginal from ever turning
// /scan-public into its 404 page, including after repeated mobile scans.
const path = window.location.pathname.replace(/\/$/, '') || '/';
const root = createRoot(document.getElementById('root')!);

if (path === '/scan-public') {
  root.render(
    <>
      {stagingNotice}
      <AuthProvider>
        <PublicScanPage />
      </AuthProvider>
    </>,
  );
} else {
  root.render(<>{stagingNotice}<App /></>);
}
