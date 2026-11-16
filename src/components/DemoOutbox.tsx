import { useMemo, useState } from 'react';
import { useDemoSms } from '../context/DemoSmsContext';
import { formatIstShort, type LookbackHours, type SmsKind } from '../lib/dispatch';
import { magCategory, magColor, relativeTime } from '../lib/earthquakes';
import { SEVERITY_COLOR } from '../lib/sachet';
import { CHANGE_EVENT, loadSubscriptions, type Subscription } from '../lib/subscriptions';
import { useEffect } from 'react';

type OutboxFilter = 'all' | SmsKind;

const LOOKBACK_LABELS: Record<LookbackHours, string> = {
  24: '24 hours',
  168: '7 days',
  720: '30 days',
};

const PAGE_SIZE = 20;

export default function DemoOutbox() {
  const {
    enabled,
    setEnabled,
    mode,
    setMode,
    lookbackHours,
    setLookbackHours,
    outbox,
    droppedCount,
    unreadCount,
    lastRun,
    status,
    alertsStatus,
    quakesStatus,
    errorMessage,
    lastRunSummary,
    activeAlerts,
    indiaQuakes,
    counts,
    runNow,
    clearOutbox,
    markAllRead,
  } = useDemoSms();

  const [filter, setFilter] = useState<OutboxFilter>('all');
  const [showLimit, setShowLimit] = useState(PAGE_SIZE);
  const [confirmClear, setConfirmClear] = useState(false);
  const [subs, setSubs] = useState<Subscription[]>(() => loadSubscriptions());

  useEffect(() => {
    const sync = () => setSubs(loadSubscriptions());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const verifiedCount = useMemo(
    () => subs.filter((s) => s.status === 'Verified').length,
    [subs],
  );

  const deliveredByEventKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const msg of outbox) {
      map.set(msg.eventKey, (map.get(msg.eventKey) ?? 0) + 1);
    }
    return map;
  }, [outbox]);

  const sortedOutbox = useMemo(() => {
    return [...outbox].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [outbox]);

  const alertSmsCount = useMemo(
    () => sortedOutbox.filter((m) => m.kind === 'alert').length,
    [sortedOutbox],
  );
  const quakeSmsCount = useMemo(
    () => sortedOutbox.filter((m) => m.kind === 'earthquake').length,
    [sortedOutbox],
  );

  const filteredOutbox = useMemo(() => {
    if (filter === 'all') return sortedOutbox;
    return sortedOutbox.filter((m) => m.kind === filter);
  }, [sortedOutbox, filter]);

  const visibleMessages = useMemo(
    () => filteredOutbox.slice(0, showLimit),
    [filteredOutbox, showLimit],
  );

  const lookbackText = LOOKBACK_LABELS[lookbackHours];

  return (
    <section id="outbox" className="card dm-card" aria-labelledby="dm-heading">
      <div className="dm-head">
        <div>
          <div className="dm-title-row">
            <span className="badge badge-demo dm-demo-tag">DEMO · SIMULATED SMS</span>
            <h3 id="dm-heading">Simulated SMS Outbox</h3>
          </div>
          <p className="dm-sub">
            No real SMS are sent. Messages stay in this browser and are simulated locally from live NDMA SACHET alerts and India earthquakes. In an emergency call 112.
          </p>
        </div>
        <div className="dm-status-meta">
          <span className={`dm-status-pill dm-status-${status}`}>
            {status === 'running'
              ? 'Checking feeds…'
              : status === 'error'
                ? 'Feed warning'
                : enabled
                  ? 'Auto-dispatch ON'
                  : 'Paused'}
          </span>
          {lastRun && (
            <span className="dm-last-run">
              Last check: <span className="sr-mono">{formatIstShort(lastRun)}</span>
            </span>
          )}
        </div>
      </div>

      {lastRunSummary && (
        <div className="dm-summary" role="status" aria-live="polite">
          {lastRunSummary}
        </div>
      )}

      {errorMessage && (
        <div className="dm-error-banner" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="dm-controls">
        <div className="dm-control-group">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className={`btn btn-sm dm-switch${enabled ? ' dm-switch-on' : ' btn-ghost'}`}
            onClick={() => setEnabled(!enabled)}
          >
            Auto-dispatch: {enabled ? 'ON' : 'OFF'}
          </button>

          <div className="dm-inline-field">
            <label htmlFor="dm-mode">Mode</label>
            <select
              id="dm-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'broadcast' | 'targeted')}
            >
              <option value="broadcast">Broadcast (all verified)</option>
              <option value="targeted">Targeted (state + hazard)</option>
            </select>
          </div>

          <div className="dm-inline-field">
            <label htmlFor="dm-lookback">Quake window</label>
            <select
              id="dm-lookback"
              value={lookbackHours}
              onChange={(e) => setLookbackHours(Number(e.target.value) as LookbackHours)}
            >
              <option value={24}>24 h</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
          </div>
        </div>

        <div className="dm-control-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={status === 'running'}
            onClick={() => void runNow()}
          >
            {status === 'running' ? 'Checking…' : 'Run check now'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={unreadCount === 0}
            onClick={markAllRead}
          >
            Mark all read ({unreadCount})
          </button>
          {!confirmClear ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm sr-danger"
              disabled={outbox.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              Clear outbox
            </button>
          ) : (
            <div className="dm-confirm-inline" role="group" aria-label="Confirm clear outbox">
              <span className="dm-confirm-text">Clear {outbox.length} SMS?</span>
              <button
                type="button"
                className="btn btn-sm sr-btn-danger"
                onClick={() => {
                  clearOutbox();
                  setConfirmClear(false);
                }}
              >
                Confirm clear
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="dm-stats">
        <div className="dm-stat">
          <div className="dm-stat-val">{counts.alerts}</div>
          <div className="dm-stat-lbl">Active alerts</div>
        </div>
        <div className="dm-stat">
          <div className="dm-stat-val">{counts.indiaQuakes}</div>
          <div className="dm-stat-lbl">India earthquakes ({lookbackText})</div>
        </div>
        <div className="dm-stat">
          <div className="dm-stat-val">{outbox.length}</div>
          <div className="dm-stat-lbl">
            Simulated SMS{droppedCount > 0 ? ` (+${droppedCount} older trimmed)` : ''}
          </div>
        </div>
        <div className="dm-stat">
          <div className="dm-stat-val">{unreadCount}</div>
          <div className="dm-stat-lbl">Unread in outbox</div>
        </div>
        <div className="dm-stat">
          <div className="dm-stat-val">{counts.skippedUnconsented}</div>
          <div className="dm-stat-lbl">Skipped (unverified / unsubscribed)</div>
        </div>
      </div>

      <div className="dm-feeds-grid">
        <div className="dm-feed-card">
          <div className="dm-feed-head">
            <h4>Live alerts being relayed</h4>
            <span className="dm-feed-count">{activeAlerts.length} active</span>
          </div>

          {alertsStatus === 'loading' && activeAlerts.length === 0 && (
            <p className="dm-empty-note">Loading live NDMA SACHET alerts…</p>
          )}
          {alertsStatus === 'error' && activeAlerts.length === 0 && (
            <p className="sr-detail-warn" role="alert">
              Live alerts unavailable right now. This does not mean there are no alerts.
            </p>
          )}
          {alertsStatus === 'ok' && activeAlerts.length === 0 && (
            <p className="dm-empty-note">No active NDMA SACHET alerts reported right now.</p>
          )}

          {activeAlerts.length > 0 && (
            <ul className="dm-feed-list">
              {activeAlerts.map((a) => {
                const delivered = deliveredByEventKey.get(`alert:${a.id}`) ?? 0;
                const noArea = a.detailsInOriginal || !a.areaDesc.trim();
                const areas = noArea
                  ? a.states
                  : a.areaDesc
                      .split(';')
                      .map((p) => p.trim())
                      .filter(Boolean);

                return (
                  <li className="dm-feed-item" key={a.id}>
                    <div className="dm-feed-top">
                      <span
                        className={`sev-tag sev-${a.severity}`}
                        style={{ background: SEVERITY_COLOR[a.severity] }}
                      >
                        {a.severity}
                      </span>
                      <span className="dm-feed-name">{a.event}</span>
                      <span className="dm-delivered-badge">{delivered} delivered</span>
                    </div>
                    <div className="dm-feed-meta">{formatIstShort(a.sent)}</div>
                    <div className="dm-chip-row">
                      {areas.length > 0 ? (
                        areas.map((part, idx) => (
                          <span className="dm-chip" key={`${a.id}-${idx}`}>
                            {part}
                          </span>
                        ))
                      ) : (
                        <span className="dm-chip">Details in original alert</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="dm-feed-card">
          <div className="dm-feed-head">
            <h4>India earthquakes being relayed</h4>
            <span className="dm-feed-count">{indiaQuakes.length} in {lookbackText}</span>
          </div>

          {quakesStatus === 'loading' && indiaQuakes.length === 0 && (
            <p className="dm-empty-note">Loading India earthquakes…</p>
          )}
          {quakesStatus === 'error' && indiaQuakes.length === 0 && (
            <p className="sr-detail-warn" role="alert">
              Earthquake feed unavailable right now. This does not mean there are no earthquakes.
            </p>
          )}
          {quakesStatus === 'ok' && indiaQuakes.length === 0 && (
            <p className="dm-empty-note">
              No earthquakes recorded inside India in the last {lookbackText}.
            </p>
          )}

          {indiaQuakes.length > 0 && (
            <ul className="dm-feed-list">
              {indiaQuakes.map((q) => {
                const delivered = deliveredByEventKey.get(`quake:${q.id}`) ?? 0;
                const cat = magCategory(q.magnitude);
                return (
                  <li className="dm-feed-item" key={q.id}>
                    <div className="dm-feed-top">
                      <span
                        className={`sev-tag dm-mag-tag dm-mag-${cat}`}
                        style={{ background: magColor(q.magnitude) }}
                      >
                        M{q.magnitude.toFixed(1)}
                      </span>
                      <span className="dm-feed-name">{q.location || q.region}</span>
                      <span className="dm-delivered-badge">{delivered} delivered</span>
                    </div>
                    <div className="dm-feed-meta">
                      <span>{q.state ?? 'India'}</span> ·{' '}
                      <span>Depth {Math.round(q.depth)} km</span> ·{' '}
                      <span>{relativeTime(q.time)}</span> ·{' '}
                      <span>{q.source}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="dm-outbox-bar">
        <div className="dm-filter-tabs" role="tablist" aria-label="Filter simulated SMS">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`dm-tab${filter === 'all' ? ' active' : ''}`}
            onClick={() => {
              setFilter('all');
              setShowLimit(PAGE_SIZE);
            }}
          >
            All ({sortedOutbox.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'alert'}
            className={`dm-tab${filter === 'alert' ? ' active' : ''}`}
            onClick={() => {
              setFilter('alert');
              setShowLimit(PAGE_SIZE);
            }}
          >
            Alerts ({alertSmsCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'earthquake'}
            className={`dm-tab${filter === 'earthquake' ? ' active' : ''}`}
            onClick={() => {
              setFilter('earthquake');
              setShowLimit(PAGE_SIZE);
            }}
          >
            Earthquakes ({quakeSmsCount})
          </button>
        </div>
        <span className="dm-filter-count">
          Showing {visibleMessages.length} of {filteredOutbox.length}
        </span>
      </div>

      {verifiedCount === 0 && filteredOutbox.length === 0 ? (
        <div className="dm-empty-box">
          <p className="sr-empty-title">No verified subscribers</p>
          <p className="sr-sub">
            Only Verified subscribers receive demo SMS. Pending and Unsubscribed records never receive messages.
          </p>
        </div>
      ) : filteredOutbox.length === 0 ? (
        <div className="dm-empty-box">
          <p className="sr-empty-title">
            {outbox.length === 0
              ? 'No simulated SMS in outbox yet'
              : 'No simulated SMS match this filter'}
          </p>
          <p className="sr-sub">
            {outbox.length === 0
              ? 'Click "Run check now", switch Mode to Broadcast, or expand the earthquake look-back window.'
              : 'Try switching back to All to inspect all delivered demo messages.'}
          </p>
        </div>
      ) : (
        <div className="dm-msg-list">
          {visibleMessages.map((msg) => (
            <article
              key={msg.id}
              className={`dm-msg-card${msg.read ? '' : ' dm-msg-unread'}`}
            >
              <div className="dm-msg-head">
                <div className="dm-msg-who">
                  <span className="sr-mono sr-strong">{msg.toMasked}</span>
                  <span className="dm-msg-state">
                    {msg.district ? `${msg.district}, ${msg.state}` : msg.state}
                  </span>
                </div>
                <div className="dm-msg-badges">
                  <span className={`dm-type-pill dm-type-${msg.kind}`}>
                    {msg.kind === 'alert' ? 'Alert' : 'Earthquake'}
                  </span>
                  <span className="dm-badge-chip">{msg.badgeText}</span>
                  <span className="dm-sim-chip">Simulated</span>
                  {!msg.read && <span className="dm-unread-dot" aria-label="Unread" title="Unread" />}
                  <span className="dm-msg-time sr-mono">{formatIstShort(msg.createdAt)}</span>
                </div>
              </div>
              <div className="dm-body-bubble">{msg.body}</div>
              <div className="dm-msg-foot">
                <span>Subscriber {msg.subscriptionId}</span>
                <span>{msg.source}</span>
                <span className="sr-mono">{msg.body.length}/160 chars</span>
              </div>
            </article>
          ))}

          {filteredOutbox.length > showLimit && (
            <div className="dm-more-wrap">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowLimit((n) => n + PAGE_SIZE)}
              >
                Show more ({filteredOutbox.length - showLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
