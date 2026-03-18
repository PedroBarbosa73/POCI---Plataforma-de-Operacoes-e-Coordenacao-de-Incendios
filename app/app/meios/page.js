// app/app/meios/page.js
'use client'

import { useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { incidents as mockIncidents } from '../data/mockData'
import { usePociState } from '../lib/usePociState'
import { unitBadge, unitStatusLabel } from '../lib/labels'
import UnitDetailPanel from '../components/UnitDetailPanel'

const TYPE_TABS = ['Todos', 'Bombeiros', 'GNR', 'ANEPC', 'Aéreo', 'Municipal', 'Outro']
const STATUS_TABS = ['Todos', 'Disponível', 'Atribuído', 'Em Deslocação', 'Em Ocorrência']

const TYPE_MAP = {
  'Todos': null,
  'Bombeiros': 'bombeiros',
  'GNR': 'gnr',
  'ANEPC': 'anepc',
  'Aéreo': 'air',
  'Municipal': 'municipal',
  'Outro': 'other',
}

const STATUS_MAP = {
  'Todos': null,
  'Disponível': 'available',
  'Atribuído': 'assigned',
  'Em Deslocação': 'enroute',
  'Em Ocorrência': 'onscene',
}

function MeiosPageInner() {
  const searchParams = useSearchParams()
  const incidentFilter = searchParams.get('incident') // e.g. 'INC-034' or null

  const {
    unitAssignments, unitStatuses,
    allUnits, unitsByIncident,
    assignUnit, unassignUnit, addCustomUnit,
    customIncidents,
  } = usePociState()

  const allIncidents = useMemo(
    () => [...mockIncidents, ...customIncidents],
    [customIncidents]
  )

  // ── Filter state ──────────────────────────────────────────────────────────
  const [typeTab, setTypeTab] = useState('Todos')
  const [statusTab, setStatusTab] = useState('Todos')
  const [query, setQuery] = useState('')
  // incidentFilter from URL is a read-only chip — user can clear it
  const [activeIncidentFilter, setActiveIncidentFilter] = useState(incidentFilter)

  // ── UnitDetailPanel state ─────────────────────────────────────────────────
  const [selectedUnitId, setSelectedUnitId] = useState(null)
  const selectedUnit = useMemo(
    () => allUnits.find(u => u.id === selectedUnitId) || null,
    [selectedUnitId, allUnits]
  )

  // ── Nova Unidade modal state ───────────────────────────────────────────────
  const [showNovaModal, setShowNovaModal] = useState(false)
  const [novaName, setNovaName] = useState('')
  const [novaType, setNovaType] = useState('bombeiros')
  const [novaLat, setNovaLat] = useState('')
  const [novaLng, setNovaLng] = useState('')

  // ── Dropdown state: which unit's dropdown is open ─────────────────────────
  const [openDropdownId, setOpenDropdownId] = useState(null)

  // ── Filtered units ────────────────────────────────────────────────────────
  const filteredUnits = useMemo(() => {
    let list = allUnits

    // Incident chip filter (from URL query param)
    if (activeIncidentFilter) {
      list = list.filter(u => unitAssignments[u.id] === activeIncidentFilter)
    }

    // Type tab
    const typeValue = TYPE_MAP[typeTab]
    if (typeValue) list = list.filter(u => u.type === typeValue)

    // Status tab
    const statusValue = STATUS_MAP[statusTab]
    if (statusValue) list = list.filter(u => (unitStatuses[u.id] || u.status) === statusValue)

    // Search
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
      )
    }

    return list
  }, [allUnits, unitAssignments, unitStatuses, typeTab, statusTab, query, activeIncidentFilter])

  // ── Summary counts ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const available = allUnits.filter(u => (unitStatuses[u.id] || u.status) === 'available').length
    const enroute = allUnits.filter(u => (unitStatuses[u.id] || u.status) === 'enroute').length
    const onscene = allUnits.filter(u => (unitStatuses[u.id] || u.status) === 'onscene').length
    return { available, enroute, onscene, total: allUnits.length }
  }, [allUnits, unitStatuses])

  // ── Assignable incidents (active + controlled + surveillance) ─────────────
  const assignableIncidents = useMemo(
    () => allIncidents.filter(i => i.status !== 'resolved'),
    [allIncidents]
  )

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAssign(unitId, incidentId) {
    assignUnit(unitId, incidentId)
    setOpenDropdownId(null)
  }

  function handleUnassign(unitId) {
    unassignUnit(unitId)
  }

  function handleNovaUnitSave() {
    if (!novaName.trim()) return
    const unit = {
      id: `CUST-U-${Date.now()}`,
      name: novaName.trim(),
      type: novaType,
      lat: novaLat ? parseFloat(novaLat) : undefined,
      lng: novaLng ? parseFloat(novaLng) : undefined,
    }
    addCustomUnit(unit)
    setShowNovaModal(false)
    setNovaName(''); setNovaType('bombeiros'); setNovaLat(''); setNovaLng('')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="meios-page">
      {/* ── Filter bar ── */}
      <div className="meios-filters">
        <div className="meios-tabs">
          {TYPE_TABS.map(tab => (
            <button
              key={tab}
              className={`tab-btn ${typeTab === tab ? 'active' : ''}`}
              onClick={() => setTypeTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="meios-tabs">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              className={`tab-btn ${statusTab === tab ? 'active' : ''}`}
              onClick={() => setStatusTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="meios-search-row">
          <div className="search-wrapper">
            <span className="search-icon">Q</span>
            <input
              className="search-input"
              placeholder="Pesquisar unidades..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNovaModal(true)}>
            + Nova Unidade
          </button>
        </div>
      </div>

      {/* ── Incident chip ── */}
      {activeIncidentFilter && (
        <div className="meios-chip-row">
          <span className="filter-chip">
            Mostrando: {activeIncidentFilter}
            <button className="chip-clear" onClick={() => setActiveIncidentFilter(null)}>×</button>
          </span>
        </div>
      )}

      {/* ── Summary strip ── */}
      <div className="meios-summary">
        <span>{summary.available} disponíveis</span>
        <span>·</span>
        <span>{summary.enroute} em deslocação</span>
        <span>·</span>
        <span>{summary.onscene} em ocorrência</span>
        <span>·</span>
        <span>{summary.total} no total</span>
      </div>

      {/* ── Unit table ── */}
      <div className="meios-table-wrap">
        <table className="meios-table">
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Ocorrência</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.map(unit => {
              const status = unitStatuses[unit.id] || unit.status || 'available'
              const assignedId = unitAssignments[unit.id] || null
              const assignedInc = allIncidents.find(i => i.id === assignedId)
              const isAssigned = !!assignedId
              const isDropdownOpen = openDropdownId === unit.id

              return (
                <tr
                  key={unit.id}
                  className={`meios-row ${selectedUnitId === unit.id ? 'selected' : ''}`}
                  onClick={() => setSelectedUnitId(unit.id === selectedUnitId ? null : unit.id)}
                >
                  <td className="meios-unit-name">{unit.name}</td>
                  <td>{unit.type}</td>
                  <td>
                    <span className={unitBadge(status)}>{unitStatusLabel(status)}</span>
                  </td>
                  <td>{assignedInc ? `${assignedInc.name} (${assignedId})` : '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="meios-actions">
                    {/* Assign / Move dropdown */}
                    <div className="dropdown-wrap">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setOpenDropdownId(isDropdownOpen ? null : unit.id)}
                      >
                        {isAssigned ? 'Mover ▾' : 'Atribuir ▾'}
                      </button>
                      {isDropdownOpen && (
                        <div className="dropdown-menu">
                          {assignableIncidents.length === 0 && (
                            <div className="dropdown-empty">Sem ocorrências ativas</div>
                          )}
                          {assignableIncidents.map(inc => (
                            <button
                              key={inc.id}
                              className={`dropdown-item ${assignedId === inc.id ? 'current' : ''}`}
                              onClick={() => handleAssign(unit.id, inc.id)}
                            >
                              {inc.name} <span className="dropdown-id">{inc.id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Unassign */}
                    {isAssigned && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleUnassign(unit.id)}
                        title="Retirar da ocorrência"
                      >
                        ✕
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filteredUnits.length === 0 && (
              <tr>
                <td colSpan={5} className="meios-empty">Sem unidades.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── UnitDetailPanel ── */}
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

      {/* ── Nova Unidade modal ── */}
      {showNovaModal && (
        <div className="modal-overlay" onClick={() => setShowNovaModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nova Unidade</h3>
              <button className="icon-btn" onClick={() => setShowNovaModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-label">Nome *</label>
              <input
                className="form-input"
                value={novaName}
                onChange={e => setNovaName(e.target.value)}
                placeholder="Ex: B.V. Pombal"
              />
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
              <button className="btn btn-primary btn-sm" onClick={handleNovaUnitSave} disabled={!novaName.trim()}>
                Guardar
              </button>
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
