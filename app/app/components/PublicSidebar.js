'use client';

import { weather } from '../data/mockData';
import { alertBadge, alertLevelLabel, closureStatusLabel } from '../lib/labels';
import { usePociState } from '../lib/usePociState';

function ActiveCount(incidents) {
  const active = incidents.filter((i) => i.status === 'active').length;
  const controlled = incidents.filter((i) => i.status === 'controlled').length;
  const surveillance = incidents.filter((i) => i.status === 'surveillance').length;
  return { active, controlled, surveillance };
}

export default function PublicSidebar({ selectedIncidentId, onSelectIncident }) {
  const { allIncidents, alerts, drawnClosures } = usePociState();
  const counts = ActiveCount(allIncidents);
  const today = new Date().toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const publicClosures = drawnClosures.filter((c) => c.status === 'active' || c.status === 'planned');

  return (
    <aside className="sidebar sidebar-right public-sidebar">
      {/* ── Situation overview ── */}
      <div className="public-situation-card">
        <div className="public-situation-label">SITUAÇÃO ATUAL</div>
        <div className="public-situation-date">{today}</div>
        <div className="public-stats-row">
          {counts.active > 0 && (
            <div className="public-stat public-stat-active">
              <span className="public-stat-value">{counts.active}</span>
              <span className="public-stat-label">Ativo{counts.active !== 1 ? 's' : ''}</span>
            </div>
          )}
          {counts.controlled > 0 && (
            <div className="public-stat public-stat-controlled">
              <span className="public-stat-value">{counts.controlled}</span>
              <span className="public-stat-label">Controlado{counts.controlled !== 1 ? 's' : ''}</span>
            </div>
          )}
          {counts.surveillance > 0 && (
            <div className="public-stat public-stat-surveillance">
              <span className="public-stat-value">{counts.surveillance}</span>
              <span className="public-stat-label">Vigilância</span>
            </div>
          )}
        </div>
        <div className="public-situation-note">
          Informação atualizada em tempo real pelas autoridades competentes.
        </div>
      </div>

      {/* ── Incidents (public view) ── */}
      <div className="public-section">
        <div className="public-section-title">Ocorrências ativas</div>
        {allIncidents.filter((i) => i.status !== 'resolved').map((inc) => (
          <div
            key={inc.id}
            className={`public-incident-card ${inc.id === selectedIncidentId ? 'selected' : ''}`}
            onClick={() => onSelectIncident(inc.id)}
          >
            <div className="public-incident-header">
              <span className="public-incident-name">{inc.name}</span>
              <span className={`public-status-dot public-status-dot-${inc.status}`}></span>
            </div>
            <div className="public-incident-meta">
              <span>{inc.area}</span>
              <span>{inc.updated}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Public alerts ── */}
      <div className="public-section">
        <div className="public-section-title">
          Avisos à população
          <span className="public-section-badge">{alerts.length}</span>
        </div>
        {alerts.map((alert) => (
          <div key={alert.id} className="public-alert-item">
            <div className="public-alert-header">
              <span className={alertBadge(alert.level)}>{alertLevelLabel(alert.level)}</span>
            </div>
            <div className="public-alert-title">{alert.title}</div>
            <div className="public-alert-target">{alert.target}</div>
          </div>
        ))}
      </div>

      {/* ── Road info ── */}
      {publicClosures.length > 0 && (
        <div className="public-section">
          <div className="public-section-title">Estradas condicionadas</div>
          {publicClosures.map((c) => (
            <div key={c.id} className="public-closure-item">
              <span className="public-closure-name">{c.name}</span>
              <span className={c.status === 'active' ? 'badge badge-active' : 'badge badge-medium'}>
                {closureStatusLabel(c.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Weather (fire risk) ── */}
      <div className="public-section">
        <div className="public-section-title">
          Condições meteorológicas
          <span className="public-section-badge public-section-badge-green">{weather.updated}</span>
        </div>
        <div className="public-weather-grid">
          <div className="public-weather-item">
            <div className="public-weather-value">{weather.temperature}°C</div>
            <div className="public-weather-label">Temperatura</div>
          </div>
          <div className="public-weather-item">
            <div className="public-weather-value">{weather.humidity}%</div>
            <div className="public-weather-label">Humidade</div>
          </div>
          <div className="public-weather-item">
            <div className="public-weather-value">{weather.windSpeed}</div>
            <div className="public-weather-label">Vento km/h</div>
          </div>
          <div className="public-weather-item">
            <div className="public-weather-value">{weather.gusts}</div>
            <div className="public-weather-label">Rajadas</div>
          </div>
        </div>
        {weather.humidity <= 20 && (
          <div className="public-weather-warning">
            Humidade muito baixa — risco de propagação elevado.
          </div>
        )}
      </div>

      {/* ── Emergency contacts ── */}
      <div className="public-emergency-card">
        <div className="public-emergency-title">Emergência</div>
        <div className="public-emergency-item">
          <span className="public-emergency-number">112</span>
          <span className="public-emergency-label">Número de emergência europeu</span>
        </div>
        <div className="public-emergency-item">
          <span className="public-emergency-number">117</span>
          <span className="public-emergency-label">Proteção Civil (linha direta)</span>
        </div>
        <div className="public-emergency-note">
          Em caso de perigo imediato, ligue o 112.
        </div>
      </div>
    </aside>
  );
}
