'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { units as mockUnits } from '../data/mockData'

// ── Seed helpers ────────────────────────────────────────────────────────────

function seedIfAbsent() {
  try {
    if (!localStorage.getItem('poci_unitAssignments')) {
      const assignments = {}
      mockUnits.forEach(u => {
        // If status is 'available', assignment is always null (mock data inconsistency guard)
        assignments[u.id] = u.status === 'available' ? null : (u.incident || null)
      })
      localStorage.setItem('poci_unitAssignments', JSON.stringify(assignments))
    }
  } catch {}
  try {
    if (!localStorage.getItem('poci_unitStatuses')) {
      const statuses = {}
      mockUnits.forEach(u => { statuses[u.id] = u.status || 'available' })
      localStorage.setItem('poci_unitStatuses', JSON.stringify(statuses))
    }
  } catch {}
  try {
    if (!localStorage.getItem('poci_customUnits')) {
      localStorage.setItem('poci_customUnits', JSON.stringify([]))
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

  const channelRef = useRef(null)
  const mountedRef = useRef(false)

  // ── On mount: seed + read all state ──────────────────────────────────────
  useEffect(() => {
    seedIfAbsent()

    // Unit state
    setUnitAssignments(readLS('poci_unitAssignments', {}))
    setUnitStatuses(readLS('poci_unitStatuses', {}))
    setCustomUnits(readLS('poci_customUnits', []))

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
    }
    channelRef.current = channel
    return () => channel.close()
  }, [])

  function broadcast() {
    channelRef.current?.postMessage({ type: 'poci-state-changed' })
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function assignUnit(unitId, incidentId) {
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
    setUnitStatuses(prev => {
      const next = { ...prev, [unitId]: status }
      try { localStorage.setItem('poci_unitStatuses', JSON.stringify(next)) } catch {}
      return next
    })
    broadcast()
  }

  function addCustomUnit(unit) {
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const allUnits = useMemo(() => [...mockUnits, ...customUnits], [customUnits])

  const unitsByIncident = useCallback(
    (incidentId) => allUnits.filter(u => unitAssignments[u.id] === incidentId),
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
    assignUnit, unassignUnit, setUnitStatus, addCustomUnit,

    // Derived
    allUnits, unitsByIncident, availableUnits,
  }
}
