import PageHeader from '../components/PageHeader';
import LiveAlertsMap from '../components/LiveAlertsMap';

export default function LiveAlerts() {
  return (
    <div className="live-alerts-page">
      <PageHeader
        title="Live Weather & Hazard Alerts"
        subtitle="Real-time disaster and extreme weather warnings across Indian states and UTs, aggregated from NDMA SACHET."
        badge="Real-time Monitoring"
      />
      <div style={{ paddingTop: 20 }}>
        <LiveAlertsMap />
      </div>
    </div>
  );
}
