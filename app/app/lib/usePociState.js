'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { units as mockUnits, incidents as mockIncidents, alerts as mockAlerts, radioMessages as mockRadioMessages } from '../data/mockData'

// ── Seed helpers ────────────────────────────────────────────────────────────

function seedIfAbsent() {
  // Detect stale data: if the first mock unit's ID is not in stored assignments, re-seed everything
  let stale = false;
  try {
    const stored = localStorage.getItem('poci_unitAssignments');
    if (stored) {
      const assignments = JSON.parse(stored);
      stale = mockUnits.length > 0 && !(mockUnits[0].id in assignments);
    }
  } catch { stale = true; }

  if (stale) {
    try { localStorage.removeItem('poci_unitAssignments'); } catch {}
    try { localStorage.removeItem('poci_unitStatuses'); } catch {}
    try { localStorage.removeItem('poci_customUnits'); } catch {}
    try { localStorage.removeItem('poci_opLog'); } catch {}
  }

  try {
    if (!localStorage.getItem('poci_unitAssignments')) {
      const assignments = {};
      mockUnits.forEach(u => {
        assignments[u.id] = u.status === 'available' ? null : (u.incident || null);
      });
      localStorage.setItem('poci_unitAssignments', JSON.stringify(assignments));
    }
  } catch {}
  try {
    if (!localStorage.getItem('poci_unitStatuses')) {
      const statuses = {};
      mockUnits.forEach(u => { statuses[u.id] = u.status || 'available'; });
      localStorage.setItem('poci_unitStatuses', JSON.stringify(statuses));
    }
  } catch {}
  try {
    if (!localStorage.getItem('poci_customUnits')) {
      localStorage.setItem('poci_customUnits', JSON.stringify([]));
    }
  } catch {}

  // Seed alerts
  try {
    if (!localStorage.getItem('poci_alerts')) {
      localStorage.setItem('poci_alerts', JSON.stringify(mockAlerts));
    }
  } catch {}

  // Seed operations log with historical entries from mock data
  try {
    const existingLog = localStorage.getItem('poci_opLog')
    if (!existingLog || JSON.parse(existingLog).length === 0) {
      const now = Date.now()
      // Spread entries over the last 6 hours, oldest first
      const assignedUnits = mockUnits.filter(u => u.status !== 'available' && u.incident)
      const totalEntries = assignedUnits.length
      const entries = []
      assignedUnits.forEach((u, i) => {
        const baseTs = now - (6 * 60 * 60 * 1000) + Math.floor((i / totalEntries) * 5.5 * 60 * 60 * 1000)
        // Log assignment
        entries.push({
          id: `LOG-SEED-${u.id}-assign`,
          ts: baseTs,
          type: 'unit_assigned',
          unitId: u.id,
          incidentId: u.incident,
        })
        // Log status change if not just 'assigned'
        if (u.status === 'enroute' || u.status === 'onscene') {
          entries.push({
            id: `LOG-SEED-${u.id}-status`,
            ts: baseTs + 5 * 60 * 1000,
            type: 'status_changed',
            unitId: u.id,
            from: 'assigned',
            to: u.status,
            incidentId: u.incident,
          })
        }
      })
      // Incidents created at start of operational period
      mockIncidents.forEach((inc, i) => {
        const incTs = now - (8 * 60 * 60 * 1000) + i * 20 * 60 * 1000
        entries.push({
          id: `LOG-SEED-INC-${inc.id}`,
          ts: incTs,
          type: 'incident_created',
          incidentId: inc.id,
          incidentName: inc.name,
          area: inc.area,
          status: inc.status,
        })
        // Status transitions for non-active incidents
        if (inc.status === 'controlled') {
          entries.push({
            id: `LOG-SEED-INC-STATUS-${inc.id}`,
            ts: incTs + 3 * 60 * 60 * 1000,
            type: 'incident_status_changed',
            incidentId: inc.id,
            incidentName: inc.name,
            from: 'active',
            to: 'controlled',
          })
        } else if (inc.status === 'surveillance') {
          entries.push({
            id: `LOG-SEED-INC-STATUS-${inc.id}`,
            ts: incTs + 2 * 60 * 60 * 1000,
            type: 'incident_status_changed',
            incidentId: inc.id,
            incidentName: inc.name,
            from: 'active',
            to: 'surveillance',
          })
        }
      })

      // Alerts triggered
      mockAlerts.forEach((alert, i) => {
        entries.push({
          id: `LOG-SEED-ALERT-${alert.id}`,
          ts: now - (5 * 60 * 60 * 1000) + i * 25 * 60 * 1000,
          type: 'alert_triggered',
          alertId: alert.id,
          alertTitle: alert.title,
          alertLevel: alert.level,
          target: alert.target,
          incidentId: alert.incidentId,
        })
      })

      // Radio messages — same source as RadioPanel
      mockRadioMessages.forEach((m, i) => {
        entries.push({
          id: `LOG-SEED-RADIO-${i}`,
          ts: now - (4 * 60 * 60 * 1000) + i * 28 * 60 * 1000,
          type: 'radio_message',
          from: m.from,
          message: m.msg,
          incidentId: m.incidentId,
        })
      })

      // Weather alert
      entries.push({
        id: 'LOG-SEED-WEATHER-1',
        ts: now - (3 * 60 * 60 * 1000),
        type: 'weather_alert',
        description: 'Vento NE 32km/h com rajadas 52km/h. Temperatura 34°C, humidade 18%. Condições extremas.',
        incidentId: null,
      })

      // Sort newest first
      entries.sort((a, b) => b.ts - a.ts)
      localStorage.setItem('poci_opLog', JSON.stringify(entries.slice(0, 500)))
    }
  } catch {}

  // Seed radio messages
  try {
    if (!localStorage.getItem('poci_radioMessages')) {
      localStorage.setItem('poci_radioMessages', JSON.stringify(mockRadioMessages))
    }
  } catch {}
}

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePociState() {
  // ── Migrated from PociApp.js ─────────────────────────────────────────────
  const [customIncidents, setCustomIncidents] = useState([])
  const [drawnZonesByIncident, setDrawnZonesByIncident] = useState({})
  const [drawnClosures, setDrawnClosures] = useState([])
  const [demoMode, setDemoMode] = useState(true)

  // ── New unit state ────────────────────────────────────────────────────────
  const [unitAssignments, setUnitAssignments] = useState({})
  const [unitStatuses, setUnitStatuses] = useState({})
  const [customUnits, setCustomUnits] = useState([])
  const [opLog, setOpLog] = useState([])
  const [alerts, setAlerts] = useState([])
  const [radioMessages, setRadioMessages] = useState([])

  const channelRef = useRef(null)
  const mountedRef = useRef(false)

  // ── On mount: seed + read all state ──────────────────────────────────────
  useEffect(() => {
    seedIfAbsent()

    // Unit state
    setUnitAssignments(readLS('poci_unitAssignments', {}))
    setUnitStatuses(readLS('poci_unitStatuses', {}))
    setCustomUnits(readLS('poci_customUnits', []))
    setOpLog(readLS('poci_opLog', []))
    setAlerts(readLS('poci_alerts', mockAlerts))
    setRadioMessages(readLS('poci_radioMessages', mockRadioMessages))

    // Migrated state (matching existing PociApp.js pattern)
    const zones = localStorage.getItem('poci_drawnZones')
    if (zones) { try { setDrawnZonesByIncident(JSON.parse(zones)) } catch {} }
    const cls = localStorage.getItem('poci_drawnClosures')
    if (cls) { try { setDrawnClosures(JSON.parse(cls)) } catch {} }
    const ci = localStorage.getItem('poci_customIncidents')
    if (ci) { try { setCustomIncidents(JSON.parse(ci)) } catch {} }

    mountedRef.current = true
  }, [])

  // ── Persist migrated state on change (existing pattern) ──────────────────
  useEffect(() => {
    if (!mountedRef.current) return
    try { localStorage.setItem('poci_drawnZones', JSON.stringify(drawnZonesByIncident)) } catch {}
    broadcast()
  }, [drawnZonesByIncident])

  useEffect(() => {
    if (!mountedRef.current) return
    try { localStorage.setItem('poci_drawnClosures', JSON.stringify(drawnClosures)) } catch {}
    broadcast()
  }, [drawnClosures])

  useEffect(() => {
    if (!mountedRef.current) return
    try { localStorage.setItem('poci_customIncidents', JSON.stringify(customIncidents)) } catch {}
    broadcast()
  }, [customIncidents])

  // ── BroadcastChannel: re-read all state when another tab writes ───────────
  useEffect(() => {
    const channel = new BroadcastChannel('poci')
    channel.onmessage = () => {
      setUnitAssignments(readLS('poci_unitAssignments', {}))
      setUnitStatuses(readLS('poci_unitStatuses', {}))
      setCustomUnits(readLS('poci_customUnits', []))
      setCustomIncidents(readLS('poci_customIncidents', []))
      setDrawnZonesByIncident(readLS('poci_drawnZones', {}))
      setDrawnClosures(readLS('poci_drawnClosures', []))
      setOpLog(readLS('poci_opLog', []))
      setAlerts(readLS('poci_alerts', mockAlerts))
      setRadioMessages(readLS('poci_radioMessages', []))
    }
    channelRef.current = channel
    return () => {
      channelRef.current = null
      channel.close()
    }
  }, [])

  function broadcast() {
    try { channelRef.current?.postMessage({ type: 'poci-state-changed' }) } catch {}
  }

  // ── Operations log ────────────────────────────────────────────────────────

  function appendLog(entry) {
    const logEntry = { id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...entry }
    setOpLog(prev => {
      const next = [logEntry, ...prev].slice(0, 500)
      try { localStorage.setItem('poci_opLog', JSON.stringify(next)) } catch {}
      return next
    })
  }

  function clearLog() {
    setOpLog([])
    try { localStorage.removeItem('poci_opLog') } catch {}
    broadcast()
  }

  // ── Alert actions ─────────────────────────────────────────────────────────

  function addAlert(alert) {
    setAlerts(prev => {
      const next = [alert, ...prev]
      try { localStorage.setItem('poci_alerts', JSON.stringify(next)) } catch {}
      broadcast()
      return next
    })
  }

  function addRadioMessage(msg) {
    const entry = { id: `RAD-${Date.now()}`, ...msg }
    setRadioMessages(prev => {
      const next = [entry, ...prev]
      try { localStorage.setItem('poci_radioMessages', JSON.stringify(next)) } catch {}
      broadcast()
      return next
    })
    appendLog({ type: 'radio_message', from: msg.from, message: msg.message, incidentId: msg.incidentId })
  }

  function resolveAlert(id) {
    setAlerts(prev => {
      const next = prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a)
      try { localStorage.setItem('poci_alerts', JSON.stringify(next)) } catch {}
      broadcast()
      return next
    })
    appendLog({ type: 'alert_resolved', alertId: id })
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function assignUnit(unitId, incidentId) {
    appendLog({ type: 'unit_assigned', unitId, incidentId })
    let savedAssignments
    setUnitAssignments(prev => {
      const next = { ...prev, [unitId]: incidentId }
      try { localStorage.setItem('poci_unitAssignments', JSON.stringify(next)) } catch {}
      savedAssignments = next
      return next
    })
    setUnitStatuses(prev => {
      const next = { ...prev, [unitId]: 'assigned' }
      try { localStorage.setItem('poci_unitStatuses', JSON.stringify(next)) } catch {}
      return next
    })
    broadcast()
  }

  function unassignUnit(unitId) {
    appendLog({ type: 'unit_unassigned', unitId, prevIncidentId: unitAssignments[unitId] || null })
    setUnitAssignments(prev => {
      const next = { ...prev, [unitId]: null }
      try { localStorage.setItem('poci_unitAssignments', JSON.stringify(next)) } catch {}
      return next
    })
    setUnitStatuses(prev => {
      const next = { ...prev, [unitId]: 'available' }
      try { localStorage.setItem('poci_unitStatuses', JSON.stringify(next)) } catch {}
      return next
    })
    broadcast()
  }

  function setUnitStatus(unitId, status) {
    appendLog({ type: 'status_changed', unitId, from: unitStatuses[unitId] || 'available', to: status, incidentId: unitAssignments[unitId] || null })
    setUnitStatuses(prev => {
      const next = { ...prev, [unitId]: status }
      try { localStorage.setItem('poci_unitStatuses', JSON.stringify(next)) } catch {}
      return next
    })
    broadcast()
  }

  function addCustomUnit(unit) {
    appendLog({ type: 'unit_added', unitId: unit.id, unitName: unit.name, unitType: unit.type })
    setCustomUnits(prev => {
      const next = [...prev, unit]
      try { localStorage.setItem('poci_customUnits', JSON.stringify(next)) } catch {}
      return next
    })
    setUnitAssignments(prev => {
      const next = { ...prev, [unit.id]: null }
      try { localStorage.setItem('poci_unitAssignments', JSON.stringify(next)) } catch {}
      return next
    })
    setUnitStatuses(prev => {
      const next = { ...prev, [unit.id]: 'available' }
      try { localStorage.setItem('poci_unitStatuses', JSON.stringify(next)) } catch {}
      return next
    })
    broadcast()
  }

  function updateIncidentStatus(incidentId, newStatus) {
    const inc = customIncidents.find(i => i.id === incidentId) || mockIncidents.find(i => i.id === incidentId)
    appendLog({ type: 'incident_status_changed', incidentId, incidentName: inc?.name || incidentId, from: inc?.status || '?', to: newStatus })
    setCustomIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, status: newStatus } : i))
    broadcast()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const allUnits = useMemo(() => [...mockUnits, ...customUnits], [customUnits])

  const unitsByIncident = useCallback(
    (incidentId) => allUnits.filter(u => {
      const a = unitAssignments[u.id];
      // Fall back to u.incident when not yet in state (e.g. stale localStorage on first load)
      return a !== undefined ? a === incidentId : u.incident === incidentId;
    }),
    [allUnits, unitAssignments]
  )

  const availableUnits = useMemo(
    () => allUnits.filter(u => !unitAssignments[u.id]),
    [allUnits, unitAssignments]
  )

  return {
    // Migrated
    customIncidents, setCustomIncidents,
    drawnZonesByIncident, setDrawnZonesByIncident,
    drawnClosures, setDrawnClosures,
    demoMode, setDemoMode,

    // Unit state
    unitAssignments, unitStatuses, customUnits,

    // Actions
    assignUnit, unassignUnit, setUnitStatus, addCustomUnit, updateIncidentStatus,

    // Derived
    allUnits, unitsByIncident, availableUnits,
    allIncidents: useMemo(() => [...mockIncidents, ...customIncidents], [customIncidents]),

    // Operations log
    opLog, clearLog, appendLog,

    // Alerts
    alerts, addAlert, resolveAlert,

    // Radio messages
    radioMessages, addRadioMessage,
  }
}
