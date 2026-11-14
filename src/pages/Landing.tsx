import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Hero, { type HeroStats } from '../components/Hero';
import DataSources from '../components/DataSources';
import { EVENTS } from '../data/events';
import { yearOf } from '../lib/format';
import { ArrowRight, MapPinIcon } from '../components/Icons';

export default function Landing() {
  const heroStats = useMemo<HeroStats>(() => {
    const nonDemo = EVENTS.filter((e) => e.verification !== 'demo');
    const counts = new Map<string, number>();
    nonDemo.forEach((e) => counts.set(e.state, (counts.get(e.state) ?? 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['—', 0];
    const years = EVENTS.map((e) => yearOf(e.date));
    return {
      totalEvents: EVENTS.length,
      documentedEvents: nonDemo.length,
      statesCovered: new Set(EVENTS.map((e) => e.state)).size,
      topRegion: top[0],
      topRegionCount: top[1],
      coverage: `${Math.min(...years)}–${Math.max(...years)}`,
    };
  }, []);

  return (
    <div className="landing-page">
      <Hero stats={heroStats} />

      <section className="section explore-section" id="explore">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Explore Modules</span>
            <h2 className="section-title">Disaster Intelligence Capabilities</h2>
            <p className="section-sub">
              Access dedicated geographical intelligence tools covering past flood &amp; climate disaster records, real-time weather alerts, and 30-day seismic events.
            </p>
          </div>

          <div className="feature-cards-grid">
            {/* Card 1: Historical Data Map */}
            <Link to="/historical" className="feature-card" aria-label="Open Historical Data Map">
              <div className="fc-top">
                <div className="fc-icon-wrap" style={{ background: 'rgba(22, 169, 154, 0.12)', color: 'var(--teal-600)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                    <line x1="8" y1="2" x2="8" y2="18"></line>
                    <line x1="16" y1="6" x2="16" y2="22"></line>
                  </svg>
                </div>
                <span className="badge badge-verified">{EVENTS.length} Events</span>
              </div>
              <h3 className="fc-title">Historical Data Map</h3>
              <p className="fc-desc">
                Explore a decade of water disasters on an interactive map, with historical records and national analytics.
              </p>
              <div className="fc-action">
                <span>Explore Map</span>
                <span className="fc-arrow"><ArrowRight size={16} /></span>
              </div>
            </Link>

            {/* Card 2: Live Weather & Hazard Alerts */}
            <Link to="/live-alerts" className="feature-card" aria-label="Open Live Weather and Hazard Alerts">
              <div className="fc-top">
                <div className="fc-icon-wrap" style={{ background: 'rgba(224, 82, 82, 0.12)', color: 'var(--red)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <span className="badge badge-reported" style={{ background: 'rgba(224,82,82,0.12)', color: 'var(--red)' }}>
                  <span className="badge-dot" style={{ background: 'var(--red)' }}></span> Live
                </span>
              </div>
              <h3 className="fc-title">Live Weather &amp; Hazard Alerts</h3>
              <p className="fc-desc">
                Real-time weather warnings and hazard alerts across India relayed from NDMA SACHET.
              </p>
              <div className="fc-action">
                <span>View Alerts</span>
                <span className="fc-arrow"><ArrowRight size={16} /></span>
              </div>
            </Link>

            {/* Card 3: Seismic Activity */}
            <Link to="/earthquakes" className="feature-card" aria-label="Open Seismic Activity Map">
              <div className="fc-top">
                <div className="fc-icon-wrap" style={{ background: 'rgba(244, 181, 68, 0.16)', color: '#b27514' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </div>
                <span className="badge badge-demo">Last 30 days</span>
              </div>
              <h3 className="fc-title">Seismic Activity</h3>
              <p className="fc-desc">
                Earthquake map for the last 30 days with seismic zones and magnitudes from NCS.
              </p>
              <div className="fc-action">
                <span>Open Seismic Map</span>
                <span className="fc-arrow"><ArrowRight size={16} /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Transparency section immediately below the cards */}
      <DataSources />
    </div>
  );
}
