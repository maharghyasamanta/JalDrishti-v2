import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIndiaGeo } from '../hooks/useIndiaGeo';
import { EVENTS } from '../data/events';
import { stateMeta } from '../data/states';
import { applyFilters, defaultFilters, type FilterState } from '../lib/filters';
import FilterToolbar from '../components/FilterToolbar';
import IndiaMap from '../components/IndiaMap';
import GoogleDisasterMap from '../components/GoogleDisasterMap';
import MapLegend from '../components/MapLegend';
import StatePanel from '../components/StatePanel';
import Analytics from '../components/Analytics';
import PageHeader from '../components/PageHeader';
import { InfoIcon } from '../components/Icons';
import { useSelection } from '../context/SelectionContext';
import { computeStateGeoSummaries } from '../lib/googleMapsData';

export default function Historical() {
  const geo = useIndiaGeo();
  const location = useLocation();
  const { targetState, targetEventId, clearTargetSelection } = useSelection();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [mapView, setMapView] = useState<'india' | 'google'>('india');

  // Consume any target selection from search / navigation context
  useEffect(() => {
    if (targetState) {
      setSelectedState(targetState);
      setFilters((prev) => ({ ...prev, state: targetState, district: 'all' }));
      if (targetEventId) {
        setSelectedEventId(targetEventId);
      }
      clearTargetSelection();
    } else if (targetEventId) {
      const e = EVENTS.find((x) => x.id === targetEventId);
      if (e) {
        setSelectedState(e.state);
        setFilters((prev) => ({ ...prev, state: e.state, district: 'all' }));
        setSelectedEventId(targetEventId);
      }
      clearTargetSelection();
    }
  }, [targetState, targetEventId, clearTargetSelection]);

  // Handle URL query parameters if passed (?state=... or ?event=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qState = params.get('state');
    const qEvent = params.get('event');
    if (qState) {
      setSelectedState(qState);
      setFilters((prev) => ({ ...prev, state: qState, district: 'all' }));
    }
    if (qEvent) {
      const e = EVENTS.find((x) => x.id === qEvent);
      if (e) {
        setSelectedState(e.state);
        setFilters((prev) => ({ ...prev, state: e.state, district: 'all' }));
        setSelectedEventId(qEvent);
      }
    }
  }, [location.search]);

  const filteredEvents = useMemo(() => applyFilters(EVENTS, filters), [filters]);
  const features = geo.data?.features ?? [];
  const stateSummaries = useMemo(() => computeStateGeoSummaries(features), [features]);
  const selectedFeature = useMemo(
    () => features.find((f) => f.properties.st_nm === selectedState),
    [features, selectedState]
  );
  const panelEvents = useMemo(
    () => (selectedState ? filteredEvents.filter((e) => e.state === selectedState) : []),
    [filteredEvents, selectedState]
  );

  // Clear a selected event if it falls outside the current filters.
  useEffect(() => {
    if (selectedEventId && !filteredEvents.some((e) => e.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [filteredEvents, selectedEventId]);

  const handleFilterChange = (patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    if (patch.state !== undefined) {
      setSelectedState(patch.state === 'all' ? null : patch.state);
      setSelectedEventId(null);
      if (patch.state === 'all') setResetSignal((n) => n + 1);
    }
  };

  const handleSelectState = (name: string | null) => {
    setSelectedState(name);
    setFilters((prev) => ({ ...prev, state: name ?? 'all', district: 'all' }));
    setSelectedEventId(null);
    if (!name) setResetSignal((n) => n + 1);
  };

  const handleSelectEvent = (id: string) => {
    const e = EVENTS.find((x) => x.id === id);
    if (!e) return;
    if (e.state !== selectedState) {
      setSelectedState(e.state);
      setFilters((prev) => ({ ...prev, state: e.state, district: 'all' }));
    }
    setSelectedEventId(id);
  };

  const handleClear = () => {
    setFilters(defaultFilters());
    setSelectedState(null);
    setSelectedEventId(null);
    setResetSignal((n) => n + 1);
  };

  const handleRemoveChip = (key: string) => {
    const d = defaultFilters();
    switch (key) {
      case 'range':
        handleFilterChange({ period: d.period });
        break;
      case 'year':
        handleFilterChange({ year: 'all' });
        break;
      case 'state':
        handleSelectState(null);
        break;
      case 'district':
        handleFilterChange({ district: 'all' });
        break;
      case 'category':
        handleFilterChange({ category: 'all' });
        break;
      case 'severity':
        handleFilterChange({ severity: 'all' });
        break;
      case 'search':
        handleFilterChange({ search: '' });
        break;
    }
  };

  const scopeLabel = selectedState ?? 'National';

  return (
    <div className="historical-page">
      <PageHeader
        title="Historical Water Disaster Map"
        subtitle="Explore a decade of water disasters across India's states and Union Territories through interactive geographical intelligence."
        badge="Historical Intelligence · 2015–2024"
      />

      <main className="map-section" id="map">
        <div className="container">
          <div className="section-head" style={{ marginBottom: 18 }}>
            <span className="eyebrow">Interactive Disaster Map</span>
            <h2 className="section-title">A decade of water disasters, mapped</h2>
            <p className="section-sub">
              Select any state or Union Territory to explore recorded events, their locations and a chronological timeline. Filter by period, category and severity.
            </p>
          </div>

          <div className="prototype-banner">
            <InfoIcon />
            <span>
              <strong>Prototype dataset.</strong> Combines widely-reported historical events with clearly-labelled demo records. Sources are attributed per record — verify against official sources before operational use.
            </span>
          </div>

          <FilterToolbar
            filters={filters}
            onChange={handleFilterChange}
            onClear={handleClear}
            onRemoveChip={handleRemoveChip}
            allEvents={EVENTS}
            resultCount={filteredEvents.length}
          />

          <div className="gmp-view-bar">
            <div className="gmp-view-switch" role="group" aria-label="Historical map view mode">
              <button
                type="button"
                className={`gmp-mode-btn${mapView === 'india' ? ' active' : ''}`}
                aria-pressed={mapView === 'india'}
                onClick={() => setMapView('india')}
              >
                India Choropleth
              </button>
              <button
                type="button"
                className={`gmp-mode-btn${mapView === 'google' ? ' active' : ''}`}
                aria-pressed={mapView === 'google'}
                onClick={() => setMapView('google')}
              >
                Google Maps
              </button>
            </div>
          </div>

          <div className={`workspace${selectedState ? ' panel-open' : ''}`}>
            <div className="map-card">
              {mapView === 'google' ? (
                <GoogleDisasterMap
                  events={filteredEvents}
                  stateSummaries={stateSummaries}
                  selectedItem={selectedEventId ? { kind: 'event', id: selectedEventId } : null}
                  onSelectEvent={(id) => {
                    if (id) handleSelectEvent(id);
                    else setSelectedEventId(null);
                  }}
                  focusState={selectedState}
                  onFocusStateChange={handleSelectState}
                  height={660}
                  title="Historical Water Disasters · Google Maps"
                  subtitle={`${filteredEvents.length} filtered event${filteredEvents.length === 1 ? '' : 's'}`}
                />
              ) : (
                <>
                  {geo.loading && (
                    <div className="map-loading">
                      <div className="spinner" />
                      <div>Loading authentic India boundaries…</div>
                    </div>
                  )}
                  {geo.error && (
                    <div className="map-loading">
                      <div style={{ color: 'var(--red)' }}>Failed to load map geometry: {geo.error}</div>
                    </div>
                  )}
                  {geo.data && (
                    <>
                      <IndiaMap
                        features={features}
                        events={filteredEvents}
                        selectedState={selectedState}
                        onSelectState={handleSelectState}
                        selectedEventId={selectedEventId}
                        onSelectEvent={handleSelectEvent}
                        resetSignal={resetSignal}
                      />
                      <MapLegend />
                    </>
                  )}
                </>
              )}
            </div>

            <StatePanel
              meta={selectedState ? stateMeta(selectedState) : undefined}
              feature={selectedFeature}
              events={panelEvents}
              selectedEventId={selectedEventId}
              onSelectEvent={handleSelectEvent}
              onClose={() => handleSelectState(null)}
              hasGeo={!!geo.data}
            />
          </div>
        </div>
      </main>

      <Analytics events={filteredEvents} scopeLabel={scopeLabel} />
    </div>
  );
}
