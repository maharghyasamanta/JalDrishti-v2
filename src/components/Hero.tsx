import { ArrowRight, InfoIcon } from './Icons';
import { Link } from 'react-router-dom';

export interface HeroStats {
  totalEvents: number;
  documentedEvents: number;
  statesCovered: number;
  topRegion: string;
  topRegionCount: number;
  coverage: string;
}

export default function Hero({ stats }: { stats: HeroStats }) {
  return (
    <header className="hero" id="home">
      <div className="hero-grid-bg" />
      <div className="hero-glow" />
      <div className="container hero-inner">
        <span className="eyebrow hero-eyebrow">Geographical Intelligence · 2015–2024</span>
        <h1>Explore India's <span className="accent">Water Disaster</span> History</h1>
        <p className="hero-sub">
          Discover a decade of water-related disasters across India's states and Union Territories
          through interactive geographical intelligence — floods, cloudbursts, GLOFs, storm surges and more.
        </p>
        <div className="hero-cta-row">
          <Link className="btn btn-primary" to="/historical">
            Explore Interactive Map <ArrowRight />
          </Link>
          <Link
            className="btn btn-ghost"
            to="/historical#analytics"
            style={{ color: '#dbe7f2', borderColor: 'rgba(141,220,229,.3)' }}
          >
            View Analytics
          </Link>
          <span className="hero-note"><InfoIcon /> Prototype dataset · sources attributed per record</span>
        </div>

        <div className="hero-stats">
          <div className="stat">
            <div className="stat-value">{stats.totalEvents}</div>
            <div className="stat-label">Events catalogued</div>
            <div className="stat-sub">{stats.documentedEvents} documented / reported · rest demo</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats.statesCovered}<span className="unit"> / 36</span></div>
            <div className="stat-label">States &amp; UTs covered</div>
            <div className="stat-sub">All 28 states + 8 Union Territories</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ fontSize: 22 }}>{stats.topRegion}</div>
            <div className="stat-label">Most catalogued region</div>
            <div className="stat-sub">{stats.topRegionCount} events in this dataset</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ fontSize: 24 }}>{stats.coverage}</div>
            <div className="stat-label">Historical coverage</div>
            <div className="stat-sub">Rolling 10-year default window</div>
          </div>
        </div>
      </div>
    </header>
  );
}
