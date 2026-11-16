import { useEffect, useRef, useState } from 'react';
import DemoOutbox from '../components/DemoOutbox';
import { InfoIcon } from '../components/Icons';
import PageHeader from '../components/PageHeader';
import SubscriptionRegistry from '../components/SubscriptionRegistry';
import { STATES } from '../data/states';
import {
  SUB_HAZARD_LABEL,
  SUB_HAZARD_ORDER,
  loadSubscriptions,
  nextSubscriptionId,
  normalizePhone,
  normalizePincode,
  resolvePincode,
  saveSubscriptions,
  todayStr,
  withStatus,
  type SubHazard,
  type SubStatus,
  type Subscription,
} from '../lib/subscriptions';

const STEPS = [
  {
    num: '01 · Subscribe',
    title: 'Subscribe',
    desc: 'Enter your mobile number, area and the hazards you care about.',
  },
  {
    num: '02 · Verify',
    title: 'Verify',
    desc: 'Confirm consent as Verified (Pending subscribers never receive SMS).',
  },
  {
    num: '03 · Get alerts',
    title: 'Get alerts',
    desc: 'See simulated SMS warnings generated from live alerts and India earthquakes.',
  },
];

const DEFAULT_HAZARDS: SubHazard[] = ['water', 'storm', 'earthquake'];

export default function Subscribe() {
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState(STATES[0]?.name ?? 'Assam');
  const [district, setDistrict] = useState('');
  const [locality, setLocality] = useState('');
  const [status, setStatus] = useState<SubStatus>('Verified');
  const [hazards, setHazards] = useState<SubHazard[]>(DEFAULT_HAZARDS);

  const [errors, setErrors] = useState<{ pincode?: string; phone?: string; hazards?: string }>({});
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'loading' | 'resolved' | 'failed'>('idle');
  const [resolvedState, setResolvedState] = useState<string | null>(null);
  const [submittedNote, setSubmittedNote] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const validPin = normalizePincode(pincode);
    if (!validPin) {
      setLookupStatus('idle');
      setResolvedState(null);
      setDistrict('');
      setLocality('');
      return;
    }

    const ctl = new AbortController();
    setLookupStatus('loading');

    const timer = window.setTimeout(() => {
      resolvePincode(validPin, ctl.signal)
        .then((res) => {
          if (ctl.signal.aborted) return;
          if (!res) {
            setLookupStatus('failed');
            setResolvedState(null);
            setDistrict('');
            setLocality('');
            return;
          }
          setDistrict(res.district);
          setLocality(res.locality);
          setResolvedState(res.state);
          setState(res.state);
          setLookupStatus('resolved');
        })
        .catch(() => {
          if (!ctl.signal.aborted) {
            setLookupStatus('failed');
            setResolvedState(null);
          }
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [pincode]);

  const mismatchWarning =
    resolvedState && state !== resolvedState ? `Pincode belongs to ${resolvedState}` : null;

  const toggleHazard = (h: SubHazard) => {
    setHazards((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validPin = normalizePincode(pincode);
    const validPhone = normalizePhone(phone);
    const nextErrs: typeof errors = {};

    if (!validPin) nextErrs.pincode = 'Enter a valid 6-digit pincode (cannot start with 0).';
    if (!validPhone) nextErrs.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6-9).';
    if (hazards.length === 0) nextErrs.hazards = 'Select at least one hazard.';
    setErrors(nextErrs);
    if (nextErrs.pincode || nextErrs.phone || nextErrs.hazards || !validPin || !validPhone) return;

    const existing = loadSubscriptions();
    const id = nextSubscriptionId(existing);
    const base: Subscription = {
      id,
      pincode: validPin,
      phone: validPhone,
      state,
      district: district.trim() || undefined,
      locality: locality.trim() || undefined,
      hazards: SUB_HAZARD_ORDER.filter((h) => hazards.includes(h)),
      status,
      subscribedDate: todayStr(),
    };
    const created = withStatus(base, status);
    saveSubscriptions([created, ...existing]);

    setPincode('');
    setPhone('');
    setDistrict('');
    setLocality('');
    setResolvedState(null);
    setLookupStatus('idle');
    setHazards(DEFAULT_HAZARDS);
    setErrors({});
    setSubmittedNote(
      status === 'Verified'
        ? `Added ${id} (${created.district ? `${created.district}, ` : ''}${created.state}) as Verified. Matching alerts and India earthquakes are simulated in the outbox below.`
        : `Added ${id} (${created.district ? `${created.district}, ` : ''}${created.state}) as Pending. Pending subscribers do not receive demo SMS until verified.`,
    );
  };

  return (
    <div className="subscribe-page">
      <PageHeader
        title="SMS Alerts"
        subtitle="Get disaster and weather alerts for your area by SMS."
        badge="Demo"
      />

      <main className="map-section">
        <div className="container">
          <div className="prototype-banner">
            <InfoIcon />
            <span>
              <strong>Demo:</strong> SMS are simulated locally in this browser. Real delivery needs DLT registration and an SMS gateway. In an emergency call 112.
            </span>
          </div>

          <div className="sources-grid">
            {STEPS.map((step) => (
              <div className="card source-card" key={step.title}>
                <div className="source-abbr">{step.num}</div>
                <div className="source-name">{step.title}</div>
                <div className="source-desc">{step.desc}</div>
              </div>
            ))}
          </div>

          <section className="card methodology dm-form-card" aria-labelledby="dm-form-title">
            <h3 id="dm-form-title">Demo SMS subscription</h3>
            <p className="section-sub dm-form-sub">
              Add a demo subscriber using any 6-digit Indian pincode. Verified subscribers immediately participate in simulated SMS dispatch below.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="dm-form-grid">
                <div className="field">
                  <label htmlFor="sub-pincode">Pincode</label>
                  <input
                    id="sub-pincode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]*"
                    placeholder="e.g. 781001"
                    value={pincode}
                    onChange={(e) => {
                      setPincode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setSubmittedNote(null);
                    }}
                    aria-invalid={Boolean(errors.pincode)}
                  />
                  {errors.pincode && <span className="sr-error">{errors.pincode}</span>}
                  {lookupStatus === 'loading' && <span className="sr-note">Looking up pincode…</span>}
                  {lookupStatus === 'resolved' && district && (
                    <span className="sr-note">
                      Resolved: {locality ? `${locality}, ` : ''}
                      {district}, {resolvedState ?? state}
                    </span>
                  )}
                  {lookupStatus === 'failed' && (
                    <span className="sr-note">Could not resolve pincode. Selected area will be used.</span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="sub-phone">Mobile number</label>
                  <input
                    id="sub-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setSubmittedNote(null);
                    }}
                    aria-invalid={Boolean(errors.phone)}
                  />
                  {errors.phone && <span className="sr-error">{errors.phone}</span>}
                </div>

                <div className="field">
                  <label htmlFor="sub-state">State / UT</label>
                  <select
                    id="sub-state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  >
                    {STATES.map((st) => (
                      <option key={st.code} value={st.name}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                  {mismatchWarning && (
                    <span className="sr-warn-note" role="status">
                      {mismatchWarning}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="sub-status">Verification status</label>
                  <select
                    id="sub-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SubStatus)}
                  >
                    <option value="Verified">Verified (receives demo SMS)</option>
                    <option value="Pending">Pending (consent unverified, no SMS)</option>
                  </select>
                </div>

                <fieldset className="sr-fieldset sr-span-full">
                  <legend>Hazards</legend>
                  <div className="sr-checks">
                    {SUB_HAZARD_ORDER.map((h) => (
                      <label key={h} className="sr-check">
                        <input
                          type="checkbox"
                          checked={hazards.includes(h)}
                          onChange={() => toggleHazard(h)}
                        />
                        <span>{SUB_HAZARD_LABEL[h]}</span>
                      </label>
                    ))}
                  </div>
                  {errors.hazards && <span className="sr-error">{errors.hazards}</span>}
                </fieldset>
              </div>

              <div className="dm-form-foot">
                <button type="submit" className="btn btn-primary btn-sm">
                  Add demo subscription
                </button>
                <span className="dm-form-note">
                  Stored only in your browser&apos;s localStorage. Mobile numbers are masked in tables and outbox.
                </span>
              </div>

              {submittedNote && (
                <div className="dm-summary" role="status" style={{ marginTop: 14 }}>
                  {submittedNote}
                </div>
              )}
            </form>
          </section>

          <SubscriptionRegistry />
          <DemoOutbox />
        </div>
      </main>
    </div>
  );
}
