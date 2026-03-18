'use client';

import { useState } from 'react';
import Panel from './Panel';
import { unitBadge, unitStatusLabel } from '../../lib/labels';

export default function UnitsPanel({ units, allUnits, unitStatuses = {}, allCount, totalCount, selectedUnitId, demoMode, onToggleDemoMode, onSelectUnit }) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? units.filter((u) =>
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.id.toLowerCase().includes(query.toLowerCase())
      )
    : units;

  const totalDeployed = (allUnits || units).length;

  return (
    <Panel title="Unidades e recursos" icon="U" badge={totalCount ? `${allCount} / ${totalCount}` : allCount} badgeClass="blue">
      <div className="demo-toggle" onClick={onToggleDemoMode}>
        <div className={`toggle-switch ${demoMode ? 'on' : ''}`}>
          <div className="toggle-knob"></div>
        </div>
        Modo demonstração (mock units)
      </div>

      {/* Deployment summary */}
      <div className="units-total">
        <span className="units-total-val">{totalCount ? allCount : totalDeployed}</span>
        <span className="units-total-lbl">
          {totalCount ? `unidades nesta ocorrência` : `unidades no total`}
        </span>
      </div>

      <div className="search-wrapper">
        <span className="search-icon">Q</span>
        <input
          className="search-input"
          placeholder="Pesquisar unidades"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <div className="card-meta" style={{ padding: '8px 4px' }}>Sem resultados.</div>
      )}

      {filtered.map((unit) => (
        <div
          key={unit.id}
          className={`card ${unit.id === selectedUnitId ? 'selected' : ''}`}
          onClick={() => onSelectUnit(unit.id)}
        >
          <div className="card-header">
            <div className="card-name">
              <span className={`type-${unit.type}`}>{unit.name}</span>
            </div>
            <span className={unitBadge(unitStatuses[unit.id] || unit.status)}>{unitStatusLabel(unitStatuses[unit.id] || unit.status)}</span>
          </div>
          <div className="card-meta">
            <span>{unit.id}</span>
            <span>{unit.incident || 'Livre'}</span>
          </div>
        </div>
      ))}
    </Panel>
  );
}
