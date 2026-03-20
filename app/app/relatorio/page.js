'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePociState } from '../lib/usePociState'

const EVENT_TYPES = [
  { value: null,                      label: 'Todos os eventos' },
  { value: 'incident_created',        label: 'Nova ocorrência' },
  { value: 'incident_status_changed', label: 'Estado de ocorrência' },
  { value: 'unit_assigned',           label: 'Atribuição de meio' },
  { value: 'unit_unassigned',         label: 'Retirada de meio' },
  { value: 'status_changed',          label: 'Estado de meio' },
  { value: 'unit_added',              label: 'Novo meio' },
  { value: 'alert_triggered',         label: 'Alerta' },
  { value: 'alert_acknowledged',      label: 'Alerta reconhecido' },
  { value: 'radio_message',           label: 'Rádio' },
  { value: 'digital_order',          label: 'Ordem digital' },
  { value: 'weather_alert',           label: 'Meteorologia' },
  { value: 'zone_drawn',              label: 'Zona desenhada' },
  { value: 'closure_drawn',           label: 'Corte de estrada' },
]

const TYPE_META = {
  incident_created:        { label: 'Ocorrência',    color: 'var(--status-active)',        icon: '🔥' },
  incident_status_changed: { label: 'Ocorrência',    color: 'var(--status-controlled)',    icon: '↺' },
  unit_assigned:           { label: 'Atribuição',    color: 'var(--accent-green)',         icon: '→' },
  unit_unassigned:         { label: 'Retirada',      color: 'var(--text-secondary)',       icon: '←' },
  status_changed:          { label: 'Estado',        color: 'var(--status-surveillance)', icon: '↺' },
  unit_added:              { label: 'Novo Meio',     color: '#f97316',                    icon: '+' },
  alert_triggered:         { label: 'Alerta',        color: 'var(--accent-red)',           icon: '⚠' },
  alert_acknowledged:      { label: 'Reconhecido',   color: 'var(--accent-yellow)',        icon: '✓' },
  radio_message:           { label: 'Rádio',         color: 'var(--accent-blue)',          icon: '📡' },
  digital_order:           { label: 'Digital',       color: 'var(--accent-orange)',        icon: '→' },
  weather_alert:           { label: 'Meteorologia',  color: 'var(--accent-purple)',        icon: '🌬' },
  zone_drawn:              { label: 'Zona',          color: 'var(--accent-purple)',        icon: '▣' },
  closure_drawn:           { label: 'Corte Estrada', color: 'var(--accent-yellow)',        icon: '✕' },
}

const STATUS_LABELS = {
  available: 'Disponível',
  assigned:  'Atribuído',
  enroute:   'Em Deslocação',
  onscene:   'Em Ocorrência',
}

const INC_STATUS_LABELS = {
  active:       'Ativo',
  controlled:   'Controlado',
  surveillance: 'Vigilância',
  resolved:     'Resolvido',
}

const ALERT_COLORS = {
  critical: 'var(--accent-red)',
  high:     'var(--accent-orange)',
  medium:   'var(--accent-yellow)',
  low:      'var(--accent-green)',
}

const TYPE_LABELS = {
  bombeiros: 'Bombeiros', gnr: 'GNR', anepc: 'ANEPC',
  air: 'Aéreo', municipal: 'Municipal', other: 'Outro',
}

function formatTs(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function groupByDay(entries) {
  const map = new Map()
  for (const e of entries) {
    const key = new Date(e.ts).toDateString()
    if (!map.has(key)) map.set(key, { label: formatDate(e.ts), entries: [] })
    map.get(key).entries.push(e)
  }
  return [...map.values()]
}

function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    function handleOut(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleOut)
    return () => document.removeEventListener('mousedown', handleOut)
  }, [open])

  return (
    <div className="rel-custom-select" ref={ref}>
      <button className="rel-select-btn" onClick={() => setOpen(v => !v)}>
        <span>{selected?.label || placeholder}</span>
        <span className="rel-select-arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="rel-select-dropdown">
          {options.map(o => (
            <button
              key={o.value ?? '__null'}
              className={`rel-select-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function toDateInputValue(ts) {
  const d = new Date(ts)
  return d.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
}

export default function RelatorioPage() {
  const { opLog, clearLog, allUnits, allIncidents } = usePociState()
  const [typeFilter, setTypeFilter] = useState(null)
  const [incidentFilter, setIncidentFilter] = useState(null)
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)

  function applyQuickRange(range) {
    const now = Date.now()
    if (range === 'hour') {
      setDateFrom(toDateInputValue(now - 60 * 60 * 1000))
      setDateTo(toDateInputValue(now))
    } else if (range === 'today') {
      setDateFrom(toDateInputValue(new Date().setHours(0, 0, 0, 0)))
      setDateTo(toDateInputValue(now))
    } else {
      setDateFrom(null)
      setDateTo(null)
    }
  }

  const allUnitsMap  = useMemo(() => Object.fromEntries(allUnits.map(u => [u.id, u])), [allUnits])
  const incMap       = useMemo(() => Object.fromEntries(allIncidents.map(i => [i.id, i])), [allIncidents])

  const filtered = useMemo(() => {
    let list = opLog
    if (typeFilter)     list = list.filter(e => e.type === typeFilter)
    if (incidentFilter) list = list.filter(e =>
      e.incidentId === incidentFilter ||
      e.prevIncidentId === incidentFilter ||
      (e.incidentId === null && (e.type === 'radio_message' || e.type === 'alert_triggered'))
    )
    if (dateFrom) list = list.filter(e => e.ts >= new Date(dateFrom).getTime())
    if (dateTo)   list = list.filter(e => e.ts <= new Date(dateTo).getTime())
    return list
  }, [opLog, typeFilter, incidentFilter, dateFrom, dateTo])

  const days = useMemo(() => groupByDay(filtered), [filtered])

  // Summary stats
  const todayTs = new Date().setHours(0, 0, 0, 0)
  const todayEvents   = opLog.filter(e => e.ts >= todayTs).length
  const unitsDeployed = new Set(opLog.filter(e => e.type === 'unit_assigned').map(e => e.unitId)).size
  const alertCount    = opLog.filter(e => e.type === 'alert_triggered').length
  const radioCount    = opLog.filter(e => e.type === 'radio_message').length
  const firstTs = opLog.length > 0 ? opLog[opLog.length - 1].ts : null

  function describeEvent(e) {
    const unit = allUnitsMap[e.unitId]
    const unitName = unit?.name || e.unitName || e.unitId || '—'
    const inc = incMap[e.incidentId]
    const prevInc = incMap[e.prevIncidentId]
    switch (e.type) {
      case 'unit_assigned':
        return <><b>{unitName}</b> atribuído a <b>{inc?.name || e.incidentId || '—'}</b></>
      case 'unit_unassigned':
        return <><b>{unitName}</b> retirado de <b>{prevInc?.name || e.prevIncidentId || '—'}</b></>
      case 'status_changed':
        return <><b>{unitName}</b>: {STATUS_LABELS[e.from] || e.from} → <b>{STATUS_LABELS[e.to] || e.to}</b>{inc ? <> ({inc.name})</> : null}</>
      case 'unit_added':
        return <>Nova unidade adicionada: <b>{e.unitName || unitName}</b> ({TYPE_LABELS[e.unitType] || e.unitType})</>
      case 'incident_created':
        return <>Nova ocorrência: <b>{e.incidentName || e.incidentId}</b>{e.area ? ` — ${e.area}` : ''}</>
      case 'incident_status_changed':
        return <><b>{e.incidentName || e.incidentId}</b>: {INC_STATUS_LABELS[e.from] || e.from} → <b>{INC_STATUS_LABELS[e.to] || e.to}</b></>
      case 'alert_triggered':
        return <><b>{e.alertTitle}</b> — {e.target}{e.alertLevel ? <span style={{ marginLeft: 6, fontSize: 11, textTransform: 'uppercase', color: ALERT_COLORS[e.alertLevel] }}>{e.alertLevel}</span> : null}</>
      case 'alert_acknowledged':
        return <>Alerta reconhecido: <b>{e.alertTitle}</b></>
      case 'radio_message':
        return <><b>{e.from}</b>: "{e.message}"{inc ? <> <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({inc.name})</span></> : null}</>
      case 'weather_alert':
        return <>{e.description}</>
      case 'zone_drawn':
        return <>Zona desenhada em <b>{inc?.name || e.incidentId}</b>: {e.zoneName || '—'}</>
      case 'closure_drawn':
        return <>Corte de estrada em <b>{inc?.name || e.incidentId}</b>: {e.closureName || '—'}</>
      default:
        return e.type
    }
  }

  function exportCSV() {
    const rows = [
      ['ID', 'Timestamp', 'Data/Hora', 'Tipo', 'Unidade', 'Ocorrência', 'Detalhes'],
      ...opLog.map(e => {
        const unit = allUnitsMap[e.unitId]
        const unitName = unit?.name || e.unitName || e.unitId || ''
        const inc = incMap[e.incidentId] || incMap[e.prevIncidentId]
        let detail = ''
        if (e.type === 'status_changed') detail = `${e.from} → ${e.to}`
        return [
          e.id,
          e.ts,
          new Date(e.ts).toLocaleString('pt-PT'),
          TYPE_META[e.type]?.label || e.type,
          unitName,
          inc?.name || '',
          detail,
        ]
      })
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `poci-relatorio-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rel-page">

      {/* Header */}
      <div className="rel-header">
        <div>
          <h1 className="rel-title">Relatório de Operações</h1>
          <p className="rel-subtitle">{opLog.length} eventos registados</p>
        </div>
        <div className="rel-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={opLog.length === 0}>
            ↓ Exportar CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Limpar todo o registo?')) clearLog() }}
            disabled={opLog.length === 0}>
            Limpar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="rel-stats">
        <div className="rel-stat">
          <span className="rel-stat-value">{unitsDeployed}</span>
          <span className="rel-stat-label">meios mobilizados</span>
        </div>
        <div className="rel-stat">
          <span className="rel-stat-value" style={{ color: 'var(--accent-red)' }}>{alertCount}</span>
          <span className="rel-stat-label">alertas emitidos</span>
        </div>
        <div className="rel-stat">
          <span className="rel-stat-value" style={{ color: 'var(--accent-blue)' }}>{radioCount}</span>
          <span className="rel-stat-label">mensagens rádio</span>
        </div>
        <div className="rel-stat">
          <span className="rel-stat-value">{firstTs ? formatTs(firstTs) : '—'}</span>
          <span className="rel-stat-label">início da operação</span>
        </div>
      </div>

      {/* Filters */}
      <div className="rel-filters">
        <CustomSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={EVENT_TYPES}
          placeholder="Todos os eventos"
        />
        <CustomSelect
          value={incidentFilter}
          onChange={setIncidentFilter}
          options={[{ value: null, label: 'Todas as ocorrências' }, ...allIncidents.map(i => ({ value: i.id, label: i.name }))]}
          placeholder="Todas as ocorrências"
        />
        <div className="rel-date-range">
          <input
            type="datetime-local"
            className="rel-date-input"
            value={dateFrom || ''}
            onChange={e => setDateFrom(e.target.value || null)}
            title="De"
          />
          <span className="rel-date-sep">→</span>
          <input
            type="datetime-local"
            className="rel-date-input"
            value={dateTo || ''}
            onChange={e => setDateTo(e.target.value || null)}
            title="Até"
          />
        </div>
        <div className="rel-quick-filters">
          <button className="btn btn-ghost btn-sm" onClick={() => applyQuickRange('hour')}>Última hora</button>
          <button className="btn btn-ghost btn-sm" onClick={() => applyQuickRange('today')}>Hoje</button>
          {(dateFrom || dateTo) && (
            <button className="btn btn-ghost btn-sm" onClick={() => applyQuickRange('all')}>✕</button>
          )}
        </div>
        {(typeFilter || incidentFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setTypeFilter(null); setIncidentFilter(null) }}>
            Limpar filtros
          </button>
        )}
        <span className="rel-count">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Timeline */}
      {opLog.length === 0 ? (
        <div className="rel-empty">
          <div className="rel-empty-icon">📋</div>
          <p>Nenhum evento registado ainda.</p>
          <p className="rel-empty-hint">As ações no mapa e na página de Meios aparecem aqui automaticamente.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rel-empty">
          <p>Sem eventos com estes filtros.</p>
        </div>
      ) : (
        <div className="rel-timeline">
          {days.map(day => (
            <div key={day.label} className="rel-day">
              <div className="rel-day-label">{day.label}</div>
              {day.entries.map(e => {
                const meta = TYPE_META[e.type] || { label: e.type, color: 'var(--text-secondary)', icon: '•' }
                return (
                  <div key={e.id} className="rel-entry">
                    <span className="rel-time">{formatTs(e.ts)}</span>
                    <span className="rel-dot" style={{ background: meta.color }}>{meta.icon}</span>
                    <span className="rel-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="rel-desc">{describeEvent(e)}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
