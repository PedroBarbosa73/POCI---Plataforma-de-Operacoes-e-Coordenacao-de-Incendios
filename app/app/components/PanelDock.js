'use client';

import { useState } from 'react';

// incidentOnly: only relevant when an incident is selected
// noIncidentOnly: only relevant when no incident is selected
const LEFT_PANELS = [
  { id: 'incidents', icon: 'F', label: 'Incidentes', noIncidentOnly: true },
  { id: 'zones',     icon: 'Z', label: 'Zonas',      incidentOnly: true },
  { id: 'closures',  icon: 'C', label: 'Cortes',     incidentOnly: true },
];

const RIGHT_PANELS = [
  { id: 'units',   icon: 'U', label: 'Unidades' },
  { id: 'alerts',  icon: 'A', label: 'Alertas',  incidentOnly: true },
  { id: 'weather', icon: 'M', label: 'Meteo',    incidentOnly: true },
  { id: 'radio',   icon: 'R', label: 'Rádio' },
];

export default function PanelDock({ visiblePanels, onToggle, selectedIncidentId }) {
  const [collapsed, setCollapsed] = useState(false);

  function renderBtn(p) {
    const isDisabled = (p.incidentOnly && !selectedIncidentId) ||
                       (p.noIncidentOnly && !!selectedIncidentId);
    return (
      <button
        key={p.id}
        className={`panel-dock-btn ${visiblePanels[p.id] ? 'active' : ''} ${isDisabled ? 'dock-btn-disabled' : ''}`}
        onClick={() => !isDisabled && onToggle(p.id)}
        title={isDisabled ? `${p.label} (selecione um incidente)` : visiblePanels[p.id] ? `Ocultar ${p.label}` : `Mostrar ${p.label}`}
      >
        <span className="panel-dock-icon">{p.icon}</span>
        <span className="panel-dock-label">{p.label}</span>
      </button>
    );
  }

  return (
    <div className={`panel-dock ${collapsed ? 'panel-dock-collapsed' : ''}`}>
      {collapsed ? (
        <button
          className="panel-dock-toggle-btn"
          onClick={() => setCollapsed(false)}
          title="Mostrar painéis"
        >
          ▲ Painéis
        </button>
      ) : (
        <>
          <div className="panel-dock-group">
            {LEFT_PANELS.map(renderBtn)}
          </div>

          <div className="panel-dock-sep" />

          <div className="panel-dock-group">
            {RIGHT_PANELS.map(renderBtn)}
          </div>

          <div className="panel-dock-sep" />

          <button
            className="panel-dock-collapse-btn"
            onClick={() => setCollapsed(true)}
            title="Minimizar barra"
          >
            ▼
          </button>
        </>
      )}
    </div>
  );
}
