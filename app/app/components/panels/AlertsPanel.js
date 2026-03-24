'use client';

import Panel from './Panel';
import { alertBadge, alertLevelLabel } from '../../lib/labels';

export default function AlertsPanel({ alerts, incidentId, defaultExpanded = true }) {
  const filtered = incidentId
    ? alerts.filter((a) => a.incidentId === incidentId || a.incidentId === null)
    : alerts;

  return (
    <Panel title="Alertas" icon="A" badge={filtered.length} badgeClass="red" defaultExpanded={defaultExpanded}>
      {filtered.length === 0 ? (
        <div className="panel-empty">Sem alertas para esta ocorrência.</div>
      ) : (
        filtered.map((alert) => (
          <div key={alert.id} className="card">
            <div className="card-header">
              <div className="card-name">{alert.title}</div>
              <span className={alertBadge(alert.level)}>{alertLevelLabel(alert.level)}</span>
            </div>
            <div className="card-meta">
              <span>{alert.id}</span>
              <span>{alert.target}</span>
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}
