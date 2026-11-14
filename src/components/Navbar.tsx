import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { STATES } from '../data/states';
import { EVENTS } from '../data/events';
import { categoryLabel } from '../data/categories';
import { BrandMark, SearchIcon, MenuIcon, CloseIcon, MapPinIcon } from './Icons';
import { useSelection } from '../context/SelectionContext';

interface Props {
  onSelectState?: (name: string) => void;
  onSelectEvent?: (id: string) => void;
}

const LINKS = [
  { label: 'Home', to: '/', exact: true },
  { label: 'Disaster Map', to: '/historical#map' },
  { label: 'Historical Data', to: '/historical' },
  { label: 'Disaster Analytics', to: '/historical#analytics' },
  { label: 'Live Alerts', to: '/live-alerts' },
  { label: 'Earthquakes', to: '/earthquakes' },
  { label: 'About Us', to: '/#about' },
];

export default function Navbar({ onSelectState, onSelectEvent }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { selectTargetState, selectTargetEvent } = useSelection();

  useEffect(() => {
    if (searchOpen) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return { states: STATES.slice(0, 6), events: [] as typeof EVENTS };
    const states = STATES.filter((x) => x.name.toLowerCase().includes(s) || x.capital.toLowerCase().includes(s)).slice(0, 6);
    const events = EVENTS.filter((x) => `${x.name} ${x.district} ${x.location} ${x.state}`.toLowerCase().includes(s)).slice(0, 7);
    return { states, events };
  }, [q]);

  const goState = (name: string) => {
    setSearchOpen(false);
    selectTargetState(name);
    if (onSelectState) onSelectState(name);
    navigate('/historical#map');
    setTimeout(() => {
      document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const goEvent = (id: string) => {
    setSearchOpen(false);
    selectTargetEvent(id);
    if (onSelectEvent) onSelectEvent(id);
    navigate('/historical#map');
    setTimeout(() => {
      document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Determine active state for each link
  const isLinkActive = (link: typeof LINKS[0]) => {
    const [path, hash] = link.to.split('#');
    if (hash) {
      return location.pathname === path && location.hash === `#${hash}`;
    }
    if (link.exact) {
      return location.pathname === '/' && !location.hash;
    }
    return location.pathname === path;
  };

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link className="brand" to="/" aria-label="JalDrishti home" onClick={() => setMenuOpen(false)}>
            <BrandMark />
            <span>
              <span className="brand-name">JalDrishti</span>
              <br />
              <span className="brand-tag">Water Disaster Intelligence</span>
            </span>
          </Link>
          <div className={`nav-links${menuOpen ? ' open' : ''}`}>
            {LINKS.map((l) => {
              const active = isLinkActive(l);
              return (
                <Link
                  key={l.label}
                  className={`nav-link${active ? ' active' : ''}`}
                  to={l.to}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
          <div className="nav-right">
            <button className="btn-icon" onClick={() => setSearchOpen(true)} aria-label="Search">
              <SearchIcon />
            </button>
            <button className="btn-icon nav-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </nav>

      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-box" onClick={(e) => e.stopPropagation()}>
            <div className="search-input-row">
              <SearchIcon size={20} />
              <input
                ref={inputRef}
                value={q}
                placeholder="Search a state, district or disaster event…"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (results.states[0]) goState(results.states[0].name);
                    else if (results.events[0]) goEvent(results.events[0].id);
                  }
                }}
              />
              <button className="btn-icon" onClick={() => setSearchOpen(false)} aria-label="Close search">
                <CloseIcon />
              </button>
            </div>
            <div className="search-results">
              {results.states.length === 0 && results.events.length === 0 && (
                <div className="search-empty">No matches for “{q}”. Try a state or district name.</div>
              )}
              {results.states.map((s) => (
                <div key={s.name} className="search-result" onClick={() => goState(s.name)}>
                  <MapPinIcon />
                  <span>
                    <span className="sr-kind">{s.type}</span>
                    <div className="sr-title">{s.name}</div>
                    <div className="sr-sub">
                      {s.capital} · {s.region} India
                    </div>
                  </span>
                </div>
              ))}
              {results.events.map((e) => (
                <div key={e.id} className="search-result" onClick={() => goEvent(e.id)}>
                  <span className="badge-dot" style={{ background: 'var(--teal)' }} />
                  <span>
                    <span className="sr-kind">{categoryLabel(e.category)}</span>
                    <div className="sr-title">{e.name}</div>
                    <div className="sr-sub">
                      {e.district}, {e.state}
                    </div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
