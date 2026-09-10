import { createRoot } from 'react-dom/client';

import App from './App';
import PublicScanPage from './pages/PublicScanPage';
import { AuthProvider } from './contexts/AuthContext';

import './index.css';

// Keep the dedicated public-scan route at the entry point as a hard fallback.
// This prevents the legacy Wouter router in AppOriginal from ever turning
// /scan-public into its 404 page, including after repeated mobile scans.
const path = window.location.pathname.replace(/\/$/, '') || '/';
const root = createRoot(document.getElementById('root')!);

if (path === '/scan-public') {
  root.render(
    <AuthProvider>
      <PublicScanPage />
    </AuthProvider>,
  );
} else {
  root.render(<App />);
}
