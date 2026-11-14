import { BrandMark } from './Icons';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <div className="brand" style={{ gap: 11 }}>
              <BrandMark size={36} />
              <span className="brand-name" style={{ fontSize: 18 }}>JalDrishti</span>
            </div>
            <p className="footer-tag">An independent geographical-intelligence prototype for exploring India's water-related disaster history. Not affiliated with any government body.</p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <h5>Explore</h5>
              <a href="#map">Disaster Map</a>
              <a href="#analytics">Analytics</a>
              <a href="#about">Data &amp; Methodology</a>
            </div>
            <div className="footer-col">
              <h5>Official sources</h5>
              <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">IMD</a>
              <a href="https://cwc.gov.in/" target="_blank" rel="noreferrer">Central Water Commission</a>
              <a href="https://ndma.gov.in/" target="_blank" rel="noreferrer">NDMA</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} JalDrishti · Prototype dataset — verify before operational use.</span>
          <span>Boundaries: authentic administrative GeoJSON · Built as an independent project.</span>
        </div>
      </div>
    </footer>
  );
}