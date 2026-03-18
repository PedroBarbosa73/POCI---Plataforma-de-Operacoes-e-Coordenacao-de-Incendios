'use client'

import Link from 'next/link'
import { unitBadge, unitStatusLabel } from '../lib/labels'

export default function UnitDetailPanel({ unit, unitStatuses, unitAssignments, allIncidents, assignUnit, unassignUnit, onClose }) {
  if (!unit) return null

  const status = unitStatuses[unit.id] || unit.status || 'available'
  const assignedIncidentId = unitAssignments[unit.id] || null
  const assignedIncident = allIncidents.find(i => i.id === assignedIncidentId) || null

  return (
    <div className="unit-detail-panel">
      <div className="unit-detail-header">
        <div className="unit-detail-title">{unit.name}</div>
        <button className="icon-btn" onClick={onClose} title="Fechar">×</button>
      </div>

      <div className="unit-detail-body">
        <div className="unit-detail-row">
          <span className="unit-detail-label">ID</span>
          <span className="unit-detail-value">{unit.id}</span>
        </div>
        <div className="unit-detail-row">
          <span className="unit-detail-label">Tipo</span>
          <span className="unit-detail-value">{unit.type}</span>
        </div>
        <div className="unit-detail-row">
          <span className="unit-detail-label">Estado</span>
          <span className={unitBadge(status)}>{unitStatusLabel(status)}</span>
        </div>
        <div className="unit-detail-row">
          <span className="unit-detail-label">Ocorrência</span>
          {assignedIncident ? (
            <Link href={`/comando?focus=${assignedIncidentId}`} className="link-subtle">
              {assignedIncident.name} ({assignedIncidentId})
            </Link>
          ) : (
            <span className="unit-detail-value">—</span>
          )}
        </div>
      </div>

      <div className="unit-detail-actions">
        {assignedIncidentId ? (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => { unassignUnit(unit.id); onClose() }}
          >
            Retirar da ocorrência
          </button>
        ) : null}
      </div>
    </div>
  )
}
