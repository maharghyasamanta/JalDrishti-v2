import { DATA_SOURCES } from '../data/sources';
import { ExternalIcon, InfoIcon } from './Icons';

export default function DataSources() {
  return (
    <section className="section" id="about">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Transparency</span>
          <h2 className="section-title">Data Sources &amp; Methodology</h2>
          <p className="section-sub">
            This is an independent frontend prototype. A production deployment would ingest verified records
            from the official bodies below. Every record carries its source, event date, location, a last-reviewed
            date and an explicit verification status.
          </p>
        </div>

        <div className="sources-grid">
          {DATA_SOURCES.map((s) => (
            <div className="card source-card" key={s.abbr}>
              <div className="source-abbr">{s.abbr}</div>
              <div className="source-name">{s.name}</div>
              <div className="source-desc">{s.role}</div>
              <a className="source-link" href={s.url} target="_blank" rel="noreferrer">Official portal <ExternalIcon /></a>
            </div>
          ))}
        </div>

        <div className="card methodology">
          <h3>How to read this prototype</h3>
          <ul>
            <li><b>Geography:</b> state and Union Territory boundaries are rendered from an authentic administrative GeoJSON (all 28 states + 8 UTs, post-2019/2020), dissolved from district geometry. Islands are shown as labelled insets.</li>
            <li><b>Records:</b> the catalogue mixes widely-reported historical events with clearly-labelled <b>demo</b> records used only to demonstrate coverage. No coordinates, damage figures or affected-population counts are invented; locations use real district/town coordinates labelled by precision.</li>
            <li><b>Verification status:</b> shown on every record — <i>Documented</i> (widely-reported major event), <i>Reported</i> (appears in agency/media reports, unverified specifics), <i>Demo</i> (illustrative, not a historical claim).</li>
            <li><b>Sources:</b> per-record source URLs point to the issuing body's official portal; deep links to specific bulletins will be attached when the verified database is connected.</li>
            <li><b>Not for operational use:</b> cross-check all records against the cited official sources before any decision-making.</li>
          </ul>
          <div className="verification-legend">
            <span className="badge badge-verified"><span className="badge-dot" style={{ background: 'currentColor' }} /> Documented</span>
            <span className="badge badge-reported"><span className="badge-dot" style={{ background: 'currentColor' }} /> Reported</span>
            <span className="badge badge-demo"><span className="badge-dot" style={{ background: 'currentColor' }} /> Demo</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><InfoIcon /> Last-reviewed date reflects catalogue assembly, not official re-verification.</span>
          </div>
        </div>
      </div>
    </section>
  );
}