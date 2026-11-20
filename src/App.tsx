import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Landing from './pages/Landing';
import Historical from './pages/Historical';
import LiveAlerts from './pages/LiveAlerts';
import Earthquakes from './pages/Earthquakes';
import Subscribe from './pages/Subscribe';
import GoogleMapExplorer from './pages/GoogleMapExplorer';

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  return (
    <>
      {gmpQuotaExceeded && (
        <div className="gmp-quota-banner" role="status" aria-live="polite">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/historical" element={<Historical />} />
        <Route path="/live-alerts" element={<LiveAlerts />} />
        <Route path="/earthquakes" element={<Earthquakes />} />
        <Route path="/google-map" element={<GoogleMapExplorer />} />
        <Route path="/subscribe" element={<Subscribe />} />
        {/* 404 fallback redirect to "/" */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  );
}
