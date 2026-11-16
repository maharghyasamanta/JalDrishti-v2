import PageHeader from '../components/PageHeader';
import { InfoIcon } from '../components/Icons';

const STEPS = [
  {
    num: '01 · Subscribe',
    title: 'Subscribe',
    desc: 'Enter your mobile number, area and the hazards you care about.',
  },
  {
    num: '02 · Verify',
    title: 'Verify',
    desc: 'Confirm with a one-time code.',
  },
  {
    num: '03 · Get alerts',
    title: 'Get alerts',
    desc: 'Receive short SMS alerts for your area.',
  },
];

export default function Subscribe() {
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
              <strong>Demo:</strong> SMS are simulated. Real delivery needs DLT registration and an MSG91 account. In an emergency call 112.
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

          <div className="card methodology">
            <h3>Subscription form</h3>
            <p className="section-sub" style={{ marginTop: 0, marginBottom: 18 }}>
              The subscription form will appear here in the next step.
            </p>
            <button type="button" className="btn btn-primary" disabled>
              Subscribe (coming next)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
