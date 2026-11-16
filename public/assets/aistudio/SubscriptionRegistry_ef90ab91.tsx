import { useCallback, useEffect, useMemo, useState } from 'react';
import { STATES } from '../data/states';
import { HAZARD_LABEL, HAZARD_ORDER, HAZARD_SHORT, type HazardGroup } from '../lib/sachet';
import {
  CHANGE_EVENT,
  SUB_STATUSES,
  formatPhone,
  loadSubscriptions,
  maskPhone,
  normalizePhone,
  resetSampleSubscriptions,
  saveSubscriptions,
  todayStr,
  withStatus,
  type SubStatus,
  type Subscription,
} from '../lib/subscriptions';
import { CloseIcon } from './Icons';

type SortMode = 'date-desc' | 'date-asc' | 'status';

const STATUS_RANK: Record<SubStatus, number> = { Verified: 1, Pending: 2, Unsubscribed: 3 };
const STATUS_CLASS: Record<SubStatus, string> = {
  Verified: 'sr-status-verified',
  Pending: 'sr-status-pending',
  Unsubscribed: 'sr-status-unsub',
};

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function SubscriptionRegistry() {
  const [subs, setSubs] = useState<Subscription[]>(() => loadSubscriptions());
  const [query, setQuery] = useState('');
  const [fState, setFState] = useState('ALL');
  const [fHazard, setFHazard] = useState<'ALL' | HazardGroup>('ALL');
  const [fStatus, setFStatus] = useState<'ALL' | SubStatus>('ALL');
  const [sort, setSort] = useState<SortMode>('date-desc');

  const [editing, setEditing] = useState<Subscription | null>(null);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Keep in sync when the form (or another tab) changes the data
  useEffect(() => {
    const refresh = () => setSubs(loadSubscriptions());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) setEditing(null);
      else if (deleting) setDeleting(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, deleting]);

  const commit = useCallback((next: Subscription[], message: string) => {
    saveSubscriptions(next); // fires CHANGE_EVENT, which refreshes state
    setSubs(next);
    setToast(message);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = subs.filter((s) => {
      if (fState !== 'ALL' && s.state !== fState) return false;
      if (fHazard !== 'ALL' && !s.hazards.includes(fHazard)) return false;
      if (fStatus !== 'ALL' && s.status !== fStatus) return false;
      if (q) {
        const hit =
          s.id.toLowerCase().includes(q) ||
          s.phone.includes(q.replace(/\D/g, '') || '\u0000') ||
          s.state.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === 'status') {
        const d = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (d !== 0) return d;
        return b.subscribedDate.localeCompare(a.subscribedDate) || a.id.localeCompare(b.id);
      }
      const d = a.subscribedDate.localeCompare(b.subscribedDate);
      if (d !== 0) return sort === 'date-asc' ? d : -d;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [subs, query, fState, fHazard, fStatus, sort]);

  const hasFilters = query.trim() !== '' || fState !== 'ALL' || fHazard !== 'ALL' || fStatus !== 'ALL';

  const clearFilters = () => {
    setQuery('');
    setFState('ALL');
    setFHazard('ALL');
    setFStatus('ALL');
  };

  const changeStatus = (id: string, next: SubStatus) => {
    commit(
      subs.map((s) => (s.id === id ? withStatus(s, next) : s)),
      `${id} status updated to ${next}.`,
    );
  };

  const exportCsv = () => {
    if (visible.length === 0) {
      setToast('No matching subscriptions to export.');
      return;
    }
    const header = ['Subscription ID', 'Mobile (masked)', 'Area', 'Hazards', 'Status', 'Subscribed Date', 'Verified Date'];
    const lines = [header.map(csvCell).join(',')];
    for (const s of visible) {
      lines.push(
        [
          s.id,
          maskPhone(s.phone),
          s.state,
          s.hazards.map((h) => HAZARD_SHORT[h]).join('; '),
          s.status,
          s.subscribedDate,
          s.verifiedDate ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    try {
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscriptions_${todayStr()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(`Exported ${visible.length} subscription(s) to CSV.`);
    } catch {
      setToast('Unable to download CSV in this browser context.');
    }
  };

  const toggleSort = (kind: 'date' | 'status') => {
    if (kind === 'date') setSort(sort === 'date-desc' ? 'date-asc' : 'date-desc');
    else setSort('status');
  };

  return (
    <section className="card sr-card" aria-labelledby="sr-heading">
      <div className="sr-head">
        <div>
          <h3 id="sr-heading">Subscription registry</h3>
          <p className="sr-sub">
            Showing {visible.length} of {subs.length} subscriptions. Mobile numbers are masked in the table.
          </p>
        </div>
        <div className="sr-head-actions">
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Reset filters
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              resetSampleSubscriptions();
              setSubs(loadSubscriptions());
              clearFilters();
              setToast('Sample subscriptions restored.');
            }}
          >
            Reset sample data
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportCsv}>
            Export CSV ({visible.length})
          </button>
        </div>
      </div>

      <div className="toolbar-row sr-toolbar" role="search">
        <div className="field grow">
          <label htmlFor="sr-search">Search</label>
          <input
            id="sr-search"
            type="search"
            placeholder="Search by ID, mobile number or area..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sr-state">Area</label>
          <select id="sr-state" value={fState} onChange={(e) => setFState(e.target.value)}>
            <option value="ALL">All areas</option>
            {STATES.map((st) => (
              <option key={st.code} value={st.name}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sr-hazard">Hazard</label>
          <select id="sr-hazard" value={fHazard} onChange={(e) => setFHazard(e.target.value as 'ALL' | HazardGroup)}>
            <option value="ALL">All hazards</option>
            {HAZARD_ORDER.map((h) => (
              <option key={h} value={h}>
                {HAZARD_LABEL[h]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sr-status">Status</label>
          <select id="sr-status" value={fStatus} onChange={(e) => setFStatus(e.target.value as 'ALL' | SubStatus)}>
            <option value="ALL">All statuses</option>
            {SUB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sr-sort">Sort by</label>
          <select id="sr-sort" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="date-desc">Date: newest first</option>
            <option value="date-asc">Date: oldest first</option>
            <option value="status">Status: verified first</option>
          </select>
        </div>
      </div>

      <div className="sr-table-wrap">
        <table className="sr-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Mobile</th>
              <th scope="col">Area</th>
              <th scope="col">Hazards</th>
              <th scope="col">
                <button type="button" className="sr-th-btn" onClick={() => toggleSort('status')}>
                  Status {sort === 'status' ? '▼' : ''}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="sr-th-btn" onClick={() => toggleSort('date')}>
                  Dates {sort === 'date-desc' ? '▼' : sort === 'date-asc' ? '▲' : ''}
                </button>
              </th>
              <th scope="col" className="sr-col-actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="sr-mono sr-strong">{s.id}</span>
                </td>
                <td>
                  <span className="sr-mono">{maskPhone(s.phone)}</span>
                </td>
                <td>{s.state}</td>
                <td>
                  <div className="sr-hazards">
                    {s.hazards.length === 0 && <span className="sr-muted">None</span>}
                    {s.hazards.map((h) => (
                      <span className="badge badge-type" key={h}>
                        {HAZARD_SHORT[h]}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <select
                    className={`sr-status-select ${STATUS_CLASS[s.status]}`}
                    value={s.status}
                    aria-label={`Change status for ${s.id}`}
                    onChange={(e) => changeStatus(s.id, e.target.value as SubStatus)}
                  >
                    {SUB_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="sr-dates">
                    <div>
                      <span className="sr-muted">Sub: </span>
                      <span className="sr-mono">{s.subscribedDate}</span>
                    </div>
                    {s.status === 'Verified' && s.verifiedDate && (
                      <div>
                        <span className="sr-muted">Ver: </span>
                        <span className="sr-mono">{s.verifiedDate}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div className="sr-row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label={`Edit subscription ${s.id}`}
                      onClick={() => setEditing(s)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm sr-danger"
                      aria-label={`Delete subscription ${s.id}`}
                      onClick={() => setDeleting(s)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <div className="sr-empty">
          <p className="sr-empty-title">
            {subs.length === 0 ? 'No subscriptions yet.' : 'No subscriptions match your current filters.'}
          </p>
          <p className="sr-sub">
            {subs.length === 0
              ? 'New subscriptions will appear here once someone subscribes.'
              : 'Try clearing your search or filter selections to view all records.'}
          </p>
          {subs.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear active filters
            </button>
          )}
        </div>
      )}

      {editing && (
        <EditModal
          sub={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            commit(
              subs.map((s) => (s.id === updated.id ? updated : s)),
              `Updated subscription ${updated.id}.`,
            );
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <div className="sr-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setDeleting(null)}>
          <div className="sr-modal sr-modal-sm card" role="dialog" aria-modal="true" aria-labelledby="sr-del-title">
            <div className="sr-modal-head">
              <h3 id="sr-del-title">Confirm deletion</h3>
              <button type="button" className="btn-icon" aria-label="Close" onClick={() => setDeleting(null)}>
                <CloseIcon />
              </button>
            </div>
            <p className="sr-modal-text">
              Delete subscription <strong>{deleting.id}</strong> ({maskPhone(deleting.phone)})?
            </p>
            <p className="sr-sub">This removes the record permanently. Its ID will never be reused.</p>
            <div className="sr-modal-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm sr-btn-danger"
                autoFocus
                onClick={() => {
                  commit(
                    subs.filter((s) => s.id !== deleting.id),
                    `Deleted subscription ${deleting.id}.`,
                  );
                  setDeleting(null);
                }}
              >
                Delete subscription
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sr-toast-region" aria-live="polite" aria-atomic="true">
        {toast && <div className="sr-toast">{toast}</div>}
      </div>
    </section>
  );
}

function EditModal({
  sub,
  onClose,
  onSave,
}: {
  sub: Subscription;
  onClose: () => void;
  onSave: (s: Subscription) => void;
}) {
  const [phone, setPhone] = useState(formatPhone(sub.phone));
  const [state, setState] = useState(sub.state);
  const [hazards, setHazards] = useState<HazardGroup[]>(sub.hazards);
  const [status, setStatus] = useState<SubStatus>(sub.status);
  const [errors, setErrors] = useState<{ phone?: string; hazards?: string }>({});

  const toggleHazard = (h: HazardGroup) =>
    setHazards((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    const next: typeof errors = {};
    if (!normalized) next.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6-9).';
    if (hazards.length === 0) next.hazards = 'Select at least one hazard.';
    setErrors(next);
    if (next.phone || next.hazards || !normalized) return;

    const base: Subscription = { ...sub, phone: normalized, state, hazards: HAZARD_ORDER.filter((h) => hazards.includes(h)) };
    onSave(withStatus(base, status));
  };

  const hint =
    status === 'Verified'
      ? `Verified date will be recorded as ${sub.status === 'Verified' && sub.verifiedDate ? sub.verifiedDate : todayStr()}.`
      : 'Verified date will be cleared.';

  return (
    <div className="sr-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sr-modal card" role="dialog" aria-modal="true" aria-labelledby="sr-edit-title">
        <div className="sr-modal-head">
          <div>
            <h3 id="sr-edit-title">Edit subscription</h3>
            <p className="sr-sub">Update details or change status.</p>
          </div>
          <button type="button" className="btn-icon" aria-label="Close edit dialog" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="sr-form-grid">
            <div className="field">
              <label htmlFor="sr-e-id">Subscription ID</label>
              <input id="sr-e-id" value={sub.id} readOnly className="sr-readonly" />
            </div>
            <div className="field">
              <label htmlFor="sr-e-status">Status</label>
              <select id="sr-e-status" value={status} onChange={(e) => setStatus(e.target.value as SubStatus)}>
                {SUB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sr-e-phone">Mobile number</label>
              <input
                id="sr-e-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={Boolean(errors.phone)}
                autoFocus
              />
              {errors.phone && <span className="sr-error">{errors.phone}</span>}
            </div>
            <div className="field">
              <label htmlFor="sr-e-state">Area</label>
              <select id="sr-e-state" value={state} onChange={(e) => setState(e.target.value)}>
                {STATES.map((st) => (
                  <option key={st.code} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="sr-fieldset sr-span-full">
              <legend>Hazards</legend>
              <div className="sr-checks">
                {HAZARD_ORDER.map((h) => (
                  <label key={h} className="sr-check">
                    <input type="checkbox" checked={hazards.includes(h)} onChange={() => toggleHazard(h)} />
                    <span>{HAZARD_LABEL[h]}</span>
                  </label>
                ))}
              </div>
              {errors.hazards && <span className="sr-error">{errors.hazards}</span>}
            </fieldset>
          </div>

          <p className="sr-hint">{hint}</p>

          <div className="sr-modal-foot">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
