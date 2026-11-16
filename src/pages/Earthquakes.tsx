import PageHeader from '../components/PageHeader';
import EarthquakeMap from '../components/EarthquakeMap';

export default function Earthquakes() {
  return (
    <div className="earthquakes-page">
      <PageHeader
        title="Seismic Activity & Earthquake History"
        subtitle="Last 30 days of earthquake epicenters across India and surrounding regions with BIS seismic hazard zones."
        badge="NCS Live Feed"
      />
      <EarthquakeMap />
    </div>
  );
}
