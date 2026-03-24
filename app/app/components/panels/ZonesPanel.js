'use client';

import Panel from './Panel';

function zoneTypeLabel(type) {
  switch (type) {
    case 'exclusao': return 'Exclusão';
    case 'seguranca': return 'Segurança';
    default: return 'Ataque';
  }
}

export default function ZonesPanel({ zones }) {
  return (
    <Panel title="Zonas operacionais" icon="Z" badge={zones.length}>
      {zones.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">P</div>
          Sem zonas desenhadas. Use &quot;Nova zona&quot;.
        </div>
      ) : null}

      {zones.map((zone) => (
        <div key={zone.id} className="card">
          <div className="card-header">
            <div className="card-name">{zone.name}</div>
            <span className="badge badge-medium">{zoneTypeLabel(zone.type)}</span>
          </div>
          <div className="card-meta">{zone.radiusKm ? `Raio: ${zone.radiusKm} km` : 'Polígono desenhado'}</div>
        </div>
      ))}
    </Panel>
  );
}
