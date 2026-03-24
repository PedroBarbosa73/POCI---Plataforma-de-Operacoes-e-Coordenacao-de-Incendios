'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from './supabase'

// ── localStorage helpers (scenario state only) ───────────────────────────────

function readLS(key, fallback) {
  try { const r = localStorage.getItem(key); return r !== null ? JSON.parse(r) : fallback } catch { return fallback }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePociState() {
  const supabase = getSupabase()

  // ── Server state ──────────────────────────────────────────────────────────
  const [incidents,   setIncidents]   = useState([])
  const [units,       setUnits]       = useState([])
  const [unitStates,  setUnitStates]  = useState([])  // unit_states rows
  const [zones,       setZones]       = useState([])
  const [closures,    setClosures]    = useState([])
  const [alerts,      setAlerts]      = useState([])
  const [opLog,       setOpLog]       = useState([])
  const [fireStations, setFireStations] = useState([])
  const [hydrated,    setHydrated]    = useState(false)

  // ── Scenario state (localStorage only) ───────────────────────────────────
  const [demoMode,        setDemoMode]        = useState(true)
  const [scenarioActive,  setScenarioActive]  = useState(false)
  const [currentStep,     setCurrentStep]     = useState(0)
  const snapshotsRef = useRef({})

  // ── Refs for use inside callbacks ─────────────────────────────────────────
  const incidentsRef  = useRef([])
  const unitsRef      = useRef([])
  const unitStatesRef = useRef([])

  useEffect(() => { incidentsRef.current  = incidents  }, [incidents])
  useEffect(() => { unitsRef.current      = units      }, [units])
  useEffect(() => { unitStatesRef.current = unitStates }, [unitStates])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [
        { data: inc },
        { data: u },
        { data: us },
        { data: z },
        { data: cl },
        { data: al },
        { data: log },
        { data: fs },
      ] = await Promise.all([
        supabase.from('incidents').select('*'),
        supabase.from('units').select('*'),
        supabase.from('unit_states').select('*'),
        supabase.from('zones').select('*'),
        supabase.from('closures').select('*'),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }),
        supabase.from('op_log').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('fire_stations').select('*'),
      ])
      if (inc)  setIncidents(inc)
      if (u)    setUnits(u)
      if (us)   setUnitStates(us)
      if (z)    setZones(z)
      if (cl)   setClosures(cl)
      if (al)   setAlerts(al)
      if (log)  setOpLog(log)
      if (fs)   setFireStations(fs)

      // Restore scenario state from localStorage
      const ss = readLS('poci_scenario_state', {})
      if (ss.scenarioActive) setScenarioActive(true)
      if (typeof ss.currentStep === 'number') setCurrentStep(ss.currentStep)

      setHydrated(true)
    }
    load()
  }, []) // eslint-disable-line

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return

    function applyChange(setState, idKey) {
      return (payload) => {
        if (payload.eventType === 'DELETE') {
          setState(prev => prev.filter(r => r[idKey] !== payload.old[idKey]))
        } else {
          setState(prev => {
            const idx = prev.findIndex(r => r[idKey] === payload.new[idKey])
            if (idx >= 0) { const n = [...prev]; n[idx] = payload.new; return n }
            return [...prev, payload.new]
          })
        }
      }
    }

    const channel = supabase.channel('poci-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents'   }, applyChange(setIncidents,  'id'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units'       }, applyChange(setUnits,      'id'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unit_states' }, applyChange(setUnitStates, 'unit_id'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones'       }, applyChange(setZones,      'id'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closures'    }, applyChange(setClosures,   'id'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts'      }, applyChange(setAlerts,     'id'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'op_log' }, (payload) => {
        setOpLog(prev => [payload.new, ...prev].slice(0, 500))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [hydrated]) // eslint-disable-line

  // ── Derived state ─────────────────────────────────────────────────────────

  const unitAssignments = useMemo(() => {
    const map = {}
    unitStates.forEach(us => { map[us.unit_id] = us.incident_id ?? null })
    return map
  }, [unitStates])

  const unitStatuses = useMemo(() => {
    const map = {}
    unitStates.forEach(us => { map[us.unit_id] = us.status })
    return map
  }, [unitStates])

  // Normalise unit rows to match the shape components expect (lat/lng from unit_states)
  const allUnits = useMemo(() =>
    units.map(u => {
      const us = unitStates.find(s => s.unit_id === u.id)
      const station = u.station_id ? fireStations.find(s => s.id === u.station_id) : null
      return {
        ...u,
        airKind: u.air_kind,
        stationId: u.station_id,
        lat: us?.lat ?? u.base_lat ?? station?.lat ?? null,
        lng: us?.lng ?? u.base_lng ?? station?.lng ?? null,
        status: us?.status ?? 'available',
        incident: us?.incident_id ?? null,
      }
    }),
    [units, unitStates, fireStations]
  )

  // Returns units for a given incident — kept as a function for API compatibility with PociApp.js
  const unitsByIncident = useCallback((incidentId) => {
    if (!incidentId) return allUnits
    return allUnits.filter(u => unitAssignments[u.id] === incidentId)
  }, [allUnits, unitAssignments])

  // Zones grouped by incident_id (shape expected by PociApp)
  const drawnZonesByIncident = useMemo(() => {
    const map = {}
    zones.forEach(z => {
      map[z.incident_id] = map[z.incident_id] ?? []
      map[z.incident_id].push({ ...z, radiusKm: z.radius_km })
    })
    return map
  }, [zones])

  // ── Write operations ──────────────────────────────────────────────────────

  const appendLog = useCallback(async (entry) => {
    const { type, incidentId, unitId, ...rest } = entry
    await supabase.from('op_log').insert({
      type,
      payload: rest,
      incident_id: incidentId ?? null,
      unit_id: unitId ?? null,
    })
  }, [supabase])

  const assignUnit = useCallback(async (unitId, incidentId) => {
    // Optimistic update
    setUnitStates(prev => prev.map(us =>
      us.unit_id === unitId ? { ...us, incident_id: incidentId, status: 'assigned' } : us
    ))
    await supabase.from('unit_states').update({ incident_id: incidentId, status: 'assigned' }).eq('unit_id', unitId)
    await appendLog({ type: 'unit_assigned', unitId, incidentId })
  }, [supabase, appendLog])

  const unassignUnit = useCallback(async (unitId) => {
    setUnitStates(prev => prev.map(us =>
      us.unit_id === unitId ? { ...us, incident_id: null, status: 'available' } : us
    ))
    await supabase.from('unit_states').update({ incident_id: null, status: 'available' }).eq('unit_id', unitId)
    await appendLog({ type: 'unit_unassigned', unitId })
  }, [supabase, appendLog])

  const setUnitStatus = useCallback(async (unitId, status) => {
    setUnitStates(prev => prev.map(us =>
      us.unit_id === unitId ? { ...us, status } : us
    ))
    await supabase.from('unit_states').update({ status }).eq('unit_id', unitId)
    const us = unitStatesRef.current.find(s => s.unit_id === unitId)
    await appendLog({ type: 'status_changed', unitId, incidentId: us?.incident_id ?? null, to: status })
  }, [supabase, appendLog])

  const addAlert = useCallback(async (alert) => {
    const { id: _ignore, ...rest } = alert
    const row = {
      incident_id: rest.incidentId ?? null,
      title: rest.title,
      level: rest.level,
      message: rest.message ?? null,
      radius: rest.radius ?? null,
      channels: rest.channels ?? [],
      status: rest.status ?? 'active',
    }
    await supabase.from('alerts').insert(row)
  }, [supabase])

  const resolveAlert = useCallback(async (alertId) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'resolved' } : a))
    await supabase.from('alerts').update({ status: 'resolved' }).eq('id', alertId)
  }, [supabase])

  // Zones — setDrawnZonesByIncident called by ZoneModal with the full updated map
  const setDrawnZonesByIncident = useCallback(async (updaterOrMap) => {
    // Accept either a value or an updater function (React pattern)
    const next = typeof updaterOrMap === 'function'
      ? updaterOrMap(drawnZonesByIncident)
      : updaterOrMap

    // Diff: find added zones (in next but not in current zones by id)
    const allCurrentIds = new Set(zones.map(z => z.id))
    for (const [incidentId, zoneList] of Object.entries(next)) {
      for (const z of (zoneList ?? [])) {
        if (!allCurrentIds.has(z.id)) {
          await supabase.from('zones').insert({
            id: z.id ?? undefined,
            incident_id: incidentId,
            name: z.name,
            type: z.type,
            radius_km: z.radiusKm ?? null,
            points: z.points ?? null,
          })
        }
      }
    }
  }, [supabase, zones, drawnZonesByIncident])

  const deleteZone = useCallback(async (zoneId) => {
    setZones(prev => prev.filter(z => z.id !== zoneId))
    await supabase.from('zones').delete().eq('id', zoneId)
  }, [supabase])

  // Closures
  const setDrawnClosures = useCallback(async (updaterOrList) => {
    const next = typeof updaterOrList === 'function' ? updaterOrList(closures) : updaterOrList
    const allCurrentIds = new Set(closures.map(c => c.id))
    for (const cl of next) {
      if (!allCurrentIds.has(cl.id)) {
        await supabase.from('closures').insert({
          id: cl.id ?? undefined,
          incident_id: cl.incidentId ?? null,
          name: cl.name,
          status: cl.status ?? 'active',
          points: cl.points ?? [],
        })
      }
    }
  }, [supabase, closures])

  const deleteClosure = useCallback(async (closureId) => {
    setClosures(prev => prev.filter(c => c.id !== closureId))
    await supabase.from('closures').delete().eq('id', closureId)
  }, [supabase])

  // Incidents (for Nova Ocorrência and scenario engine)
  const setCustomIncidents = useCallback(async (updaterOrList) => {
    const prev = incidentsRef.current
    const next = typeof updaterOrList === 'function' ? updaterOrList(prev) : updaterOrList
    const newIncs = next.filter(i => !prev.find(p => p.id === i.id))
    for (const inc of newIncs) {
      await supabase.from('incidents').insert({
        id: inc.id,
        name: inc.name,
        status: inc.status ?? 'active',
        lat: inc.lat,
        lng: inc.lng,
        area: inc.area ?? null,
        type: inc.type ?? null,
        brush_radius_km: inc.brushRadiusKm ?? null,
        wind_deg: inc.windDeg ?? null,
      })
    }
  }, [supabase])

  // ── Scenario engine (mirrors old logic but writes to Supabase) ────────────

  function saveScenarioState(active, step) {
    writeLS('poci_scenario_state', { scenarioActive: active, currentStep: step })
  }

  function terminateScenario() {
    setScenarioActive(false)
    setCurrentStep(0)
    saveScenarioState(false, 0)
  }

  function executeStep(step, callbacks = {}) {
    const { startUnitMovement, selectIncident } = callbacks

    function resolveIncidentId(id) {
      if (!id) return id
      return snapshotsRef.current[id]?.incidentId ?? id
    }

    switch (step.type) {
      case 'create_incident': {
        const id = `INC-DEMO-${Date.now()}`
        const incident = { ...step.params, id }
        snapshotsRef.current[step.id] = { incidentId: id }
        setCustomIncidents(prev => [...prev, incident])
        if (selectIncident) selectIncident(id)
        appendLog({ type: 'incident_created', incidentId: id, incidentName: incident.name })
        break
      }
      case 'assign_unit': {
        const resolvedIncId = resolveIncidentId(step.params.incidentId)
        const unit = unitsRef.current.find(u => u.id === step.params.unitId)
        snapshotsRef.current[step.id] = { priorIncident: unitAssignments[step.params.unitId] }
        assignUnit(step.params.unitId, resolvedIncId)
        if (startUnitMovement && unit) {
          // useUnitAnimation.startUnitMovement(unit, incident, fromPos?) — pass full objects
          const inc = incidentsRef.current.find(i => i.id === resolvedIncId)
          if (inc) startUnitMovement(unit, inc)
        }
        break
      }
      case 'set_unit_status': {
        const { unitId, status } = step.params
        snapshotsRef.current[step.id] = { priorStatus: unitStatuses[unitId] }
        setUnitStatus(unitId, status)
        break
      }
      case 'set_incident_status': {
        const resolvedIncId = resolveIncidentId(step.params.incidentId)
        snapshotsRef.current[step.id] = {
          priorStatus: incidentsRef.current.find(i => i.id === resolvedIncId)?.status,
          resolvedIncId,
        }
        supabase.from('incidents').update({ status: step.params.status }).eq('id', resolvedIncId)
        appendLog({ type: 'incident_status_changed', incidentId: resolvedIncId, to: step.params.status })
        break
      }
      case 'radio_message': {
        appendLog({ type: 'radio_message', from: step.params.from, message: step.params.message, incidentId: resolveIncidentId(step.params.incidentId) })
        break
      }
      case 'narrative':
      default:
        break
    }

    setCurrentStep(prev => {
      saveScenarioState(true, prev + 1)
      return prev + 1
    })
    if (!scenarioActive) setScenarioActive(true)
  }

  function revertStep(step) {
    const snap = snapshotsRef.current[step.id]
    if (!snap) return

    switch (step.type) {
      case 'assign_unit':
        if (snap.priorIncident) assignUnit(step.params.unitId, snap.priorIncident)
        else unassignUnit(step.params.unitId)
        break
      case 'set_unit_status':
        if (snap.priorStatus) setUnitStatus(step.params.unitId, snap.priorStatus)
        break
      case 'set_incident_status': {
        const resolvedIncId = snapshotsRef.current[step.id]?.resolvedIncId ?? step.params.incidentId
        if (snap.priorStatus) supabase.from('incidents').update({ status: snap.priorStatus }).eq('id', resolvedIncId)
        break
      }
      default:
        break
    }

    setCurrentStep(prev => {
      const next = Math.max(0, prev - 1)
      saveScenarioState(scenarioActive, next)
      return next
    })
  }

  // ── Missing exports ───────────────────────────────────────────────────────

  const clearLog = useCallback(() => {
    // no-op: op_log is persistent in Supabase; clearing not supported
  }, [])

  function startScenario() {
    setScenarioActive(true)
    saveScenarioState(true, currentStep)
  }

  const addCustomUnit = useCallback(async (unit) => {
    await supabase.from('units').insert({
      id: unit.id,
      name: unit.name,
      type: unit.type,
      air_kind: unit.airKind ?? null,
      base_lat: unit.lat ?? null,
      base_lng: unit.lng ?? null,
      station_id: unit.stationId ?? null,
    })
    await supabase.from('unit_states').insert({
      unit_id: unit.id,
      incident_id: null,
      status: 'available',
      lat: unit.lat ?? null,
      lng: unit.lng ?? null,
    })
  }, [supabase])

  // ── Normalise op_log rows to match legacy shape ───────────────────────────
  // Legacy code reads e.ts (timestamp ms), e.from, e.message, e.incidentId etc.
  // New rows have e.created_at (ISO) and e.payload (jsonb)
  const normalisedOpLog = useMemo(() =>
    opLog.map(e => ({
      ...e,
      ...e.payload,
      ts: e.ts ?? new Date(e.created_at).getTime(),
      incidentId: e.incidentId ?? e.incident_id ?? e.payload?.incidentId ?? null,
      unitId: e.unitId ?? e.unit_id ?? e.payload?.unitId ?? null,
    })),
    [opLog]
  )

  // ── Normalise closures to match legacy shape (incidentId camelCase) ────────
  const normalisedClosures = useMemo(() =>
    closures.map(c => ({ ...c, incidentId: c.incident_id })),
    [closures]
  )

  return {
    // Data
    allIncidents: incidents,
    customIncidents: [],          // compatibility — all incidents now in DB
    setCustomIncidents,
    allUnits,
    unitAssignments,
    unitStatuses,
    unitsByIncident,
    drawnZonesByIncident,
    setDrawnZonesByIncident,
    drawnClosures: normalisedClosures,
    setDrawnClosures,
    alerts,
    opLog: normalisedOpLog,
    fireStations,

    // Mutations
    assignUnit,
    unassignUnit,
    setUnitStatus,
    appendLog,
    addAlert,
    resolveAlert,
    deleteZone,
    deleteClosure,
    clearLog,
    addCustomUnit,

    // Scenario
    demoMode, setDemoMode,
    scenarioActive, currentStep,
    startScenario,
    terminateScenario,
    executeStep, revertStep,

    hydrated,
  }
}
