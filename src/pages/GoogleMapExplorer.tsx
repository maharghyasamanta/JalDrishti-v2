import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import GoogleDisasterMap, { type SelectedMapItem } from '../components/GoogleDisasterMap';
import { EVENTS } from '../data/events';
import { categoryColor, categoryLabel } from '../data/categories';
import { useIndiaGeo } from '../hooks/useIndiaGeo';
import { fetchEarthquakes, magColor, relativeTime, type EarthquakeData } from '../lib/earthquakes';
import { fetchSachetAlerts, DEMO_COASTAL_ALERT, formatUntil, SEVERITY_COLOR, type SachetData } from '../lib/sachet';
import { computeStateGeoSummaries } from '../lib/googleMapsData';
import { InfoIcon } from '../components/Icons';

export default function GoogleMapExplorer() {
  const geo = useIndiaGeo();
  const { search } = useLocation();
  const isDemoCoastal = useMemo(
    () => new URLSearchParams(search).get('demo') === 'coastal',
    [search],
  );

  const [alertsData, setAlertsData] = useState<SachetData | null>(null);
  const [quakesData, setQuakesData] = useState<EarthquakeData | null>(null);
  const [loadingFeeds, setLoadingFeeds] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showQuakes, setShowQuakes] = useState(true);
  const [showHistorical, setShowHistorical] = useState(true);
  const [focusState, setFocusState] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedMapItem | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadFeeds = useCallback(() => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoadingFeeds(true);

    Promise.allSettled([
      fetchSachetAlerts(ctl.signal),
      fetchEarthquakes(ctl.signal),
    ])
      .then(([alertsRes, quakesRes]) => {
        if (ctl.signal.aborted) return;
        if (alertsRes.status === 'fulfilled') setAlertsData(alertsRes.value);
        if (quakesRes.status === 'fulfilled') setQuakesData(quakesRes.value);
      })
      .finally(() => {
        if (!ctl.signal.aborted) setLoadingFeeds(false);
      });
  }, []);

  useEffect(() => {
    loadFeeds();
    return () => abortRef.current?.abort();
  }, [loadFeeds]);

  const stateSummaries = useMemo(
    () => computeStateGeoSummaries(geo.data?.features ?? []),
    [geo.data],
  );

  const activeAlerts = useMemo(() => {
    const base = alertsData?.alerts ?? [];
    const withDemo = isDemoCoastal && !base.some((a) => a.id === DEMO_COASTAL_ALERT.id)
      ? [DEMO_COASTAL_ALERT, ...base]
      : base;
    if (!focusState) return withDemo;
    return withDemo.filter((a) => a.states.includes(focusState));
  }, [alertsData, isDemoCoastal, focusState]);

  const activeQuakes = useMemo(() => {
    const base = quakesData?.quakes ?? [];
    if (!focusState) return base;
    return base.filter((q) => q.state === focusState);
  }, [quakesData, focusState]);

  const activeEvents = useMemo(() => {
    if (!focusState) return EVENTS;
    return EVENTS.filter((e) => e.state === focusState);
  }, [focusState]);

  const visibleAlerts = showAlerts ? activeAlerts : [];
  const visibleQuakes = showQuakes ? activeQuakes : [];
  const visibleEvents = showHistorical ? activeEvents : [];

  return (
    <div className="google-map-page">
      <PageHeader
        title="Interactive Google Maps Explorer"
        subtitle="Explore India's live NDMA SACHET weather alerts, recent seismic activity, and historical water disasters on an interactive Google Map."
        badge="Google Maps Platform"
      />

      <section className="section gmp-explorer-section">
        <div className="container">
          <div className="prototype-banner" style={{ marginBottom: 16 }}>
            <InfoIcon />
            <span>
              <strong>Situational awareness prototype.</strong> Map layers combine NDMA SACHET public alerts, NCS seismic bulletins, and curated historical records. Not an official emergency dispatch channel — verify warnings at{' '}
              <a href="https://sachet.ndma.gov.in" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                sachet.ndma.gov.in
              </a>.
            </span>
          </div>

          <div className="gmp-explorer-bar">
            <div className="gmp-layer-toggles" role="group" aria-label="Toggle map data layers">
              <button
                type="button"
                className={`hazard-chip hz-water${showAlerts ? ' active' : ''}`}
                aria-pressed={showAlerts}
                onClick={() => setShowAlerts((v) => !v)}
              >
                Live Alerts <span className="hazard-count">{activeAlerts.length}</span>
              </button>
              <button
                type="button"
                className={`hazard-chip hz-earthquake${showQuakes ? ' active' : ''}`}
                aria-pressed={showQuakes}
                onClick={() => setShowQuakes((v) => !v)}
              >
                Earthquakes (30d) <span className="hazard-count">{activeQuakes.length}</span>
              </button>
              <button
                type="button"
                className={`hazard-chip${showHistorical ? ' active' : ''}`}
                aria-pressed={showHistorical}
                onClick={() => setShowHistorical((v) => !v)}
              >
                Historical Events <span className="hazard-count">{activeEvents.length}</span>
              </button>
            </div>

            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={loadFeeds}
              disabled={loadingFeeds}
            >
              {loadingFeeds ? 'Refreshing feeds...' : 'Refresh live feeds'}
            </button>
          </div>

          <div className="live-grid">
            <div className="live-main">
              <div className="map-card">
                <GoogleDisasterMap
                  alerts={visibleAlerts}
                  quakes={visibleQuakes}
                  events={visibleEvents}
                  stateSummaries={stateSummaries}
                  selectedItem={selectedItem}
                  onSelectAlert={(id) => setSelectedItem(id ? { kind: 'alert', id } : null)}
                  onSelectQuake={(id) => setSelectedItem(id ? { kind: 'quake', id } : null)}
                  onSelectEvent={(id) => setSelectedItem(id ? { kind: 'event', id } : null)}
                  focusState={focusState}
                  onFocusStateChange={setFocusState}
                  height={620}
                  title={focusState ? `Google Maps · ${focusState}` : 'Google Maps · India Disaster Layers'}
                  subtitle={`${visibleAlerts.length} alerts · ${visibleQuakes.length} quakes · ${visibleEvents.length} historical events`}
                />
              </div>
            </div>

            <aside className="live-list gmp-side-list" aria-live="polite">
              <div className="live-list-head">
                <div>
                  <div className="t1">{focusState ? `Mapped Items: ${focusState}` : 'Mapped Intelligence Feed'}</div>
                  <div className="t2">Click any item to center Google Maps and open details</div>
                </div>
                {(selectedItem || focusState) && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => { setSelectedItem(null); setFocusState(null); }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {showAlerts && visibleAlerts.slice(0, 8).map((a) => {
                const isSelected = selectedItem?.kind === 'alert' && selectedItem.id === a.id;
                return (
                  <button
                    key={`side-alert-${a.id}`}
                    type="button"
                    className={`alert-row lm-row gmp-side-btn${isSelected ? ' lm-row-selected' : ''}`}
                    onClick={() => setSelectedItem(isSelected ? null : { kind: 'alert', id: a.id })}
                  >
                    <span className="sev-tag" style={{ background: a.hazard === 'coastal' ? '#0e7c86' : SEVERITY_COLOR[a.severity] }}>
                      {a.severity}
                    </span>
                    <span className="al-body" style={{ textAlign: 'left' }}>
                      <span className="al-event">
                        {a.isDemo && <span className="lm-demo-badge">DEMO</span>}
                        {a.event}
                      </span>
                      <span className="al-area">{a.areaDesc}</span>
                      <span className="al-meta">{a.states.join(', ') || 'Unmatched region'} · {formatUntil(a.expires)}</span>
                    </span>
                  </button>
                );
              })}

              {showQuakes && visibleQuakes.slice(0, 8).map((q) => {
                const isSelected = selectedItem?.kind === 'quake' && selectedItem.id === q.id;
                return (
                  <button
                    key={`side-quake-${q.id}`}
                    type="button"
                    className={`eq-row gmp-side-btn${isSelected ? ' eq-selected' : ''}`}
                    onClick={() => setSelectedItem(isSelected ? null : { kind: 'quake', id: q.id })}
                  >
                    <span className="eq-mag" style={{ background: magColor(q.magnitude) }}>
                      M{q.magnitude.toFixed(1)}
                    </span>
                    <span className="eq-body" style={{ textAlign: 'left' }}>
                      <span className="eq-region">{q.region || q.location}</span>
                      <span className="eq-detail">Depth {q.depth} km · {relativeTime(q.time)}</span>
                    </span>
                  </button>
                );
              })}

              {showHistorical && visibleEvents.slice(0, 8).map((ev) => {
                const isSelected = selectedItem?.kind === 'event' && selectedItem.id === ev.id;
                return (
                  <button
                    key={`side-ev-${ev.id}`}
                    type="button"
                    className={`alert-row lm-row gmp-side-btn${isSelected ? ' lm-row-selected' : ''}`}
                    onClick={() => setSelectedItem(isSelected ? null : { kind: 'event', id: ev.id })}
                  >
                    <span className="sev-tag" style={{ background: categoryColor(ev.category) }}>
                      {ev.date.slice(0, 4)}
                    </span>
                    <span className="al-body" style={{ textAlign: 'left' }}>
                      <span className="al-event">{ev.name}</span>
                      <span className="al-area">{ev.district}, {ev.state}</span>
                      <span className="al-meta">{categoryLabel(ev.category)}</span>
                    </span>
                  </button>
                );
              })}

              {visibleAlerts.length === 0 && visibleQuakes.length === 0 && visibleEvents.length === 0 && (
                <div className="live-status">No items match the active layers and state filter.</div>
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
