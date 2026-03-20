'use client';

import { useMemo, useRef, useState } from 'react';
import { useSupabaseUser } from '../lib/useSupabaseUser';
import { redirect } from 'next/navigation';
import { usePociState } from '../lib/usePociState';
import { alertBadge, alertLevelLabel } from '../lib/labels';

function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);
  // close on outside click
  if (typeof window !== 'undefined') {
    // handled via onBlur on button
  }
  return (
    <div className="rel-custom-select" ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="rel-select-btn" onClick={() => setOpen(v => !v)} onBlur={() => setTimeout(() => setOpen(false), 150)}>
        <span>{selected?.label || placeholder || '—'}</span>
        <span className="rel-select-arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="rel-select-dropdown">
          {options.map(o => (
            <button type="button" key={o.value ?? '__null'} className={`rel-select-option ${o.value === value ? 'active' : ''}`}
              onMouseDown={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LEVEL_OPTIONS = [
  { value: 'todos',    label: 'Todos os níveis' },
  { value: 'critical', label: 'Crítico' },
  { value: 'high',     label: 'Alto' },
  { value: 'medium',   label: 'Médio' },
  { value: 'low',      label: 'Baixo' },
];

const CHANNEL_OPTIONS = [
  { value: 'app',     label: 'App' },
  { value: 'sirene',  label: 'Sirene' },
  { value: 'radio',   label: 'Rádio público' },
];

function channelLabel(ch) {
  return CHANNEL_OPTIONS.find(o => o.value === ch)?.label ?? ch;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function alertCardClass(level) {
  switch (level) {
    case 'critical': return 'alert-card alert-card-critico';
    case 'high':     return 'alert-card alert-card-alto';
    case 'medium':   return 'alert-card alert-card-medio';
    case 'low':      return 'alert-card alert-card-baixo';
    default:         return 'alert-card';
  }
}

function AlertasPageInner() {
  const { alerts, allIncidents, appendLog, addAlert, resolveAlert } = usePociState();

  const [showForm, setShowForm]         = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [filterLevel, setFilterLevel]   = useState('todos');
  const [filterIncident, setFilterIncident] = useState('todas');
  const [searchQ, setSearchQ]           = useState('');
  const [formData, setFormData]         = useState({
    title: '', level: 'critical', message: '', incidentId: '', radius: 10, channels: ['app'],
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeAlerts   = useMemo(() => alerts.filter(a => a.status === 'active'), [alerts]);
  const criticalCount  = useMemo(() => activeAlerts.filter(a => a.level === 'critical').length, [activeAlerts]);
  const coverageCount  = useMemo(() => activeAlerts.length, [activeAlerts]);
  const lastAlert      = useMemo(() => {
    const withTs = alerts.filter(a => a.timestamp);
    if (withTs.length === 0) return null;
    return withTs.reduce((best, a) => a.timestamp > best.timestamp ? a : best);
  }, [alerts]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = showResolved ? alerts : alerts.filter(a => a.status === 'active');
    if (filterLevel !== 'todos') list = list.filter(a => a.level === filterLevel);
    if (filterIncident !== 'todas') list = list.filter(a => a.incidentId === filterIncident);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.message ?? '').toLowerCase().includes(q) ||
        (a.target ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [alerts, showResolved, filterLevel, filterIncident, searchQ]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  function toggleChannel(ch) {
    setFormData(prev => {
      const has = prev.channels.includes(ch);
      return {
        ...prev,
        channels: has ? prev.channels.filter(c => c !== ch) : [...prev.channels, ch],
      };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const { title, level, message, incidentId, radius, channels } = formData;
    if (!title.trim()) return;
    const newAlert = {
      id: 'AL-' + String(alerts.length + 10).padStart(3, '0'),
      title: title.trim(),
      level,
      message: message.trim(),
      incidentId: incidentId || null,
      radius: Number(radius),
      channels,
      status: 'active',
      timestamp: Date.now(),
    };
    addAlert(newAlert);
    appendLog({
      type: 'alert_triggered',
      alertTitle: newAlert.title,
      alertLevel: newAlert.level,
      target: newAlert.radius ? `Raio ${newAlert.radius} km` : '',
      message: newAlert.message,
      incidentId: newAlert.incidentId,
    });
    setFormData({ title: '', level: 'critical', message: '', incidentId: '', radius: 10, channels: ['app'] });
    setShowForm(false);
  }

  function incidentName(id) {
    return allIncidents.find(i => i.id === id)?.name ?? id;
  }

  return (
    <div className="alertas-page">

      {/* ── Header ── */}
      <div className="alertas-header">
        <h1 className="alertas-title">Alertas</h1>
        <button
          className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'} btn-sm`}
          onClick={() => setShowForm(v => !v)}
        >
          {showForm ? 'Cancelar' : '+ Novo Alerta'}
        </button>
      </div>

      {/* ── Stats bar ── */}
      <div className="alertas-stats">
        <div className="alertas-stat">
          <div className="alertas-stat-value">{activeAlerts.length}</div>
          <div className="alertas-stat-label">Total alertas ativas</div>
        </div>
        <div className="alertas-stat">
          <div className="alertas-stat-value" style={{ color: 'var(--accent-red)' }}>{criticalCount}</div>
          <div className="alertas-stat-label">Críticas</div>
        </div>
        <div className="alertas-stat">
          <div className="alertas-stat-value">{coverageCount}</div>
          <div className="alertas-stat-label">Cobertura total</div>
        </div>
        <div className="alertas-stat">
          <div className="alertas-stat-value" style={{ fontSize: '16px', paddingTop: '4px' }}>
            {lastAlert ? formatTime(lastAlert.timestamp) : '—'}
          </div>
          <div className="alertas-stat-label">Última alerta</div>
        </div>
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="alertas-form">
          <div className="alertas-form-title">Novo Alerta</div>
          <form onSubmit={handleSubmit}>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: '12px' }}
              placeholder="Título da alerta..."
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
            <textarea
              className="form-input"
              style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }}
              rows={3}
              placeholder="Mensagem pública..."
              value={formData.message}
              onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
            />
            <div className="alertas-form-row">
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Nível</label>
                <CustomSelect
                  value={formData.level}
                  onChange={v => setFormData(prev => ({ ...prev, level: v }))}
                  options={[
                    { value: 'critical', label: 'Crítico' },
                    { value: 'high', label: 'Alto' },
                    { value: 'medium', label: 'Médio' },
                    { value: 'low', label: 'Baixo' },
                  ]}
                />
              </div>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Ocorrência</label>
                <CustomSelect
                  value={formData.incidentId || ''}
                  onChange={v => setFormData(prev => ({ ...prev, incidentId: v }))}
                  options={[{ value: '', label: '— Sem ocorrência —' }, ...allIncidents.map(i => ({ value: i.id, label: i.name }))]}
                />
              </div>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Raio (km)</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: '100%' }}
                  min={1}
                  max={200}
                  value={formData.radius}
                  onChange={e => setFormData(prev => ({ ...prev, radius: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Canais</div>
            <div className="alertas-channels">
              {CHANNEL_OPTIONS.map(ch => (
                <label key={ch.value}>
                  <input
                    type="checkbox"
                    checked={formData.channels.includes(ch.value)}
                    onChange={() => toggleChannel(ch.value)}
                  />
                  {ch.label}
                </label>
              ))}
            </div>
            <div className="alertas-form-actions">
              <button type="submit" className="btn btn-primary btn-sm">Enviar Alerta</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="alertas-filters">
        <input
          className="form-input"
          placeholder="Pesquisar alertas..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
        <CustomSelect value={filterLevel} onChange={setFilterLevel} options={LEVEL_OPTIONS} />
        <CustomSelect
          value={filterIncident}
          onChange={setFilterIncident}
          options={[{ value: 'todas', label: 'Todas as ocorrências' }, ...allIncidents.map(i => ({ value: i.id, label: i.name }))]}
        />
        <label className="alertas-show-resolved">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
          />
          Mostrar resolvidos
        </label>
      </div>

      {/* ── Alert list ── */}
      {filtered.length === 0 ? (
        <div className="alertas-empty">
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
          <div>Nenhuma alerta encontrada.</div>
        </div>
      ) : (
        <div className="alertas-list">
          {filtered.map(alert => (
            <div key={alert.id} className={alertCardClass(alert.level)}>
              <div className="alert-card-body">
                <div className="alert-card-header">
                  <span className={alertBadge(alert.level)} style={{ fontSize: '10px', letterSpacing: '.07em' }}>
                    {alertLevelLabel(alert.level).toUpperCase()}
                  </span>
                  <span className="alert-card-title">{alert.title}</span>
                </div>
                {alert.message && (
                  <div className="alert-card-msg">{alert.message}</div>
                )}
                {!alert.message && alert.target && (
                  <div className="alert-card-msg">{alert.target}</div>
                )}
                <div className="alert-card-meta">
                  {alert.incidentId && (
                    <span>{incidentName(alert.incidentId)}</span>
                  )}
                  {alert.radius && (
                    <span>{alert.radius} km</span>
                  )}
                  {alert.channels && alert.channels.length > 0 && (
                    <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {alert.channels.map(ch => (
                        <span key={ch} className="alert-channel-pill">{channelLabel(ch)}</span>
                      ))}
                    </span>
                  )}
                  {alert.timestamp && (
                    <span>{formatTime(alert.timestamp)}</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{alert.id}</span>
                </div>
              </div>
              <div className="alert-card-actions">
                <span className={alert.status === 'active' ? 'badge-ativo' : 'badge-resolvido'}>
                  {alert.status === 'active' ? 'ATIVO' : 'RESOLVIDO'}
                </span>
                {alert.status === 'active' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '12px', padding: '3px 10px' }}
                    onClick={() => resolveAlert(alert.id)}
                  >
                    Resolver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

export default function AlertasPage() {
  const { user, loading } = useSupabaseUser()
  if (loading) return null
  if (!user) { redirect('/login'); return null }
  return <AlertasPageInner />
}
