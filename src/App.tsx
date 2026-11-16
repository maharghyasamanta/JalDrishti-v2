import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Landing from './pages/Landing';
import Historical from './pages/Historical';
import LiveAlerts from './pages/LiveAlerts';
import Earthquakes from './pages/Earthquakes';
import Subscribe from './pages/Subscribe';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/historical" element={<Historical />} />
        <Route path="/live-alerts" element={<LiveAlerts />} />
        <Route path="/earthquakes" element={<Earthquakes />} />
        <Route path="/subscribe" element={<Subscribe />} />
        {/* 404 fallback redirect to "/" */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  );
}
