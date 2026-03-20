// app/app/meios/page.js
'use client'

import { useMemo, useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePociState } from '../lib/usePociState'
import { unitBadge, unitStatusLabel, statusBadge, incidentStatusLabel } from '../lib/labels'
import { haversineKm, estimatedMinutes } from '../lib/mapUtils'
import UnitDetailPanel from '../components/UnitDetailPanel'

const TYPE_TABS = ['Todos', 'Bombeiros', 'GNR', 'ANEPC', 'Aéreo', 'Municipal', 'Outro']
const STATUS_TABS = ['Todos', 'Disponível', 'Atribuído', 'Em Deslocação', 'Em Ocorrência']

const TYPE_MAP = {
  'Todos': null, 'Bombeiros': 'bombeiros', 'GNR': 'gnr', 'ANEPC': 'anepc',
  'Aéreo': 'air', 'Municipal': 'municipal', 'Outro': 'other',
}
const STATUS_MAP = {
  'Todos': null, 'Disponível': 'available', 'Atribuído': 'assigned',
  'Em Deslocação': 'enroute', 'Em Ocorrência': 'onscene',
}
const TYPE_LABELS = {
  bombeiros: 'Bombeiros', gnr: 'GNR', anepc: 'ANEPC',
  air: 'Aéreo', municipal: 'Municipal', other: 'Outro',
}
const STATUS_OPTIONS = ['available', 'assigned', 'enroute', 'onscene']
const INC_COLORS = {
  active: 'var(--status-active)', controlled: 'var(--status-controlled)',
  surveillance: 'var(--status-surveillance)', resolved: 'var(--text-secondary)',
}

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <span className="sort-icon-neutral">⇅</span>
  return <span className="sort-icon-active">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function MeiosPageInner() {
  const searchParams = useSearchParams()
  const {
    unitAssignments, unitStatuses, allUnits,
    assignUnit, unassignUnit, addCustomUnit, setUnitStatus,
    allIncidents,
  } = usePociState()

  // ── Filter state ───────────────────────────────────────────────────────────
  const [typeTab, setTypeTab] = useState('Todos')
  const [statusTab, setStatusTab] = useState('Todos')
  const [query, setQuery] = useState('')
  const [distanceRefId, setDistanceRefId] = useState(searchParams.get('incident'))
  const [groupView, setGroupView] = useState(true)
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())

  // ── Dropdown state ─────────────────────────────────────────────────────────
  const [openDropdownId, setOpenDropdownId] = useState(null)
  const [openStatusId, setOpenStatusId] = useState(null)
  const [selectedUnitId, setSelectedUnitId] = useState(null)

  // ── Nova Unidade modal ─────────────────────────────────────────────────────
  const [showNovaModal, setShowNovaModal] = useState(false)
  const [novaName, setNovaName] = useState('')
  const [novaType, setNovaType] = useState('bombeiros')
  const [novaLat, setNovaLat] = useState('')
  const [novaLng, setNovaLng] = useState('')

  // Auto-sort by distance when a reference incident is selected
  useEffect(() => {
    if (distanceRefId) { setSortBy('distance'); setSortDir('asc') }
    else if (sortBy === 'distance') { setSortBy(null) }
  }, [distanceRefId])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!openDropdownId && !openStatusId) return
    function handleOut(e) {
      if (!e.target.closest('.dropdown-wrap') && !e.target.closest('.status-inline-wrap')) {
        setOpenDropdownId(null)
        setOpenStatusId(null)
      }
    }
    document.addEventListener('mousedown', handleOut)
    return () => document.removeEventListener('mousedown', handleOut)
  }, [openDropdownId, openStatusId])

  const selectedUnit = useMemo(() => allUnits.find(u => u.id === selectedUnitId) || null, [selectedUnitId, allUnits])
  const assignableIncidents = useMemo(() => allIncidents.filter(i => i.status !== 'resolved'), [allIncidents])

  // ── Filtered + sorted units ────────────────────────────────────────────────
  const filteredUnits = useMemo(() => {
    let list = allUnits
    const tv = TYPE_MAP[typeTab]; if (tv) list = list.filter(u => u.type === tv)
    const sv = STATUS_MAP[statusTab]; if (sv) list = list.filter(u => (unitStatuses[u.id] || u.status) === sv)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    }
    return list
  }, [allUnits, unitAssignments, unitStatuses, typeTab, statusTab, query])

  // Active incident object (for distance calc)
  const activeIncident = useMemo(
    () => distanceRefId ? allIncidents.find(i => i.id === distanceRefId) : null,
    [distanceRefId, allIncidents]
  )

  // Per-unit distance to active incident center
  const unitDistances = useMemo(() => {
    if (!activeIncident?.lat) return {}
    const map = {}
    for (const u of allUnits) {
      if (u.lat != null && u.lng != null) {
        const km = haversineKm(u.lat, u.lng, activeIncident.lat, activeIncident.lng)
        map[u.id] = { km: Math.round(km * 10) / 10, mins: estimatedMinutes(km) }
      }
    }
    return map
  }, [activeIncident, allUnits])

  const sortedUnits = useMemo(() => {
    if (!sortBy) return filteredUnits
    return [...filteredUnits].sort((a, b) => {
      let av, bv
      if (sortBy === 'name') { av = a.name; bv = b.name }
      else if (sortBy === 'type') { av = TYPE_LABELS[a.type] || ''; bv = TYPE_LABELS[b.type] || '' }
      else if (sortBy === 'status') { av = unitStatuses[a.id] || a.status || ''; bv = unitStatuses[b.id] || b.status || '' }
      else if (sortBy === 'incident') { av = unitAssignments[a.id] || ''; bv = unitAssignments[b.id] || '' }
      else if (sortBy === 'distance') {
        av = unitDistances[a.id]?.km ?? 9999
        bv = unitDistances[b.id]?.km ?? 9999
        return (av - bv) * (sortDir === 'asc' ? 1 : -1)
      }
      else { av = ''; bv = '' }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1)
    })
  }, [filteredUnits, sortBy, sortDir, unitStatuses, unitAssignments, unitDistances])

  // ── Per-incident stats for summary cards ──────────────────────────────────
  const incidentStats = useMemo(() => allIncidents
    .filter(i => i.status !== 'resolved')
    .map(inc => {
      const units = allUnits.filter(u => unitAssignments[u.id] === inc.id)
      const onscene = units.filter(u => (unitStatuses[u.id] || u.status) === 'onscene').length
      const enroute = units.filter(u => (unitStatuses[u.id] || u.status) === 'enroute').length
      return { inc, total: units.length, onscene, enroute }
    }), [allIncidents, allUnits, unitAssignments, unitStatuses])

  // ── Global summary ─────────────────────────────────────────────────────────
  const summary = useMemo(() => ({
    available: allUnits.filter(u => (unitStatuses[u.id] || u.status) === 'available').length,
    enroute:   allUnits.filter(u => (unitStatuses[u.id] || u.status) === 'enroute').length,
    onscene:   allUnits.filter(u => (unitStatuses[u.id] || u.status) === 'onscene').length,
    total: allUnits.length,
  }), [allUnits, unitStatuses])

  // ── Grouped units ──────────────────────────────────────────────────────────
  const groupedUnits = useMemo(() => {
    if (!groupView) return null
    const groups = allIncidents
      .map(inc => ({ incident: inc, units: sortedUnits.filter(u => unitAssignments[u.id] === inc.id) }))
      .filter(g => g.units.length > 0)
    const unassigned = sortedUnits.filter(u => !unitAssignments[u.id])
    if (unassigned.length > 0) groups.push({ incident: null, units: unassigned })
    return groups
  }, [groupView, sortedUnits, allIncidents, unitAssignments])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }
  function toggleGroup(id) {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function handleNovaUnitSave() {
    if (!novaName.trim()) return
    addCustomUnit({ id: `CUST-U-${Date.now()}`, name: novaName.trim(), type: novaType,
      lat: novaLat ? parseFloat(novaLat) : undefined, lng: novaLng ? parseFloat(novaLng) : undefined })
    setShowNovaModal(false); setNovaName(''); setNovaType('bombeiros'); setNovaLat(''); setNovaLng('')
  }

  // ── Row renderer ──────────────────────────────────────────────────────────
  function renderRow(unit, showIncidentCol = true) {
    const status = unitStatuses[unit.id] || unit.status || 'available'
    const assignedId = unitAssignments[unit.id] || null
    const assignedInc = allIncidents.find(i => i.id === assignedId)
    const isDropdownOpen = openDropdownId === unit.id
    const isStatusOpen = openStatusId === unit.id
    const dist = activeIncident ? unitDistances[unit.id] : null
    const distClass = dist == null ? '' : dist.km < 20 ? 'dist-near' : dist.km < 50 ? 'dist-mid' : 'dist-far'

    return (
      <tr
        key={unit.id}
        className={`meios-row ${selectedUnitId === unit.id ? 'selected' : ''}`}
        onClick={() => setSelectedUnitId(unit.id === selectedUnitId ? null : unit.id)}
      >
        <td className="meios-unit-name">{unit.name}<span className="meios-unit-id">{unit.id}</span></td>
        <td className="meios-unit-type">{TYPE_LABELS[unit.type] || unit.type}</td>
        <td onClick={e => e.stopPropagation()}>
          <div className="status-inline-wrap">
            <span className={`${unitBadge(status)} status-clickable`} onClick={() => setOpenStatusId(isStatusOpen ? null : unit.id)}>
              {unitStatusLabel(status)} ▾
            </span>
            {isStatusOpen && (
              <div className="status-inline-dropdown">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} className={`status-option ${status === s ? 'active' : ''}`}
                    onClick={() => { setUnitStatus(unit.id, s); setOpenStatusId(null) }}>
                    <span className={unitBadge(s)}>{unitStatusLabel(s)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </td>
        {showIncidentCol && (
          <td>
            {assignedInc
              ? <span className="meios-inc-label">
                  <span className="meios-inc-dot" style={{ background: INC_COLORS[assignedInc.status] }} />
                  {assignedInc.name}
                </span>
              : <span className="meios-none">—</span>}
          </td>
        )}
        {activeIncident && (
          <td className={`dist-cell ${distClass}`}>
            {dist ? <><span className="dist-km">{dist.km} km</span><span className="dist-min">~{dist.mins} min</span></> : <span className="meios-none">—</span>}
          </td>
        )}
        <td onClick={e => e.stopPropagation()}>
          <div className="meios-actions">
            <div className="dropdown-wrap">
              <button className="btn btn-secondary btn-sm"
                onClick={() => setOpenDropdownId(isDropdownOpen ? null : unit.id)}>
                {assignedId ? 'Mover ▾' : 'Atribuir ▾'}
              </button>
              {isDropdownOpen && (
                <div className="dropdown-menu">
                  {assignableIncidents.length === 0 && <div className="dropdown-empty">Sem ocorrências ativas</div>}
                  {assignableIncidents.map(inc => (
                    <button key={inc.id} className={`dropdown-item ${assignedId === inc.id ? 'current' : ''}`}
                      onClick={() => { assignUnit(unit.id, inc.id); setOpenDropdownId(null) }}>
                      {inc.name} <span className="dropdown-id">{inc.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {assignedId && (
              <button className="btn btn-ghost btn-sm" onClick={() => unassignUnit(unit.id)} title="Retirar">✕</button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  function TableHead({ showIncidentCol = true }) {
    return (
      <thead>
        <tr>
          <th className="col-sortable" onClick={() => handleSort('name')}>
            Unidade <SortIcon col="name" sortBy={sortBy} sortDir={sortDir} />
          </th>
          <th className="col-sortable" onClick={() => handleSort('type')}>
            Tipo <SortIcon col="type" sortBy={sortBy} sortDir={sortDir} />
          </th>
          <th className="col-sortable" onClick={() => handleSort('status')}>
            Estado <SortIcon col="status" sortBy={sortBy} sortDir={sortDir} />
          </th>
          {showIncidentCol && (
            <th className="col-sortable" onClick={() => handleSort('incident')}>
              Ocorrência <SortIcon col="incident" sortBy={sortBy} sortDir={sortDir} />
            </th>
          )}
          {activeIncident && (
            <th className="col-sortable" onClick={() => handleSort('distance')}>
              Distância <SortIcon col="distance" sortBy={sortBy} sortDir={sortDir} />
            </th>
          )}
          <th>Ações</th>
        </tr>
      </thead>
    )
  }

  return (
    <div className="meios-page">

      {/* ── Incident stat cards ── */}
      <div className="meios-inc-cards">
        {incidentStats.map(({ inc, total, onscene, enroute }) => (
          <button
            key={inc.id}
            className={`meios-inc-card ${distanceRefId === inc.id ? 'active' : ''}`}
            style={{ '--inc-color': INC_COLORS[inc.status] }}
            onClick={() => setDistanceRefId(distanceRefId === inc.id ? null : inc.id)}
          >
            <div className="mic-header">
              <span className="mic-name">{inc.name}</span>
              <span className={statusBadge(inc.status)}>{incidentStatusLabel(inc.status)}</span>
            </div>
            <div className="mic-total">{total} <span className="mic-total-label">unidades</span></div>
            <div className="mic-stats">
              <span><span className="mic-dot onscene" />{onscene} em ocorrência</span>
              <span><span className="mic-dot enroute" />{enroute} em deslocação</span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="meios-filters">
        <div className="meios-filter-row">
          <div className="meios-tabs">
            {TYPE_TABS.map(tab => (
              <button key={tab} className={`tab-btn ${typeTab === tab ? 'active' : ''}`} onClick={() => setTypeTab(tab)}>{tab}</button>
            ))}
          </div>
          <button className={`tab-btn ${groupView ? 'active' : ''}`}
            onClick={() => setGroupView(v => !v)} title="Agrupar por ocorrência">
            ⊞ Agrupar
          </button>
        </div>
        <div className="meios-filter-row">
          <div className="meios-tabs">
            {STATUS_TABS.map(tab => (
              <button key={tab} className={`tab-btn ${statusTab === tab ? 'active' : ''}`} onClick={() => setStatusTab(tab)}>{tab}</button>
            ))}
          </div>
        </div>
        <div className="meios-search-row">
          <div className="search-wrapper">
            <span className="search-icon">Q</span>
            <input className="search-input" placeholder="Pesquisar unidades..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className="meios-summary-text">
            <span className="s-available">{summary.available} disponíveis</span>
            <span className="s-sep">·</span>
            <span className="s-enroute">{summary.enroute} em deslocação</span>
            <span className="s-sep">·</span>
            <span className="s-onscene">{summary.onscene} em ocorrência</span>
            <span className="s-sep">·</span>
            <span>{summary.total} total</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNovaModal(true)}>+ Nova Unidade</button>
        </div>
      </div>

      {/* Distance reference chip */}
      {distanceRefId && (
        <div className="meios-chip-row">
          <span className="filter-chip">
            📍 Distância a: {allIncidents.find(i => i.id === distanceRefId)?.name || distanceRefId}
            <button className="chip-clear" onClick={() => setDistanceRefId(null)}>×</button>
          </span>
        </div>
      )}

      {/* ── Table / Grouped view ── */}
      <div className="meios-table-wrap">
        {groupedUnits ? (
          groupedUnits.map(({ incident, units }) => {
            const gid = incident?.id || '__unassigned'
            const collapsed = collapsedGroups.has(gid)
            const color = incident ? (INC_COLORS[incident.status] || 'var(--border)') : 'var(--text-secondary)'
            return (
              <div key={gid} className="meios-group">
                <div className="meios-group-header" style={{ '--gc': color }} onClick={() => toggleGroup(gid)}>
                  <span className="group-arrow">{collapsed ? '▸' : '▾'}</span>
                  <span className="group-color-bar" />
                  <span className="group-name">{incident ? incident.name : 'Sem atribuição'}</span>
                  {incident && <span className={statusBadge(incident.status)}>{incidentStatusLabel(incident.status)}</span>}
                  <span className="group-count">{units.length} unidades</span>
                </div>
                {!collapsed && (
                  <table className="meios-table">
                    <TableHead showIncidentCol={false} />
                    <tbody>{units.map(u => renderRow(u, false))}</tbody>
                  </table>
                )}
              </div>
            )
          })
        ) : (
          <table className="meios-table">
            <TableHead showIncidentCol={true} />
            <tbody>
              {sortedUnits.map(u => renderRow(u, true))}
              {sortedUnits.length === 0 && (
                <tr><td colSpan={5} className="meios-empty">Sem unidades com estes filtros.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* UnitDetailPanel */}
      {selectedUnit && (
        <UnitDetailPanel
          unit={selectedUnit}
          unitStatuses={unitStatuses}
          unitAssignments={unitAssignments}
          allIncidents={allIncidents}
          assignUnit={assignUnit}
          unassignUnit={unassignUnit}
          onClose={() => setSelectedUnitId(null)}
        />
      )}

      {/* Nova Unidade modal */}
      {showNovaModal && (
        <div className="modal-overlay" onClick={() => setShowNovaModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nova Unidade</h3>
              <button className="icon-btn" onClick={() => setShowNovaModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-label">Nome *</label>
              <input className="form-input" value={novaName} onChange={e => setNovaName(e.target.value)} placeholder="Ex: B.V. Pombal" autoFocus />
              <label className="form-label">Tipo</label>
              <select className="form-select" value={novaType} onChange={e => setNovaType(e.target.value)}>
                <option value="bombeiros">Bombeiros</option>
                <option value="gnr">GNR</option>
                <option value="anepc">ANEPC</option>
                <option value="air">Aéreo</option>
                <option value="municipal">Municipal</option>
                <option value="other">Outro</option>
              </select>
              <label className="form-label">Latitude (opcional)</label>
              <input className="form-input" value={novaLat} onChange={e => setNovaLat(e.target.value)} placeholder="39.9" />
              <label className="form-label">Longitude (opcional)</label>
              <input className="form-input" value={novaLng} onChange={e => setNovaLng(e.target.value)} placeholder="-8.6" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNovaModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleNovaUnitSave} disabled={!novaName.trim()}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MeiosPage() {
  return (
    <Suspense fallback={<div style={{ padding: '64px 24px', color: 'var(--text-secondary)' }}>A carregar...</div>}>
      <MeiosPageInner />
    </Suspense>
  )
}
