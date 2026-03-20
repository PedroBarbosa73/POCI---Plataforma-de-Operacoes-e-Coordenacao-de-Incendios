'use client';

import { useState } from 'react';
import Panel from './Panel';
import { statusBadge, incidentStatusLabel } from '../../lib/labels';

export default function IncidentsPanel({
  incidents,
  allCount,
  selectedIncidentId,
  selectedIncident,
  onSelectIncident,
  onClearSelection,
}) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? incidents.filter((inc) =>
        inc.name.toLowerCase().includes(query.toLowerCase()) ||
        inc.id.toLowerCase().includes(query.toLowerCase()) ||
        inc.area.toLowerCase().includes(query.toLowerCase())
      )
    : incidents;

  return (
    <Panel title="Incidentes" icon="F" badge={allCount} badgeClass="red">
      <div className="search-wrapper">
        <span className="search-icon">Q</span>
        <input
          className="search-input"
          placeholder="Pesquisar incidentes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {selectedIncident && !query && (
        <div className="btn-row">
          <button className="btn btn-ghost btn-sm" onClick={onClearSelection}>
            Mostrar todos
          </button>
          <div className="card-meta">Selecionado: {selectedIncident.name}</div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="card-meta" style={{ padding: '8px 4px' }}>Sem resultados.</div>
      )}

      {filtered.map((incident) => (
        <div
          key={incident.id}
          className={`card ${incident.id === selectedIncidentId ? 'selected' : ''}`}
          onClick={() => onSelectIncident(incident.id)}
        >
          <div className="card-header">
            <div className="card-name">{incident.name}</div>
            <span className={statusBadge(incident.status)}>{incidentStatusLabel(incident.status)}</span>
          </div>
          <div className="card-meta">
            <span>{incident.id}</span>
            <span>{incident.area}</span>
            <span>{incident.updated_at
              ? new Date(incident.updated_at).toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
              : incident.updated ?? '—'}</span>
            <span>{incident.units} unidades</span>
          </div>
        </div>
      ))}
    </Panel>
  );
}
