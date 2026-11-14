import { CATEGORIES } from '../data/categories';

export default function MapLegend() {
  return (
    <div className="map-legend" aria-label="Map legend">
      <h5>Disaster category</h5>
      {CATEGORIES.map((c) => (
        <div className="legend-item" key={c.key}>
          <span className="legend-swatch" style={{ background: c.color }} />
          {c.short}
        </div>
      ))}
    </div>
  );
}