'use client';

import Link from 'next/link';
import { statusBadge, incidentStatusLabel, closureStatusLabel } from '../lib/labels';
import WeatherPanel from './panels/WeatherPanel';
import RadioPanel from './panels/RadioPanel';

const ZONE_COLORS = {
  exclusao: 'var(--accent-red)',
  ataque: 'var(--accent-orange)',
  seguranca: 'var(--accent-green)',
  apoio: 'var(--accent-blue)',
};

const ZONE_LABELS = {
  exclusao: 'Exclusão',
  ataque: 'Ataque',
  seguranca: 'Segurança',
  apoio: 'Apoio',
};

function StatBox({ label, value, sub, color }) {
  return (
    <div className="inc-stat-box">
      <div className="inc-stat-value" style={color ? { color } : {}}>
        {value}
      </div>
      <div className="inc-stat-label">{label}</div>
      {sub ? <div className="inc-stat-sub">{sub}</div> : null}
    </div>
  );
}

export default function IncidentDetail({ incident, units, unitStatuses = {}, closures, zones, weatherLat, weatherLng, onClose, visiblePanels = {}, onDeleteZone, onDeleteClosure, drawnClosureIds = new Set(), onDrawZone, onDrawClosure }) {
  const onscene = units.filter((u) => (unitStatuses[u.id] || u.status) === 'onscene').length;
  const enroute = units.filter((u) => (unitStatuses[u.id] || u.status) === 'enroute').length;

  return (
    <div className="inc-detail">
      {/* Header */}
      <div className="inc-detail-header">
        <button className="inc-back-btn" onClick={onClose}>
          ← Voltar
        </button>
        <div className="inc-detail-name">{incident.name}</div>
        <div className="inc-detail-meta">
          <span className={statusBadge(incident.status)}>
            {incidentStatusLabel(incident.status)}
          </span>
          <span className="inc-detail-id">{incident.id}</span>
          <span className="inc-detail-area">{incident.area}</span>
        </div>
        <div className="inc-detail-updated">
          Atualizado {incident.updated_at
            ? new Date(incident.updated_at).toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
            : incident.updated ?? '—'}
        </div>
      </div>

      {/* Key stats */}
      <div className="inc-stats-row">
        <StatBox label="Unidades" value={units.length} sub={`${onscene} em ocorrência`} />
        <StatBox label="Em deslocação" value={enroute} color="var(--accent-yellow)" />
        <StatBox
          label="Área aprox."
          value={(incident.brush_radius_km ?? incident.brushRadiusKm) ? `${incident.brush_radius_km ?? incident.brushRadiusKm} km` : '—'}
          sub="raio estimado"
        />
        <StatBox label="Zonas" value={zones.length} />
      </div>
      <div className="inc-gerir-link">
        <Link href={`/meios?incident=${incident.id}`} className="link-subtle">
          Gerir meios →
        </Link>
      </div>

      {/* Operational zones */}
      {visiblePanels.zones !== false && zones.length > 0 && (
        <div className="inc-section">
          <div className="inc-section-title">Zonas operacionais</div>
          <div className="inc-zones-list">
            {zones.map((z) => (
              <div key={z.id} className="inc-zone-chip">
                <span
                  className="inc-zone-dot"
                  style={{ background: ZONE_COLORS[z.type] || 'var(--text-secondary)' }}
                />
                <span className="inc-zone-name">{z.name}</span>
                <span className="inc-zone-type">{ZONE_LABELS[z.type] || z.type}</span>
                <span className="inc-zone-radius">{z.radiusKm ? `${z.radiusKm} km` : 'Polígono'}</span>
                {z.points && onDeleteZone && (
                  <button className="inc-delete-btn" onClick={() => onDeleteZone(z.id)} title="Eliminar zona">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Road closures */}
      {visiblePanels.closures !== false && closures.length > 0 ? (
        <div className="inc-section">
          <div className="inc-section-title">
            Cortes de estrada
            <span className="inc-section-count">{closures.length}</span>
          </div>
          {closures.map((cl) => (
            <div key={cl.id} className="card">
              <div className="card-header">
                <div className="card-name">{cl.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="badge">{closureStatusLabel(cl.status)}</span>
                  {drawnClosureIds.has(cl.id) && onDeleteClosure && (
                    <button className="inc-delete-btn" onClick={() => onDeleteClosure(cl.id)} title="Eliminar corte">×</button>
                  )}
                </div>
              </div>
              <div className="card-meta">
                <span>{cl.id}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="inc-section">
          <div className="inc-empty">Sem cortes de estrada associados.</div>
        </div>
      )}

      {visiblePanels.weather !== false && <WeatherPanel lat={weatherLat} lng={weatherLng} />}
      {visiblePanels.radio !== false && <RadioPanel incidentId={incident?.id} />}
    </div>
  );
}
