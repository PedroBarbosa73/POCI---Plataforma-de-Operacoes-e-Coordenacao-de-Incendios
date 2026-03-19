# Scenario Engine & Unit Movement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scripted scenario engine with road-following unit movement, a step-by-step demo player that floats over the Comando map, and a `/demo` script editor page.

**Architecture:** Four sequential layers — (1) `useUnitAnimation` hook handles OSRM routing and marker animation, (2) `usePociState` gains scenario state + event executors + radio live state, (3) `DemoPlayer` component floats over the Comando map, (4) `/demo` page lets operators author the script.

**Tech Stack:** Next.js 14 (app router), React hooks, Leaflet markers (imperative `setLatLng`), OSRM public routing API (`router.project-osrm.org`), localStorage persistence.

---

## Chunk 1: Unit Animation Hook + MapView Integration

**Files:**
- Create: `app/app/lib/useUnitAnimation.js`
- Modify: `app/app/components/MapView.js`

---

### Task 1: Create `useUnitAnimation.js`

**File:** `app/app/lib/useUnitAnimation.js`

- [ ] **Step 1: Create the file with haversine helpers + OSRM fetch**

```js
'use client'

import { useEffect, useRef, useState } from 'react'

// Haversine distance in km between two [lng, lat] points
function haversineKm(lng1, lat1, lng2, lat2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Linear interpolation between two [lng, lat] points
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

const TICK_MS = 500
const SPEED = { ground: 60, helicopter: 150, plane: 300 } // km/h

function getSpeedKmh(unit) {
  if (unit.type !== 'air') return SPEED.ground
  return unit.airKind === 'plane' ? SPEED.plane : SPEED.helicopter
}

async function fetchRoute(fromLng, fromLat, toLng, toLat) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error('non-200')
    const data = await res.json()
    if (!data.routes?.[0]?.geometry?.coordinates?.length) throw new Error('empty')
    return data.routes[0].geometry.coordinates // [[lng, lat], ...]
  } catch {
    // Fallback: straight line
    return [[fromLng, fromLat], [toLng, toLat]]
  }
}

export function useUnitAnimation() {
  const [animatedPositions, setAnimatedPositions] = useState({})
  // { [unitId]: { waypoints: [[lng,lat],...], waypointIndex, subProgress, speedKmh } }
  const unitRoutesRef = useRef({})
  // Map<`${unitId}:${incidentId}`, [[lng,lat],...]>
  const routeCacheRef = useRef(new Map())

  // Single interval ticks all active routes
  useEffect(() => {
    const id = setInterval(() => {
      const routes = unitRoutesRef.current
      if (Object.keys(routes).length === 0) return

      const updates = {}

      for (const [unitId, route] of Object.entries(routes)) {
        const { waypoints, waypointIndex, subProgress, speedKmh } = route

        // Already at last waypoint
        if (waypointIndex >= waypoints.length - 1) {
          const last = waypoints[waypoints.length - 1]
          updates[unitId] = [last[1], last[0]] // [lat, lng]
          continue
        }

        const from = waypoints[waypointIndex]
        const to = waypoints[waypointIndex + 1]
        const segKm = haversineKm(from[0], from[1], to[0], to[1])
        const advanceKm = (speedKmh / 3600) * (TICK_MS / 1000)
        const segFraction = segKm > 0 ? advanceKm / segKm : 1

        let newSub = subProgress + segFraction
        let newIdx = waypointIndex

        // Advance past full waypoint segments
        while (newSub >= 1 && newIdx < waypoints.length - 1) {
          newSub -= 1
          newIdx++
        }

        if (newIdx >= waypoints.length - 1) {
          const last = waypoints[waypoints.length - 1]
          updates[unitId] = [last[1], last[0]]
          unitRoutesRef.current[unitId] = { ...route, waypointIndex: waypoints.length - 1, subProgress: 0 }
        } else {
          const pos = lerp(waypoints[newIdx], waypoints[newIdx + 1], newSub)
          updates[unitId] = [pos[1], pos[0]] // [lat, lng]
          unitRoutesRef.current[unitId] = { ...route, waypointIndex: newIdx, subProgress: newSub }
        }
      }

      if (Object.keys(updates).length > 0) {
        setAnimatedPositions(prev => ({ ...prev, ...updates }))
      }
    }, TICK_MS)

    return () => clearInterval(id)
  }, [])

  async function startUnitMovement(unit, incident) {
    const cacheKey = `${unit.id}:${incident.id}`
    let waypoints = routeCacheRef.current.get(cacheKey)

    if (!waypoints) {
      if (unit.type === 'air') {
        // Air units fly straight
        waypoints = [[unit.lng, unit.lat], [incident.lng, incident.lat]]
      } else {
        waypoints = await fetchRoute(unit.lng, unit.lat, incident.lng, incident.lat)
      }
      routeCacheRef.current.set(cacheKey, waypoints)
    }

    unitRoutesRef.current[unit.id] = {
      waypoints,
      waypointIndex: 0,
      subProgress: 0,
      speedKmh: getSpeedKmh(unit),
    }
  }

  // restorePos: optional [lat, lng] to move the marker back to on stop
  function stopUnitMovement(unitId, restorePos = null) {
    delete unitRoutesRef.current[unitId]
    setAnimatedPositions(prev => {
      const next = { ...prev }
      if (restorePos) {
        next[unitId] = restorePos
      } else {
        delete next[unitId]
      }
      return next
    })
  }

  function clearAllMovement() {
    unitRoutesRef.current = {}
    routeCacheRef.current.clear()
    setAnimatedPositions({})
  }

  return { animatedPositions, startUnitMovement, stopUnitMovement, clearAllMovement }
}
```

- [ ] **Step 2: Verify the file saved correctly**

Run: `cat app/app/lib/useUnitAnimation.js | head -5`
Expected: `'use client'` on first line.

- [ ] **Step 3: Commit**

```bash
git add app/app/lib/useUnitAnimation.js
git commit -m "feat: add useUnitAnimation hook with OSRM routing and animation loop"
```

---

### Task 2: Add `animatedPositions` prop to `MapView.js`

**File:** `app/app/components/MapView.js`

- [ ] **Step 1: Add `animatedPositions` to the props destructuring**

In the `MapView` function signature, the props destructuring ends around line 24 (just before `ref`). Add `animatedPositions = {}` to the list:

```js
// Find this block (around line 8-24):
const MapView = forwardRef(function MapView(
  {
    selectedIncidentId,
    selectedUnitId,
    isPublic,
    // ... other props ...
    unitStatuses = {},
    allUnits,
    unitAssignments = {},
  },
  ref
)

// Change the last props to add animatedPositions:
    unitStatuses = {},
    allUnits,
    unitAssignments = {},
    animatedPositions = {},
  },
  ref
```

- [ ] **Step 2: Add the `useEffect` that calls `marker.setLatLng` on position changes**

Place this after the existing `useEffect` for `unitStatuses` (around line 141), before `useImperativeHandle`:

```js
// Reactive: move unit markers to animated positions
useEffect(() => {
  if (!mapReady) return
  Object.entries(animatedPositions).forEach(([unitId, [lat, lng]]) => {
    const marker = unitMarkersRef.current[unitId]
    if (!marker) return // graceful no-op for units not yet in ref
    marker.setLatLng([lat, lng])
  })
}, [animatedPositions, mapReady])
```

- [ ] **Step 3: Verify the app still loads — open http://localhost:3000/comando**

Expected: map loads, no console errors, unit markers visible.

- [ ] **Step 4: Commit**

```bash
git add app/app/components/MapView.js
git commit -m "feat: MapView accepts animatedPositions prop to move unit markers"
```

---

## Chunk 2: usePociState Additions

**Files:**
- Modify: `app/app/lib/usePociState.js`
- Modify: `app/app/components/panels/RadioPanel.js`

---

### Task 3: Migrate `radioMessages` to live state

**File:** `app/app/lib/usePociState.js`

- [ ] **Step 1: Add `radioMessages` seed in `seedIfAbsent()`**

Find the end of `seedIfAbsent()` (around line 162, after the opLog seed block). Add:

```js
  // Seed radio messages
  try {
    if (!localStorage.getItem('poci_radioMessages')) {
      localStorage.setItem('poci_radioMessages', JSON.stringify(mockRadioMessages))
    }
  } catch {}
```

- [ ] **Step 2: Add `radioMessages` state and mount read**

After the existing `const [alerts, setAlerts] = useState([])` line (around line 188), add:

```js
  const [radioMessages, setRadioMessages] = useState([])
```

In the mount `useEffect` (after `setAlerts(readLS(...))`, around line 202), add:

```js
    setRadioMessages(readLS('poci_radioMessages', mockRadioMessages))
```

- [ ] **Step 3: Add `radioMessages` re-read in BroadcastChannel handler**

In the `channel.onmessage` handler (around line 238), add:

```js
      setRadioMessages(readLS('poci_radioMessages', []))
```

- [ ] **Step 4: Add `addRadioMessage` function**

After the `addAlert` function (around line 284), add:

```js
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
```

- [ ] **Step 5: Add `radioMessages` and `addRadioMessage` to the return object**

In the `return { ... }` block at the bottom, add after `alerts, addAlert, resolveAlert,`:

```js
    radioMessages, addRadioMessage,
```

- [ ] **Step 6: Migrate `RadioPanel` to read from state**

**File:** `app/app/components/panels/RadioPanel.js`

Replace the entire file content:

```js
'use client';

import Panel from './Panel';
import { usePociState } from '../../lib/usePociState';

const typeBadge = { tactical: 'badge-available', logistics: 'badge-medium', weather: 'badge-controlled' };

export default function RadioPanel({ incidentId }) {
  const { radioMessages } = usePociState()
  const filtered = radioMessages.filter(
    (m) => m.incidentId === incidentId || m.incidentId === null
  );

  return (
    <Panel title="Linha de rádio" icon="R" badge="Ao vivo" badgeClass="green">
      {filtered.length === 0 ? (
        <div className="panel-empty">Sem mensagens para esta ocorrência.</div>
      ) : (
        [...filtered].reverse().map((m) => (
          <div key={m.id} className="card">
            <div className="card-header">
              <div className="card-name">{m.from}</div>
              <span className={`badge ${typeBadge[m.type] || 'badge-available'}`}>{m.id}</span>
            </div>
            <div className="card-meta">"{m.message || m.msg}"</div>
          </div>
        ))
      )}
    </Panel>
  );
}
```

Note: `m.message || m.msg` handles both old mock data (`msg` field) and new messages (`message` field).

- [ ] **Step 7: Verify RadioPanel still shows messages in the Comando page**

Open http://localhost:3000/comando → select an incident → open radio panel.
Expected: messages appear as before.

- [ ] **Step 8: Commit**

```bash
git add app/app/lib/usePociState.js app/app/components/panels/RadioPanel.js
git commit -m "feat: radioMessages live state in usePociState, RadioPanel reads from hook"
```

---

### Task 4: Add `incidentStatusOverrides` + fix `updateIncidentStatus`

**File:** `app/app/lib/usePociState.js`

- [ ] **Step 1: Add `incidentStatusOverrides` state**

After `const [alerts, setAlerts] = useState([])`, add:

```js
  const [incidentStatusOverrides, setIncidentStatusOverrides] = useState({})
```

- [ ] **Step 2: Replace `updateIncidentStatus` function**

Find the existing function (around line 360):

```js
  function updateIncidentStatus(incidentId, newStatus) {
    const inc = customIncidents.find(i => i.id === incidentId) || mockIncidents.find(i => i.id === incidentId)
    appendLog({ type: 'incident_status_changed', incidentId, incidentName: inc?.name || incidentId, from: inc?.status || '?', to: newStatus })
    setCustomIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, status: newStatus } : i))
    broadcast()
  }
```

Replace with:

```js
  function updateIncidentStatus(incidentId, newStatus) {
    const isCustom = customIncidents.some(i => i.id === incidentId)
    const inc = customIncidents.find(i => i.id === incidentId) ||
      mockIncidents.map(i => ({ ...i, status: incidentStatusOverrides[i.id] ?? i.status })).find(i => i.id === incidentId)
    appendLog({ type: 'incident_status_changed', incidentId, incidentName: inc?.name || incidentId, from: inc?.status || '?', to: newStatus })
    if (isCustom) {
      setCustomIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, status: newStatus } : i))
    } else {
      setIncidentStatusOverrides(prev => ({ ...prev, [incidentId]: newStatus }))
    }
    broadcast()
  }
```

- [ ] **Step 3: Update `allIncidents` computation to include status overrides**

Find the existing line (around line 400):

```js
    allIncidents: useMemo(() => [...mockIncidents, ...customIncidents], [customIncidents]),
```

Replace with:

```js
    allIncidents: useMemo(
      () => [
        ...mockIncidents.map(i => ({ ...i, status: incidentStatusOverrides[i.id] ?? i.status })),
        ...customIncidents,
      ],
      [customIncidents, incidentStatusOverrides]
    ),
```

- [ ] **Step 4: Verify incident status changes still work**

Open http://localhost:3000/comando → select an incident → open detail panel → change status.
Expected: status updates on the map.

- [ ] **Step 5: Commit**

```bash
git add app/app/lib/usePociState.js
git commit -m "feat: incidentStatusOverrides for mock incidents in usePociState"
```

---

### Task 5: Add scenario state + `executeStep` + `revertStep`

**File:** `app/app/lib/usePociState.js`

- [ ] **Step 1: Add scenario state variables**

After `const [incidentStatusOverrides, setIncidentStatusOverrides] = useState({})`, add:

```js
  const [scenarioActive, setScenarioActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
```

- [ ] **Step 2: Read scenario state from localStorage on mount**

In the mount `useEffect`, after the existing reads, add:

```js
    const ss = readLS('poci_scenario_state', {})
    if (ss.scenarioActive) setScenarioActive(true)
    if (ss.currentStep) setCurrentStep(ss.currentStep)
```

- [ ] **Step 3: Add `saveScenarioState` helper and `terminateScenario` function**

After the `clearLog` function (around line 273), add:

```js
  function saveScenarioState(active, step) {
    try { localStorage.setItem('poci_scenario_state', JSON.stringify({ scenarioActive: active, currentStep: step })) } catch {}
  }

  function startScenario() {
    setScenarioActive(true)
    setCurrentStep(0)
    saveScenarioState(true, 0)
  }

  function terminateScenario() {
    setScenarioActive(false)
    setCurrentStep(0)
    saveScenarioState(false, 0)
  }
```

- [ ] **Step 4: Add a ref to track `customIncidents` inside closures**

After the existing refs near the top of the hook (after `mountedRef`), add:

```js
  const customIncidentsRef = useRef([])
```

And add a sync effect (after the `customIncidents` persist effect around line 232):

```js
  useEffect(() => { customIncidentsRef.current = customIncidents }, [customIncidents])
```

- [ ] **Step 5: Add `executeStep` function**

After `terminateScenario`, add:

```js
  function executeStep(step, callbacks = {}) {
    const { startUnitMovement } = callbacks

    switch (step.type) {
      case 'create_incident': {
        const id = `INC-DEMO-${Date.now()}`
        const incident = { ...step.params, id }
        step._snapshot = { incidentId: id }
        setCustomIncidents(prev => {
          const next = [...prev, incident]
          try { localStorage.setItem('poci_customIncidents', JSON.stringify(next)) } catch {}
          return next
        })
        appendLog({ type: 'incident_created', incidentId: id, incidentName: incident.name, area: incident.name, status: incident.status })
        broadcast()
        break
      }
      case 'assign_unit': {
        const allNow = [...mockUnits, ...customUnits]
        const unit = allNow.find(u => u.id === step.params.unitId)
        step._snapshot = { priorPos: unit ? [unit.lat, unit.lng] : null }
        assignUnit(step.params.unitId, step.params.incidentId) // logs internally
        if (startUnitMovement && unit) {
          const allIncs = [
            ...mockIncidents.map(i => ({ ...i, status: incidentStatusOverrides[i.id] ?? i.status })),
            ...customIncidentsRef.current,
          ]
          const incident = allIncs.find(i => i.id === step.params.incidentId)
          if (incident) startUnitMovement(unit, incident)
        }
        break
      }
      case 'update_incident_status': {
        const allIncs = [
          ...mockIncidents.map(i => ({ ...i, status: incidentStatusOverrides[i.id] ?? i.status })),
          ...customIncidentsRef.current,
        ]
        const inc = allIncs.find(i => i.id === step.params.incidentId)
        step._snapshot = { priorStatus: inc?.status }
        updateIncidentStatus(step.params.incidentId, step.params.status) // logs internally
        break
      }
      case 'close_road': {
        setDrawnClosures(prev => {
          const next = [...prev, step.params]
          try { localStorage.setItem('poci_drawnClosures', JSON.stringify(next)) } catch {}
          return next
        })
        appendLog({ type: 'closure_drawn', incidentId: step.params.incident, closureName: step.params.name })
        broadcast()
        break
      }
      case 'create_alert': {
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2)
        step._snapshot = { alertId: id }
        addAlert({ id, ...step.params, status: 'active' })
        appendLog({ type: 'alert_triggered', alertId: id, alertTitle: step.params.title, alertLevel: step.params.level, target: `Raio ${step.params.radius || 0} km`, incidentId: step.params.incidentId })
        break
      }
      case 'send_radio': {
        addRadioMessage(step.params) // logs internally
        break
      }
      case 'narrative':
      default:
        break
    }

    setCurrentStep(prev => {
      const next = prev + 1
      saveScenarioState(true, next)
      return next
    })
  }
```

- [ ] **Step 6: Add `revertStep` function**

After `executeStep`, add:

```js
  function revertStep(step, callbacks = {}) {
    const { stopUnitMovement } = callbacks

    switch (step.type) {
      case 'create_incident': {
        const incidentId = step._snapshot?.incidentId
        if (incidentId) {
          setCustomIncidents(prev => {
            const next = prev.filter(i => i.id !== incidentId)
            try { localStorage.setItem('poci_customIncidents', JSON.stringify(next)) } catch {}
            return next
          })
          broadcast()
        }
        break
      }
      case 'assign_unit': {
        const priorPos = step._snapshot?.priorPos
        unassignUnit(step.params.unitId)
        if (stopUnitMovement) stopUnitMovement(step.params.unitId, priorPos)
        break
      }
      case 'update_incident_status': {
        if (step._snapshot?.priorStatus != null) {
          updateIncidentStatus(step.params.incidentId, step._snapshot.priorStatus) // logs intentionally
        }
        break
      }
      case 'create_alert': {
        if (step._snapshot?.alertId) resolveAlert(step._snapshot.alertId)
        break
      }
      case 'close_road':
      case 'send_radio':
      case 'narrative':
      default:
        break
    }

    setCurrentStep(prev => {
      const next = Math.max(0, prev - 1)
      saveScenarioState(true, next)
      return next
    })
  }
```

- [ ] **Step 7: Add all new exports to the return object**

In the `return { ... }` block, add:

```js
    // Scenario engine
    scenarioActive, currentStep,
    startScenario, terminateScenario,
    executeStep, revertStep,
```

- [ ] **Step 8: Commit**

```bash
git add app/app/lib/usePociState.js
git commit -m "feat: scenario state, executeStep, revertStep in usePociState"
```

---

## Chunk 3: DemoPlayer + PociApp Wiring

**Files:**
- Create: `app/app/components/DemoPlayer.js`
- Modify: `app/app/components/PociApp.js`
- Modify: `app/app/globals.css`

---

### Task 6: Create `DemoPlayer.js`

**File:** `app/app/components/DemoPlayer.js`

- [ ] **Step 1: Create the component**

```js
'use client';

export default function DemoPlayer({ steps, currentStep, onNext, onPrev, onTerminate }) {
  const executedStep = steps[currentStep - 1]
  const isDone = currentStep >= steps.length
  const isFirst = currentStep === 0

  return (
    <div className="demo-player">
      <span className="demo-player-badge">🎬 DEMO</span>
      <div className="demo-player-divider" />
      <span className="demo-player-counter">{currentStep} / {steps.length}</span>
      <div className="demo-player-divider" />
      <span className="demo-player-label">
        {currentStep === 0 ? 'Pronto para iniciar' : (executedStep?.label || '—')}
      </span>
      <div className="demo-player-controls">
        <button
          className="demo-player-btn"
          disabled={isFirst}
          onClick={onPrev}
        >
          ← Anterior
        </button>
        {isDone ? (
          <span className="demo-player-done">Concluído ✓</span>
        ) : (
          <button className="demo-player-btn demo-player-btn-primary" onClick={onNext}>
            Próximo →
          </button>
        )}
        <button className="demo-player-btn demo-player-btn-danger" onClick={onTerminate}>
          ✕ Terminar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for the demo player in `globals.css`**

Append at the end of `app/app/globals.css`:

```css
/* ── Demo Player ─────────────────────────────────────────────────────────── */
.demo-player {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(10, 14, 26, 0.97);
  border: 1px solid rgba(255, 120, 40, 0.4);
  border-radius: 12px;
  padding: 10px 18px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  white-space: nowrap;
}
.demo-player-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent-orange);
  text-transform: uppercase;
}
.demo-player-divider {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.12);
}
.demo-player-counter {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: center;
}
.demo-player-label {
  font-size: 13px;
  color: var(--text-primary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.demo-player-controls {
  display: flex;
  gap: 6px;
}
.demo-player-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.06);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.demo-player-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.12);
}
.demo-player-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.demo-player-btn-primary {
  background: rgba(255, 120, 40, 0.2);
  border-color: rgba(255, 120, 40, 0.5);
  color: var(--accent-orange);
}
.demo-player-btn-primary:hover {
  background: rgba(255, 120, 40, 0.35) !important;
}
.demo-player-btn-danger {
  background: rgba(255, 59, 59, 0.1);
  border-color: rgba(255, 59, 59, 0.3);
  color: var(--accent-red);
}
.demo-player-btn-danger:hover {
  background: rgba(255, 59, 59, 0.2) !important;
}
.demo-player-done {
  font-size: 12px;
  color: var(--accent-green);
  font-weight: 600;
  padding: 5px 12px;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/app/components/DemoPlayer.js app/app/globals.css
git commit -m "feat: DemoPlayer floating panel component with step counter and controls"
```

---

### Task 7: Wire `PociApp.js`

**File:** `app/app/components/PociApp.js`

- [ ] **Step 1: Import new hooks and components**

At the top of `PociApp.js`, add:

```js
import { useUnitAnimation } from '../lib/useUnitAnimation';
import DemoPlayer from './DemoPlayer';
```

- [ ] **Step 2: Destructure new state from `usePociState`**

In the `usePociState()` destructuring, add:

```js
    scenarioActive, currentStep,
    terminateScenario,
    executeStep, revertStep,
```

- [ ] **Step 3: Instantiate `useUnitAnimation`**

After the `usePociState()` call, add:

```js
  const { animatedPositions, startUnitMovement, stopUnitMovement } = useUnitAnimation()
```

- [ ] **Step 4: Load scenario steps**

Add this state near the other useState calls:

```js
  const [scenarioSteps, setScenarioSteps] = useState([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('poci_scenario')
      if (raw) setScenarioSteps(JSON.parse(raw))
    } catch {}
  }, [])
```

- [ ] **Step 5: Add `handleNext` and `handlePrev` handlers**

```js
  function handleDemoNext() {
    const step = scenarioSteps[currentStep]
    if (!step) return
    executeStep(step, { startUnitMovement })
  }

  function handleDemoPrev() {
    if (currentStep === 0) return
    const step = scenarioSteps[currentStep - 1]
    revertStep(step, { stopUnitMovement })
  }
```

- [ ] **Step 6: Pass `animatedPositions` to `MapView`**

Find the `<MapView` JSX and add the prop:

```jsx
<MapView
  ...existing props...
  animatedPositions={animatedPositions}
/>
```

- [ ] **Step 7: Render `DemoPlayer` conditionally**

Find the JSX return. Just before the closing `</div>` of the main wrapper, add:

```jsx
{scenarioActive && (
  <DemoPlayer
    steps={scenarioSteps}
    currentStep={currentStep}
    onNext={handleDemoNext}
    onPrev={handleDemoPrev}
    onTerminate={terminateScenario}
  />
)}
```

- [ ] **Step 8: Verify demo player mounts**

1. Open browser console on http://localhost:3000/comando
2. Run: `localStorage.setItem('poci_scenario_state', JSON.stringify({ scenarioActive: true, currentStep: 0 })); location.reload()`
3. Expected: floating player bar appears at bottom center
4. Run: `localStorage.removeItem('poci_scenario_state'); location.reload()` to clean up

- [ ] **Step 9: Commit**

```bash
git add app/app/components/PociApp.js
git commit -m "feat: wire DemoPlayer and useUnitAnimation into PociApp"
```

---

## Chunk 4: Script Editor (`/demo` page)

**Files:**
- Create: `app/app/demo/page.js`
- Create: `app/app/components/ScriptEditor.js`
- Create: `app/app/components/EventForm.js`
- Modify: `app/app/globals.css`

---

### Task 8: Create `EventForm.js`

**File:** `app/app/components/EventForm.js`

This renders different form fields depending on `step.type`. All dropdowns use the same `CustomSelect` pattern from alertas/page.js.

- [ ] **Step 1: Create the file**

```js
'use client';

import { useRef, useState } from 'react';

// Reusable dark custom select (same pattern as alertas/page.js)
function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <div className="rel-custom-select" style={{ position: 'relative' }}>
      <button type="button" className="rel-select-btn"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}>
        <span>{selected?.label || placeholder || '—'}</span>
        <span className="rel-select-arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="rel-select-dropdown">
          {options.map(o => (
            <button type="button" key={String(o.value)} className={`rel-select-option ${o.value === value ? 'active' : ''}`}
              onMouseDown={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: 'narrative',              label: 'Narrativa (só texto)' },
  { value: 'create_incident',        label: 'Criar ocorrência' },
  { value: 'assign_unit',            label: 'Atribuir meio' },
  { value: 'update_incident_status', label: 'Atualizar estado de ocorrência' },
  { value: 'close_road',             label: 'Corte de estrada' },
  { value: 'create_alert',           label: 'Criar alerta' },
  { value: 'send_radio',             label: 'Enviar mensagem de rádio' },
];

const STATUS_OPTIONS = [
  { value: 'active',       label: 'Ativo' },
  { value: 'controlled',   label: 'Controlado' },
  { value: 'surveillance', label: 'Vigilância' },
  { value: 'resolved',     label: 'Resolvido' },
];

const LEVEL_OPTIONS = [
  { value: 'critical', label: 'Crítico' },
  { value: 'high',     label: 'Alto' },
  { value: 'medium',   label: 'Médio' },
  { value: 'low',      label: 'Baixo' },
];

const PRIORITY_OPTIONS = [
  { value: 'normal',   label: 'Normal' },
  { value: 'urgente',  label: 'Urgente' },
  { value: 'critico',  label: 'Crítico' },
];

export default function EventForm({ step, allUnits, allIncidents, onChange, onSave }) {
  function setParam(key, value) {
    onChange({ ...step, params: { ...step.params, [key]: value } });
  }

  function setField(key, value) {
    onChange({ ...step, [key]: value });
  }

  const unitOptions = allUnits.map(u => ({ value: u.id, label: `${u.name} (${u.id})` }));
  const incidentOptions = allIncidents.map(i => ({ value: i.id, label: `${i.name} (${i.id})` }));

  return (
    <div className="event-form">
      <div className="event-form-field">
        <label className="event-form-label">Tipo</label>
        <CustomSelect
          value={step.type}
          onChange={v => onChange({ ...step, type: v, params: {} })}
          options={TYPE_OPTIONS}
          placeholder="Selecionar tipo"
        />
      </div>

      <div className="event-form-field">
        <label className="event-form-label">Descrição (mostrada no player)</label>
        <input
          className="event-form-input"
          value={step.label || ''}
          onChange={e => setField('label', e.target.value)}
          placeholder="Ex: Incêndio declarado em Serra da Estrela"
        />
      </div>

      {/* Type-specific param fields */}
      {step.type === 'narrative' && (
        <div className="event-form-field">
          <label className="event-form-label">Texto de narrativa</label>
          <textarea className="event-form-input" rows={3}
            value={step.params?.text || ''}
            onChange={e => setParam('text', e.target.value)}
            placeholder="Nota de contexto para o apresentador" />
        </div>
      )}

      {step.type === 'create_incident' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Nome</label>
          <input className="event-form-input" value={step.params?.name || ''}
            onChange={e => setParam('name', e.target.value)} placeholder="Ex: Serra da Estrela" />
        </div>
        <div className="event-form-row">
          <div className="event-form-field">
            <label className="event-form-label">Latitude</label>
            <input className="event-form-input" type="number" step="0.001"
              value={step.params?.lat || ''} onChange={e => setParam('lat', parseFloat(e.target.value))} />
          </div>
          <div className="event-form-field">
            <label className="event-form-label">Longitude</label>
            <input className="event-form-input" type="number" step="0.001"
              value={step.params?.lng || ''} onChange={e => setParam('lng', parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Estado inicial</label>
          <CustomSelect value={step.params?.status} onChange={v => setParam('status', v)}
            options={STATUS_OPTIONS} placeholder="Selecionar estado" />
        </div>
      </>)}

      {step.type === 'assign_unit' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Meio</label>
          <CustomSelect value={step.params?.unitId} onChange={v => setParam('unitId', v)}
            options={unitOptions} placeholder="Selecionar meio" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência de destino</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
      </>)}

      {step.type === 'update_incident_status' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Novo estado</label>
          <CustomSelect value={step.params?.status} onChange={v => setParam('status', v)}
            options={STATUS_OPTIONS} placeholder="Selecionar estado" />
        </div>
      </>)}

      {step.type === 'close_road' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Nome do corte</label>
          <input className="event-form-input" value={step.params?.name || ''}
            onChange={e => setParam('name', e.target.value)} placeholder="Ex: EN267 sentido norte" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incident} onChange={v => setParam('incident', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Coordenadas (lat,lng por linha)</label>
          <textarea className="event-form-input" rows={4}
            value={(step.params?.path || []).map(p => p.join(',')).join('\n')}
            onChange={e => {
              const path = e.target.value.split('\n')
                .map(l => l.split(',').map(Number))
                .filter(p => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]))
              setParam('path', path)
            }}
            placeholder="40.321,-7.612&#10;40.325,-7.615" />
        </div>
      </>)}

      {step.type === 'create_alert' && (<>
        <div className="event-form-field">
          <label className="event-form-label">Título</label>
          <input className="event-form-input" value={step.params?.title || ''}
            onChange={e => setParam('title', e.target.value)} />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Mensagem</label>
          <textarea className="event-form-input" rows={2} value={step.params?.message || ''}
            onChange={e => setParam('message', e.target.value)} />
        </div>
        <div className="event-form-row">
          <div className="event-form-field">
            <label className="event-form-label">Nível</label>
            <CustomSelect value={step.params?.level} onChange={v => setParam('level', v)}
              options={LEVEL_OPTIONS} placeholder="Nível" />
          </div>
          <div className="event-form-field">
            <label className="event-form-label">Raio (km)</label>
            <input className="event-form-input" type="number" min="0"
              value={step.params?.radius || ''} onChange={e => setParam('radius', parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
      </>)}

      {step.type === 'send_radio' && (<>
        <div className="event-form-row">
          <div className="event-form-field">
            <label className="event-form-label">De (from)</label>
            <input className="event-form-input" value={step.params?.from || ''}
              onChange={e => setParam('from', e.target.value)} placeholder="Ex: COS Serra da Estrela" />
          </div>
          <div className="event-form-field">
            <label className="event-form-label">Para (to)</label>
            <input className="event-form-input" value={step.params?.to || ''}
              onChange={e => setParam('to', e.target.value)} placeholder="Ex: Todos" />
          </div>
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Prioridade</label>
          <CustomSelect value={step.params?.priority} onChange={v => setParam('priority', v)}
            options={PRIORITY_OPTIONS} placeholder="Normal" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Ocorrência</label>
          <CustomSelect value={step.params?.incidentId} onChange={v => setParam('incidentId', v)}
            options={incidentOptions} placeholder="Selecionar ocorrência" />
        </div>
        <div className="event-form-field">
          <label className="event-form-label">Mensagem</label>
          <textarea className="event-form-input" rows={3} value={step.params?.message || ''}
            onChange={e => setParam('message', e.target.value)}
            placeholder="Ex: Solicito reforço no setor Alfa." />
        </div>
      </>)}

      <button className="event-form-save" onClick={onSave}>Guardar</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/app/components/EventForm.js
git commit -m "feat: EventForm component with dynamic fields per event type"
```

---

### Task 9: Create `ScriptEditor.js`

**File:** `app/app/components/ScriptEditor.js`

- [ ] **Step 1: Create the file**

```js
'use client';

const TYPE_LABELS = {
  narrative:              '💬 Narrativa',
  create_incident:        '🔥 Criar ocorrência',
  assign_unit:            '→ Atribuir meio',
  update_incident_status: '↺ Estado de ocorrência',
  close_road:             '✕ Corte de estrada',
  create_alert:           '⚠ Criar alerta',
  send_radio:             '📡 Rádio',
};

export default function ScriptEditor({ steps, selectedIndex, onSelect, onAdd, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div className="script-editor">
      <div className="script-editor-header">
        <span className="script-editor-title">Script do Demo</span>
        <button className="script-editor-add" onClick={onAdd}>+ Adicionar Evento</button>
      </div>

      {steps.length === 0 && (
        <div className="script-editor-empty">Nenhum evento. Adiciona o primeiro.</div>
      )}

      <div className="script-editor-list">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`script-step ${selectedIndex === i ? 'active' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className="script-step-index">{i + 1}</span>
            <div className="script-step-info">
              <span className="script-step-type">{TYPE_LABELS[step.type] || step.type}</span>
              <span className="script-step-label">{step.label || '(sem descrição)'}</span>
            </div>
            <div className="script-step-actions" onClick={e => e.stopPropagation()}>
              <button title="Mover acima" disabled={i === 0} onClick={() => onMoveUp(i)}>↑</button>
              <button title="Mover abaixo" disabled={i === steps.length - 1} onClick={() => onMoveDown(i)}>↓</button>
              <button title="Eliminar" onClick={() => onDelete(i)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/app/components/ScriptEditor.js
git commit -m "feat: ScriptEditor component for step list management"
```

---

### Task 10: Create `/demo` page

**File:** `app/app/demo/page.js`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p app/app/demo
```

- [ ] **Step 2: Create `app/app/demo/page.js`**

```js
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect, useRouter } from 'next/navigation';
import { usePociState } from '../lib/usePociState';
import ScriptEditor from '../components/ScriptEditor';
import EventForm from '../components/EventForm';

function makeStep(type = 'narrative') {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: '',
    params: {},
  };
}

export default function DemoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { allUnits, allIncidents, startScenario } = usePociState();

  const [steps, setSteps] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [draftStep, setDraftStep] = useState(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('poci_scenario');
      if (raw) setSteps(JSON.parse(raw));
    } catch {}
  }, []);

  // Auto-save on every change
  useEffect(() => {
    try { localStorage.setItem('poci_scenario', JSON.stringify(steps)); } catch {}
  }, [steps]);

  if (status === 'loading') return null;
  if (status === 'unauthenticated') redirect('/login');

  function handleAdd() {
    const step = makeStep('narrative');
    const newSteps = [...steps, step];
    setSteps(newSteps);
    setSelectedIndex(newSteps.length - 1);
    setDraftStep({ ...step });
  }

  function handleSelect(i) {
    setSelectedIndex(i);
    setDraftStep({ ...steps[i] });
  }

  function handleSave() {
    if (selectedIndex === null || !draftStep) return;
    const updated = [...steps];
    updated[selectedIndex] = draftStep;
    setSteps(updated);
  }

  function handleDelete(i) {
    const updated = steps.filter((_, idx) => idx !== i);
    setSteps(updated);
    if (selectedIndex === i) { setSelectedIndex(null); setDraftStep(null); }
    else if (selectedIndex > i) setSelectedIndex(selectedIndex - 1);
  }

  function handleMoveUp(i) {
    if (i === 0) return;
    const updated = [...steps];
    [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
    setSteps(updated);
    if (selectedIndex === i) setSelectedIndex(i - 1);
    else if (selectedIndex === i - 1) setSelectedIndex(i);
  }

  function handleMoveDown(i) {
    if (i === steps.length - 1) return;
    const updated = [...steps];
    [updated[i], updated[i + 1]] = [updated[i + 1], updated[i]];
    setSteps(updated);
    if (selectedIndex === i) setSelectedIndex(i + 1);
    else if (selectedIndex === i + 1) setSelectedIndex(i);
  }

  function handleStartDemo() {
    startScenario();
    router.push('/comando');
  }

  return (
    <div className="demo-page">
      <div className="demo-page-left">
        <ScriptEditor
          steps={steps}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />
        <button
          className="demo-start-btn"
          disabled={steps.length === 0}
          onClick={handleStartDemo}
        >
          Iniciar Demo →
        </button>
      </div>

      <div className="demo-page-right">
        {draftStep ? (
          <EventForm
            step={draftStep}
            allUnits={allUnits}
            allIncidents={allIncidents}
            onChange={setDraftStep}
            onSave={handleSave}
          />
        ) : (
          <div className="demo-page-empty">
            Seleciona um evento para editar, ou adiciona um novo.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `/demo` CSS to `globals.css`**

Append to `app/app/globals.css`:

```css
/* ── Demo Page ───────────────────────────────────────────────────────────── */
.demo-page {
  display: flex;
  height: 100vh;
  padding-top: 56px;
  background: var(--bg-primary);
  overflow: hidden;
}
.demo-page-left {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.demo-page-right {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.demo-page-empty {
  color: var(--text-muted);
  font-size: 14px;
  margin-top: 40px;
  text-align: center;
}
.demo-start-btn {
  margin: 12px 16px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 120, 40, 0.4);
  background: rgba(255, 120, 40, 0.15);
  color: var(--accent-orange);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.demo-start-btn:hover:not(:disabled) { background: rgba(255, 120, 40, 0.3); }
.demo-start-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ScriptEditor */
.script-editor { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.script-editor-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px; border-bottom: 1px solid var(--border);
}
.script-editor-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.script-editor-add {
  font-size: 12px; padding: 4px 10px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--accent-green); cursor: pointer;
}
.script-editor-add:hover { background: var(--bg-card-hover); }
.script-editor-empty { color: var(--text-muted); font-size: 13px; padding: 24px 16px; text-align: center; }
.script-editor-list { flex: 1; overflow-y: auto; }
.script-step {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border);
  transition: background 0.12s;
}
.script-step:hover { background: var(--bg-card); }
.script-step.active { background: rgba(255, 120, 40, 0.08); border-left: 2px solid var(--accent-orange); }
.script-step-index { font-size: 11px; color: var(--text-muted); min-width: 20px; text-align: right; }
.script-step-info { flex: 1; overflow: hidden; }
.script-step-type { font-size: 11px; color: var(--text-secondary); display: block; }
.script-step-label { font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.script-step-actions { display: flex; gap: 2px; }
.script-step-actions button {
  padding: 2px 5px; font-size: 11px; border-radius: 4px;
  border: 1px solid transparent; background: transparent;
  color: var(--text-muted); cursor: pointer;
}
.script-step-actions button:hover:not(:disabled) { background: var(--bg-card-hover); color: var(--text-primary); }
.script-step-actions button:disabled { opacity: 0.3; cursor: not-allowed; }

/* EventForm */
.event-form { display: flex; flex-direction: column; gap: 16px; max-width: 480px; }
.event-form-field { display: flex; flex-direction: column; gap: 6px; }
.event-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.event-form-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
.event-form-input {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 8px 10px; color: var(--text-primary);
  font-size: 13px; font-family: inherit; width: 100%; box-sizing: border-box;
}
.event-form-input:focus { outline: none; border-color: rgba(255,120,40,0.4); }
.event-form-save {
  margin-top: 4px; padding: 9px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--accent-green); font-size: 13px; font-weight: 600;
  cursor: pointer; align-self: flex-start; padding: 8px 20px;
}
.event-form-save:hover { background: var(--bg-card-hover); }
```

- [ ] **Step 4: Add `/demo` to the NavBar**

Open `app/app/components/NavBar.js` and add a link to `/demo` in the command nav links (alongside `/relatorio`, `/meios`, etc.):

```jsx
<Link href="/demo" className={pathname === '/demo' ? 'active' : ''}>Demo</Link>
```

- [ ] **Step 5: Verify the demo page loads**

Open http://localhost:3000/demo
Expected: two-panel layout — step list on left, empty state on right.

- [ ] **Step 6: End-to-end test**

1. Add a `narrative` step with label "Bem-vindos à demo"
2. Add a `create_incident` step: name "Incêndio Teste", lat=40.321, lng=-7.612, status=active, label "Incêndio declarado"
3. Add an `assign_unit` step: pick any unit, pick the just-added incident, label "Primeiro meio atribuído"
4. Click "Iniciar Demo →" — you should land on `/comando` with the player bar visible (Passo 0/3)
5. Click "Próximo →" — narrative executes (counter becomes 1/3, label shows "Bem-vindos à demo")
6. Click "Próximo →" — incident appears on map, counter 2/3
7. Click "Próximo →" — unit starts moving on map toward incident
8. Click "← Anterior" — unit stops and returns to prior position, counter back to 2/3
9. Click "✕ Terminar" — player disappears

- [ ] **Step 7: Commit**

```bash
git add app/app/demo/page.js app/app/components/ScriptEditor.js app/app/components/EventForm.js app/app/globals.css app/app/components/NavBar.js
git commit -m "feat: /demo script editor page with ScriptEditor and EventForm components"
```

---

## Final verification

- [ ] Run the app: `cd app && npm run dev`
- [ ] Verify no console errors on `/comando`, `/demo`, `/radio`, `/alertas`, `/relatorio`
- [ ] Verify RadioPanel still shows messages (uses live state now)
- [ ] Verify incident status changes work for both mock and custom incidents
- [ ] Run a full demo scenario from `/demo` through to completion
- [ ] Commit if any final CSS tweaks needed
