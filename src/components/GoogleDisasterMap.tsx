import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  Polygon,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import type { DisasterEvent } from '../data/types';
import { categoryLabel } from '../data/categories';
import { STATES } from '../data/states';
import type { Earthquake } from '../lib/earthquakes';
import { formatTime as formatQuakeTime, magLabel, relativeTime } from '../lib/earthquakes';
import { formatDateRange, formatCoords } from '../lib/format';
import { formatSent, formatUntil, HAZARD_SHORT, type SachetAlert } from '../lib/sachet';
import {
  earthquakesToMapMarkers,
  hasValidGoogleMapsKey,
  historicalEventsToMapMarkers,
  INDIA_CENTER,
  INDIA_DEFAULT_ZOOM,
  sachetAlertsToMapOverlays,
  type AlertMarkerItem,
  type GoogleMapTypeId,
  type HistoricalMarkerItem,
  type LatLngPoint,
  type QuakeMarkerItem,
  type StateGeoSummary,
} from '../lib/googleMapsData';

export type SelectedMapItem =
  | { kind: 'alert'; id: string }
  | { kind: 'quake'; id: string }
  | { kind: 'event'; id: string };

interface Props {
  alerts?: SachetAlert[];
  quakes?: Earthquake[];
  events?: DisasterEvent[];
  stateSummaries?: Record<string, StateGeoSummary>;
  selectedItem?: SelectedMapItem | null;
  onSelectAlert?: (id: string | null) => void;
  onSelectQuake?: (id: string | null) => void;
  onSelectEvent?: (id: string | null) => void;
  focusState?: string | null;
  onFocusStateChange?: (stateName: string | null) => void;
  height?: number | string;
  showControls?: boolean;
  title?: string;
  subtitle?: string;
}

const GOOGLE_MAPS_API_KEY: string = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';
const safeHref = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : null);

interface RegisteredMarkerProps {
  markerKey: string;
  position: LatLngPoint;
  title: string;
  zIndex: number;
  onRegister: (key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => void;
  onClick: () => void;
  children: React.ReactNode;
}

function RegisteredAdvancedMarker({
  markerKey,
  position,
  title,
  zIndex,
  onRegister,
  onClick,
  children,
}: RegisteredMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  useEffect(() => {
    onRegister(markerKey, marker);
    return () => onRegister(markerKey, null);
  }, [markerKey, marker, onRegister]);

  return (
    <AdvancedMarker
      ref={markerRef}
      position={position}
      title={title}
      zIndex={zIndex}
      onClick={onClick}
    >
      {children}
    </AdvancedMarker>
  );
}

interface InnerProps extends Props {
  mapType: GoogleMapTypeId;
  onMapTypeChange: (next: GoogleMapTypeId) => void;
}

function GoogleDisasterMapInner({
  alerts = [],
  quakes = [],
  events = [],
  stateSummaries = {},
  selectedItem = null,
  onSelectAlert,
  onSelectQuake,
  onSelectEvent,
  focusState = null,
  onFocusStateChange,
  mapType,
  onMapTypeChange,
  showControls = true,
  title,
  subtitle,
}: InnerProps) {
  const map = useMap();
  const loadingStatus = useApiLoadingStatus();
  const markerInstancesRef = useRef<Record<string, google.maps.marker.AdvancedMarkerElement | null>>({});
  const [internalSelected, setInternalSelected] = useState<SelectedMapItem | null>(null);
  const [anchorMarker, setAnchorMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  const activeSelection = selectedItem !== undefined ? selectedItem : internalSelected;

  const registerMarker = useCallback(
    (key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => {
      if (marker) {
        markerInstancesRef.current[key] = marker;
      } else {
        delete markerInstancesRef.current[key];
      }
    },
    [],
  );

  const stateCenters = useMemo(() => {
    const centers: Record<string, LatLngPoint> = {};
    for (const [name, summary] of Object.entries(stateSummaries)) {
      centers[name] = summary.center;
    }
    return centers;
  }, [stateSummaries]);

  const { polygons, circles, markers: alertMarkers } = useMemo(
    () => sachetAlertsToMapOverlays(alerts, stateCenters),
    [alerts, stateCenters],
  );
  const quakeMarkers = useMemo(() => earthquakesToMapMarkers(quakes), [quakes]);
  const eventMarkers = useMemo(() => historicalEventsToMapMarkers(events), [events]);

  const alertById = useMemo(() => {
    const dict: Record<string, AlertMarkerItem> = {};
    for (const item of alertMarkers) dict[item.id] = item;
    return dict;
  }, [alertMarkers]);

  const quakeById = useMemo(() => {
    const dict: Record<string, QuakeMarkerItem> = {};
    for (const item of quakeMarkers) dict[item.id] = item;
    return dict;
  }, [quakeMarkers]);

  const eventById = useMemo(() => {
    const dict: Record<string, HistoricalMarkerItem> = {};
    for (const item of eventMarkers) dict[item.id] = item;
    return dict;
  }, [eventMarkers]);

  const clearSelection = useCallback(() => {
    setInternalSelected(null);
    setAnchorMarker(null);
    onSelectAlert?.(null);
    onSelectQuake?.(null);
    onSelectEvent?.(null);
  }, [onSelectAlert, onSelectQuake, onSelectEvent]);

  const selectAlert = useCallback(
    (id: string) => {
      setInternalSelected({ kind: 'alert', id });
      onSelectAlert?.(id);
    },
    [onSelectAlert],
  );

  const selectQuake = useCallback(
    (id: string) => {
      setInternalSelected({ kind: 'quake', id });
      onSelectQuake?.(id);
    },
    [onSelectQuake],
  );

  const selectEvent = useCallback(
    (id: string) => {
      setInternalSelected({ kind: 'event', id });
      onSelectEvent?.(id);
    },
    [onSelectEvent],
  );

  // Sync InfoWindow anchor and gently pan when selection changes
  useEffect(() => {
    if (!activeSelection) {
      setAnchorMarker(null);
      return;
    }

    const key = `${activeSelection.kind}:${activeSelection.id}`;
    const marker = markerInstancesRef.current[key] ?? null;
    setAnchorMarker(marker);

    if (!map) return;
    let pos: LatLngPoint | null = null;
    if (activeSelection.kind === 'alert') pos = alertById[activeSelection.id]?.position ?? null;
    if (activeSelection.kind === 'quake') pos = quakeById[activeSelection.id]?.position ?? null;
    if (activeSelection.kind === 'event') pos = eventById[activeSelection.id]?.position ?? null;

    if (pos) {
      map.panTo(pos);
      const currentZoom = map.getZoom();
      if (typeof currentZoom === 'number' && currentZoom < 6.5) {
        map.setZoom(6.8);
      }
    }
  }, [activeSelection, alertById, quakeById, eventById, map]);

  // Fit bounds when focusState changes
  useEffect(() => {
    if (!map) return;
    if (!focusState) return;
    const summary = stateSummaries[focusState];
    if (summary) {
      map.fitBounds(summary.bounds, 36);
    }
  }, [focusState, stateSummaries, map]);

  // Escape closes InfoWindow
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeSelection) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSelection, clearSelection]);

  const handleResetView = useCallback(() => {
    onFocusStateChange?.(null);
    if (map) {
      map.setCenter(INDIA_CENTER);
      map.setZoom(INDIA_DEFAULT_ZOOM);
    }
  }, [map, onFocusStateChange]);

  const handleStateSelect = useCallback(
    (value: string) => {
      if (!value) {
        handleResetView();
        return;
      }
      onFocusStateChange?.(value);
      const summary = stateSummaries[value];
      if (map && summary) {
        map.fitBounds(summary.bounds, 36);
      }
    },
    [handleResetView, map, onFocusStateChange, stateSummaries],
  );

  const selectedAlertItem = activeSelection?.kind === 'alert' ? alertById[activeSelection.id] ?? null : null;
  const selectedQuakeItem = activeSelection?.kind === 'quake' ? quakeById[activeSelection.id] ?? null : null;
  const selectedEventItem = activeSelection?.kind === 'event' ? eventById[activeSelection.id] ?? null : null;

  const totalItems = alertMarkers.length + quakeMarkers.length + eventMarkers.length;
  const stateOptions = useMemo(
    () => STATES.map((s) => s.name).filter((name) => Boolean(stateSummaries[name])),
    [stateSummaries],
  );

  return (
    <div className="gmp-shell">
      {showControls && (
        <div className="gmp-toolbar">
          <div className="gmp-maptype-group" role="group" aria-label="Google Map style">
            {(['roadmap', 'terrain', 'hybrid'] as GoogleMapTypeId[]).map((type) => (
              <button
                key={type}
                type="button"
                className={`gmp-mode-btn${mapType === type ? ' active' : ''}`}
                aria-pressed={mapType === type}
                onClick={() => onMapTypeChange(type)}
              >
                {type === 'roadmap' ? 'Roadmap' : type === 'terrain' ? 'Terrain' : 'Satellite'}
              </button>
            ))}
          </div>

          <div className="gmp-toolbar-right">
            {stateOptions.length > 0 && (
              <select
                className="gmp-state-select"
                aria-label="Focus Indian state or union territory"
                value={focusState ?? ''}
                onChange={(e) => handleStateSelect(e.target.value)}
              >
                <option value="">All India view</option>
                {stateOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={handleResetView}>
              Reset India view
            </button>
          </div>
        </div>
      )}

      <div className="gmp-canvas-wrap">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={INDIA_CENTER}
          defaultZoom={INDIA_DEFAULT_ZOOM}
          gestureHandling="greedy"
          mapTypeId={mapType}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          {/* SACHET Alert Polygons */}
          {polygons.map((poly) => {
            const isSelected = activeSelection?.kind === 'alert' && activeSelection.id === poly.alert.id;
            return (
              <Polygon
                key={poly.id}
                paths={poly.paths}
                strokeColor={isSelected ? '#101c2c' : poly.color}
                strokeOpacity={0.95}
                strokeWeight={isSelected ? 3 : 2}
                fillColor={poly.color}
                fillOpacity={isSelected ? 0.36 : 0.22}
                clickable
                onClick={() => selectAlert(poly.alert.id)}
              />
            );
          })}

          {/* SACHET Alert Circles */}
          {circles.map((circle) => {
            const isSelected = activeSelection?.kind === 'alert' && activeSelection.id === circle.alert.id;
            return (
              <Circle
                key={circle.id}
                center={circle.center}
                radius={circle.radiusMeters}
                strokeColor={isSelected ? '#101c2c' : circle.color}
                strokeOpacity={0.95}
                strokeWeight={isSelected ? 3 : 2}
                fillColor={circle.color}
                fillOpacity={isSelected ? 0.34 : 0.2}
                clickable
                onClick={() => selectAlert(circle.alert.id)}
              />
            );
          })}

          {/* Historical Disaster Markers */}
          {eventMarkers.map((item, index) => {
            const isSelected = activeSelection?.kind === 'event' && activeSelection.id === item.id;
            return (
              <RegisteredAdvancedMarker
                key={`event:${item.id}`}
                markerKey={`event:${item.id}`}
                position={item.position}
                title={`${item.event.name} (${item.event.state})`}
                zIndex={isSelected ? 1000 : 100 + index}
                onRegister={registerMarker}
                onClick={() => selectEvent(item.id)}
              >
                <Pin
                  background={item.color}
                  borderColor={isSelected ? '#101c2c' : '#ffffff'}
                  glyphColor="#ffffff"
                  scale={isSelected ? 1.2 : 0.8}
                />
              </RegisteredAdvancedMarker>
            );
          })}

          {/* Earthquake Markers */}
          {quakeMarkers.map((item, index) => {
            const isSelected = activeSelection?.kind === 'quake' && activeSelection.id === item.id;
            return (
              <RegisteredAdvancedMarker
                key={`quake:${item.id}`}
                markerKey={`quake:${item.id}`}
                position={item.position}
                title={`M${item.quake.magnitude.toFixed(1)} — ${item.quake.region || item.quake.location}`}
                zIndex={isSelected ? 1000 : 300 + index}
                onRegister={registerMarker}
                onClick={() => selectQuake(item.id)}
              >
                <div
                  className={`gmp-quake-pin${isSelected ? ' selected' : ''}`}
                  style={{ background: item.color }}
                >
                  {item.quake.magnitude.toFixed(1)}
                </div>
              </RegisteredAdvancedMarker>
            );
          })}

          {/* SACHET Alert Markers */}
          {alertMarkers.map((item, index) => {
            const isSelected = activeSelection?.kind === 'alert' && activeSelection.id === item.id;
            return (
              <RegisteredAdvancedMarker
                key={`alert:${item.id}`}
                markerKey={`alert:${item.id}`}
                position={item.position}
                title={`${item.alert.event} (${item.alert.severity})`}
                zIndex={isSelected ? 1000 : 500 + index}
                onRegister={registerMarker}
                onClick={() => selectAlert(item.id)}
              >
                {item.isCoastal ? (
                  <div className={`gmp-wave-pin${isSelected ? ' selected' : ''}`}>
                    <span>~</span>
                    <span>{item.alert.isDemo ? 'DEMO' : 'SEA'}</span>
                  </div>
                ) : (
                  <Pin
                    background={item.color}
                    borderColor={isSelected ? '#101c2c' : '#ffffff'}
                    glyphColor="#ffffff"
                    glyphText={item.alert.severity.slice(0, 1)}
                    scale={isSelected ? 1.2 : 0.92}
                  />
                )}
              </RegisteredAdvancedMarker>
            );
          })}

          {/* Anchored InfoWindow */}
          {selectedAlertItem && anchorMarker && (
            <InfoWindow anchor={anchorMarker} maxWidth={300} onCloseClick={clearSelection}>
              <div className="gmp-info-card">
                <div className="gmp-info-badges">
                  {selectedAlertItem.alert.isDemo && <span className="lm-demo-badge">DEMO</span>}
                  <span className="gmp-info-pill" style={{ background: selectedAlertItem.color }}>
                    {selectedAlertItem.alert.severity}
                  </span>
                  <span className="gmp-info-kind">{HAZARD_SHORT[selectedAlertItem.alert.hazard]} Alert</span>
                </div>
                <h4 className="gmp-info-title">{selectedAlertItem.alert.event}</h4>
                <p className="gmp-info-sub">{selectedAlertItem.alert.areaDesc}</p>
                {selectedAlertItem.alert.description && (
                  <p className="gmp-info-desc">{selectedAlertItem.alert.description}</p>
                )}
                <div className="gmp-info-meta">
                  {formatSent(selectedAlertItem.alert.sent)}
                  {formatUntil(selectedAlertItem.alert.expires)
                    ? ` · ${formatUntil(selectedAlertItem.alert.expires)}`
                    : ''}
                </div>
                {selectedAlertItem.isApproximate && (
                  <div className="gmp-info-note">Approximate state-level placement</div>
                )}
                {safeHref(selectedAlertItem.alert.link) && (
                  <a
                    className="gmp-info-link"
                    href={safeHref(selectedAlertItem.alert.link)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Official SACHET bulletin
                  </a>
                )}
              </div>
            </InfoWindow>
          )}

          {selectedQuakeItem && anchorMarker && (
            <InfoWindow anchor={anchorMarker} maxWidth={290} onCloseClick={clearSelection}>
              <div className="gmp-info-card">
                <div className="gmp-info-badges">
                  <span className="gmp-info-pill" style={{ background: selectedQuakeItem.color }}>
                    M{selectedQuakeItem.quake.magnitude.toFixed(1)} · {magLabel(selectedQuakeItem.quake.magnitude)}
                  </span>
                  <span className="gmp-info-kind">{selectedQuakeItem.quake.source}</span>
                </div>
                <h4 className="gmp-info-title">
                  {selectedQuakeItem.quake.region || selectedQuakeItem.quake.location}
                </h4>
                <p className="gmp-info-sub">
                  Depth: {selectedQuakeItem.quake.depth} km ·{' '}
                  {selectedQuakeItem.quake.latitude.toFixed(2)}°N, {selectedQuakeItem.quake.longitude.toFixed(2)}°E
                </p>
                <div className="gmp-info-meta">
                  {formatQuakeTime(selectedQuakeItem.quake.time)} ({relativeTime(selectedQuakeItem.quake.time)})
                </div>
                {safeHref(selectedQuakeItem.quake.url) && (
                  <a
                    className="gmp-info-link"
                    href={safeHref(selectedQuakeItem.quake.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View seismic bulletin
                  </a>
                )}
              </div>
            </InfoWindow>
          )}

          {selectedEventItem && anchorMarker && (
            <InfoWindow anchor={anchorMarker} maxWidth={300} onCloseClick={clearSelection}>
              <div className="gmp-info-card">
                <div className="gmp-info-badges">
                  <span className="gmp-info-pill" style={{ background: selectedEventItem.color }}>
                    {categoryLabel(selectedEventItem.event.category)}
                  </span>
                  <span className="gmp-info-kind">{selectedEventItem.event.verification}</span>
                </div>
                <h4 className="gmp-info-title">{selectedEventItem.event.name}</h4>
                <p className="gmp-info-sub">
                  {selectedEventItem.event.district}, {selectedEventItem.event.state}
                </p>
                <p className="gmp-info-desc">{selectedEventItem.event.description}</p>
                <div className="gmp-info-meta">
                  {formatDateRange(selectedEventItem.event.date, selectedEventItem.event.endDate)} ·{' '}
                  {formatCoords(selectedEventItem.event.lat, selectedEventItem.event.lon)}
                </div>
                {safeHref(selectedEventItem.event.sourceUrl) && (
                  <a
                    className="gmp-info-link"
                    href={safeHref(selectedEventItem.event.sourceUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source: {selectedEventItem.event.source}
                  </a>
                )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {title && (
          <div className="gmp-overlay-chip">
            <div className="t1">{title}</div>
            <div className="t2">
              {subtitle ?? `${totalItems} mapped item${totalItems === 1 ? '' : 's'} · Google Maps`}
            </div>
          </div>
        )}

        {(loadingStatus === APILoadingStatus.FAILED || loadingStatus === APILoadingStatus.AUTH_FAILURE) && (
          <div className="gmp-status-overlay" role="alert">
            Unable to load Google Maps tiles right now. Please verify your API key restrictions, network connection, or quota.
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoogleDisasterMap(props: Props) {
  const [mapType, setMapType] = useState<GoogleMapTypeId>('terrain');
  const heightStyle = typeof props.height === 'number' ? `${props.height}px` : props.height;

  if (!hasValidGoogleMapsKey(GOOGLE_MAPS_API_KEY)) {
    return (
      <div
        className="gmp-map-frame gmp-fallback"
        style={heightStyle ? { height: heightStyle } : undefined}
        data-testid="google-map-unconfigured"
      >
        <div className="gmp-fallback-card">
          <h3>Google Maps Platform key not configured</h3>
          <p>
            Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your environment to render interactive Google Maps layers for India disaster alerts, seismic activity, and historical records.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="gmp-map-frame"
      style={heightStyle ? { height: heightStyle } : undefined}
      data-testid="google-map-container"
    >
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        language="en"
        region="IN"
        libraries={['marker']}
      >
        <GoogleDisasterMapInner
          {...props}
          mapType={mapType}
          onMapTypeChange={setMapType}
        />
      </APIProvider>
    </div>
  );
}
