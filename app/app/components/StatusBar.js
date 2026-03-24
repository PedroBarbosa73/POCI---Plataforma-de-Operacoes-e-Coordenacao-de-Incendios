export default function StatusBar({ incidentCounts }) {
  return (
    <div className="status-bar">
      <span className="status-bar-dot"></span>
      Sistema operacional | {incidentCounts.active} ativos | {incidentCounts.controlled} controlados
      <span className="status-sep">|</span> Vigilância: {incidentCounts.surveillance}
    </div>
  );
}
