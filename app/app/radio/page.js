'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { redirect } from 'next/navigation';
import { usePociState } from '../lib/usePociState';
import { useSupabaseUser } from '../lib/useSupabaseUser';

const TEMPLATES = [
  'Avançar para posição',
  'Regressar à base',
  'Situação atual?',
  'Aguardar confirmação',
  'Reforço necessário',
];

function RadioPageInner() {
  const { opLog, appendLog, allIncidents } = usePociState();
  const [incidentFilter, setIncidentFilter] = useState(null);
  const [typeFilter, setTypeFilter]         = useState(null);
  const [msgText, setMsgText]               = useState('');
  const [priority, setPriority]             = useState('normal');
  const [recipientOpen, setRecipientOpen]   = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [incidentOpen, setIncidentOpen]     = useState(false);
  const [typeOpen, setTypeOpen]             = useState(false);
  const feedRef    = useRef(null);
  const recipRef   = useRef(null);

  // Build flat list of recipient options from incidents' communications
  const recipientOptions = useMemo(() => {
    const broadcast = { id: 'broadcast', name: 'Difusão geral', incidentId: null, label: 'Todas as ocorrências — Difusão geral' };
    const byIncident = allIncidents.flatMap(inc =>
      (inc.communications ?? []).map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
        incidentId: inc.id,
        incidentName: inc.name,
        label: `${c.name} (${inc.name})`,
      }))
    );
    return [broadcast, ...byIncident];
  }, [allIncidents]);

  // Auto-select COS of filtered incident when incidentFilter changes
  useEffect(() => {
    if (!incidentFilter) {
      setSelectedRecipient(recipientOptions[0] ?? null);
      return;
    }
    const inc = allIncidents.find(i => i.id === incidentFilter);
    const cos = (inc?.communications ?? []).find(c => c.role === 'cos');
    if (cos) {
      setSelectedRecipient({
        id: cos.id,
        name: cos.name,
        incidentId: inc.id,
        label: `${cos.name} (${inc.name})`,
      });
    } else {
      setSelectedRecipient(recipientOptions[0] ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentFilter, recipientOptions]);

  // Initialize default recipient on mount
  useEffect(() => {
    if (!selectedRecipient && recipientOptions.length > 0) {
      setSelectedRecipient(recipientOptions[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientOptions]);

  // All comms entries from log (radio + digital)
  const allComms = useMemo(() => {
    return opLog.filter(e => e.type === 'radio_message' || e.type === 'digital_order');
  }, [opLog]);

  const filtered = useMemo(() => {
    let list = allComms;
    if (typeFilter) list = list.filter(e => e.type === typeFilter);
    if (incidentFilter) list = list.filter(e =>
      e.incidentId === incidentFilter ||
      (e.incidentId === null && e.type === 'radio_message')
    );
    return list;
  }, [allComms, typeFilter, incidentFilter]);

  // Stats
  const radioCount   = allComms.filter(e => e.type === 'radio_message').length;
  const digitalCount = allComms.filter(e => e.type === 'digital_order').length;
  const lastTs = allComms.length > 0 ? Math.max(...allComms.map(e => e.ts)) : null;

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
  }

  function groupByDay(entries) {
    const days = [];
    let currentDay = null;
    const sorted = [...entries].sort((a, b) => b.ts - a.ts);
    sorted.forEach(e => {
      const day = new Date(e.ts).toDateString();
      if (day !== currentDay) {
        currentDay = day;
        days.push({ day, ts: e.ts, entries: [] });
      }
      days[days.length - 1].entries.push(e);
    });
    return days;
  }

  const days = useMemo(() => groupByDay(filtered), [filtered]);

  function incidentName(id) {
    return allIncidents.find(i => i.id === id)?.name ?? id;
  }

  function handleSend(e) {
    e.preventDefault();
    if (!msgText.trim()) return;
    const recip = selectedRecipient ?? { id: 'broadcast', name: 'Difusão geral', incidentId: null };
    appendLog({
      type: 'digital_order',
      from: 'Comando',
      to: recip.name,
      toId: recip.id,
      message: msgText.trim(),
      incidentId: recip.incidentId,
      priority,
    });
    setMsgText('');
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (!e.target.closest('.radio-dropdown-wrap')) {
        setIncidentOpen(false);
        setTypeOpen(false);
      }
      if (!e.target.closest('.radio-compose-recipient')) {
        setRecipientOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const TYPE_OPTIONS = [
    { value: null,             label: 'Todos os tipos' },
    { value: 'radio_message',  label: 'Transmissão rádio' },
    { value: 'digital_order',  label: 'Ordem digital' },
  ];
  const INC_OPTIONS = [
    { value: null, label: 'Todas as ocorrências' },
    ...allIncidents.map(i => ({ value: i.id, label: i.name })),
  ];

  const typeLabel = TYPE_OPTIONS.find(o => o.value === typeFilter)?.label ?? 'Todos os tipos';
  const incLabel  = INC_OPTIONS.find(o => o.value === incidentFilter)?.label ?? 'Todas as ocorrências';

  const PRIORITY_OPTIONS = [
    { value: 'normal',   label: 'Normal' },
    { value: 'urgente',  label: 'Urgente' },
    { value: 'critico',  label: 'Crítico' },
  ];

  // Group recipient options by incident for dropdown rendering
  const recipientGroups = useMemo(() => {
    const groups = [];
    allIncidents.forEach(inc => {
      const comms = (inc.communications ?? []).map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
        incidentId: inc.id,
        incidentName: inc.name,
        label: `${c.name} (${inc.name})`,
      }));
      if (comms.length > 0) groups.push({ incidentName: inc.name, comms });
    });
    return groups;
  }, [allIncidents]);

  return (
    <div className="radio-page">

      {/* ── Header ── */}
      <div className="radio-header">
        <div className="radio-header-left">
          <h1 className="radio-title">Linha de Rádio</h1>
          <span className="radio-live-badge">● Ao vivo</span>
        </div>
        <div className="radio-stats-row">
          <div className="radio-stat">
            <span className="radio-stat-value">{radioCount}</span>
            <span className="radio-stat-label">Transmissões de campo</span>
          </div>
          <div className="radio-stat">
            <span className="radio-stat-value">{digitalCount}</span>
            <span className="radio-stat-label">Ordens digitais</span>
          </div>
          <div className="radio-stat">
            <span className="radio-stat-value">{lastTs ? formatTime(lastTs) : '—'}</span>
            <span className="radio-stat-label">Última transmissão</span>
          </div>
        </div>
      </div>

      {/* ── Compose ── */}
      <form className="radio-compose" onSubmit={handleSend}>
        <div className="radio-compose-label">Enviar ordem digital</div>

        {/* Recipient custom dropdown */}
        <div className="radio-compose-recipient" ref={recipRef}>
          <button
            type="button"
            className="radio-compose-recipient-btn"
            onClick={() => setRecipientOpen(v => !v)}
          >
            <span className="radio-compose-recipient-value">
              {selectedRecipient ? selectedRecipient.label : 'Selecionar destinatário...'}
            </span>
            <span className="radio-compose-recipient-arrow">▾</span>
          </button>
          {recipientOpen && (
            <div className="radio-compose-recipient-panel">
              {/* Broadcast option */}
              <div
                className={`radio-compose-recipient-item ${selectedRecipient?.id === 'broadcast' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedRecipient({ id: 'broadcast', name: 'Difusão geral', incidentId: null, label: 'Todas as ocorrências — Difusão geral' });
                  setRecipientOpen(false);
                }}
              >
                Todas as ocorrências — Difusão geral
              </div>
              <div className="radio-compose-recipient-divider" />
              {/* Grouped by incident */}
              {recipientGroups.map(group => (
                <div key={group.incidentName}>
                  <div className="radio-compose-recipient-group-label">{group.incidentName}</div>
                  {group.comms.map(c => (
                    <div
                      key={c.id}
                      className={`radio-compose-recipient-item radio-compose-recipient-item-indent ${selectedRecipient?.id === c.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedRecipient(c);
                        setRecipientOpen(false);
                      }}
                    >
                      {c.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message templates */}
        <div className="radio-templates">
          {TEMPLATES.map(t => (
            <button
              key={t}
              type="button"
              className="radio-template-btn"
              onClick={() => setMsgText(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Priority selector */}
        <div className="radio-priority-row">
          <span className="radio-priority-label">Prioridade:</span>
          {PRIORITY_OPTIONS.map(p => (
            <button
              key={p.value}
              type="button"
              className={`radio-priority-btn ${priority === p.value ? `radio-priority-btn-active-${p.value}` : ''}`}
              onClick={() => setPriority(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Message input + send */}
        <div className="radio-compose-row">
          <input
            className="form-input radio-compose-msg"
            placeholder="Mensagem..."
            value={msgText}
            onChange={e => setMsgText(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit">Enviar</button>
        </div>
      </form>

      {/* ── Filters ── */}
      <div className="radio-filter-row">
        {/* Type filter */}
        <div className="radio-dropdown-wrap">
          <button className={`radio-filter-btn ${typeFilter ? 'radio-filter-btn-active' : ''}`} onClick={() => { setTypeOpen(v => !v); setIncidentOpen(false); }}>
            {typeLabel} ▾
          </button>
          {typeOpen && (
            <div className="radio-dropdown">
              {TYPE_OPTIONS.map(o => (
                <div key={String(o.value)} className={`radio-dropdown-item ${typeFilter === o.value ? 'active' : ''}`}
                  onClick={() => { setTypeFilter(o.value); setTypeOpen(false); }}>
                  {o.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incident filter */}
        <div className="radio-dropdown-wrap">
          <button className={`radio-filter-btn ${incidentFilter ? 'radio-filter-btn-active' : ''}`} onClick={() => { setIncidentOpen(v => !v); setTypeOpen(false); }}>
            {incLabel} ▾
          </button>
          {incidentOpen && (
            <div className="radio-dropdown">
              {INC_OPTIONS.map(o => (
                <div key={String(o.value)} className={`radio-dropdown-item ${incidentFilter === o.value ? 'active' : ''}`}
                  onClick={() => { setIncidentFilter(o.value); setIncidentOpen(false); }}>
                  {o.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {(typeFilter || incidentFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setTypeFilter(null); setIncidentFilter(null); }}>
            Limpar filtros
          </button>
        )}

        <span className="radio-result-count">{filtered.length} mensagens</span>
      </div>

      {/* ── Feed ── */}
      <div className="radio-feed" ref={feedRef}>
        {days.length === 0 ? (
          <div className="radio-empty">
            <div className="radio-empty-icon">📡</div>
            <div>Nenhuma transmissão registada.</div>
          </div>
        ) : (
          days.map(({ day, ts, entries }) => (
            <div key={day} className="radio-day-group">
              <div className="radio-day-header">{formatDate(ts)}</div>
              {entries.map(e => (
                <div key={e.id} className="card">
                  <div className="card-header">
                    <div className="card-name">
                      {e.type === 'digital_order'
                        ? <>{e.from} <span style={{ color: 'var(--text-muted)' }}>→</span> {e.to}</>
                        : e.from
                      }
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatTime(e.ts)}</span>
                      {e.type === 'digital_order' && e.priority && e.priority !== 'normal' && (
                        <span className={`badge badge-priority-${e.priority}`}>{e.priority.toUpperCase()}</span>
                      )}
                      <span className={`badge ${e.type === 'digital_order' ? 'badge-digital' : 'badge-radio'}`}>
                        {e.type === 'digital_order' ? 'DIGITAL' : 'RÁDIO'}
                      </span>
                    </div>
                  </div>
                  <div className="card-meta">"{e.message}"</div>
                  {e.incidentId && (
                    <div className="card-meta" style={{ color: 'var(--text-muted)' }}>{incidentName(e.incidentId)}</div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function RadioPage() {
  const { user, loading } = useSupabaseUser()
  if (loading) return null
  if (!user) { redirect('/login'); return null }
  return <RadioPageInner />
}
