# Scenario Engine & Unit Movement — Design Spec
**Date:** 2026-03-19
**Project:** POCI Wildfire Coordination Platform

---

## Overview

A scripted scenario engine that simulates a real wildfire incident from ignition to resolution, showcasing all platform features. Consists of four parts:

1. **Event data model** — typed steps that map to existing platform actions
2. **Script editor** (`/demo`) — UI to author and reorder the scenario
3. **Floating player** — step-by-step controller overlaid on the Comando map
4. **Unit movement** — road-following animation via OSRM for ground units, straight-line for air

---

## 1. Event Data Model

The scenario is an ordered array of step objects stored in `localStorage` as `poci_scenario`.

### Step schema

```js
{
  id: string,           // unique, e.g. 'step-001'
  label: string,        // human-readable description shown in the player
  type: EventType,
  params: object,       // type-specific (see below)
  _snapshot: object     // written at execution time for revert; never authored
}
```

### Event types

| Type | Authored params | Effect | Relatório type |
|---|---|---|---|
| `create_incident` | `{ lat, lng, name, status }` | Pushes to `customIncidents` state | `incident_created` |
| `assign_unit` | `{ unitId, incidentId }` | Calls `assignUnit()`; triggers road movement. Executor snapshots unit's current `lat/lng` from `allUnits` into `step._snapshot.priorPos` before calling. | `unit_assigned` |
| `update_incident_status` | `{ incidentId, status }` | Updates incident status. Executor snapshots prior status into `step._snapshot.priorStatus`. Works for both mock and custom incidents via `incidentStatusOverrides` map (see §5). | `incident_status_changed` |
| `close_road` | `{ path: [[lat,lng],...], name, status: 'active', incident }` | Pushes to `drawnClosures`. Params match the existing `drawnClosures` object shape exactly. No `_snapshot` needed (irreversible). Executor calls `appendLog({ type: 'closure_drawn', incidentId: params.incident, closureName: params.name })` directly. | `closure_drawn` |
| `create_alert` | `{ title, message, level, incidentId, radius }` | Executor generates an id via `crypto.randomUUID()` (fallback: `Date.now().toString(36) + Math.random().toString(36).slice(2)`), calls `addAlert({ id, ...params })`, stores `id` in `step._snapshot.alertId`. `addAlert` does not generate ids. | `alert_triggered` |
| `send_radio` | `{ from, to, toId, incidentId, priority, message }` | Calls `addRadioMessage()` (new). `addRadioMessage` calls `appendLog({ type: 'radio_message', from: msg.from, message: msg.message, incidentId: msg.incidentId })`. | `radio_message` |
| `narrative` | `{ text }` | Display-only label in player. No platform action, no `appendLog` call. | *(none)* |

**Verified Relatório types** match the existing renderer in `relatorio/page.js`:
`incident_status_changed`, `unit_assigned`, `radio_message`, `alert_triggered`, `incident_created`, `closure_drawn`.

**Double-logging note:** `assignUnit()` and `updateIncidentStatus()` already call `appendLog` internally. The `executeStep` executor must NOT call `appendLog` again for `assign_unit` or `update_incident_status` — it delegates entirely to the underlying function.

### Revert behaviour (← Anterior)

`opLog` is **append-only** — log entries are never removed on revert. Only live state reverts.

| Type | Reversible? | Revert action |
|---|---|---|
| `create_incident` | ✅ | Remove from `customIncidents` by id |
| `assign_unit` | ✅ | Call `unassignUnit(unitId)`; call `stopUnitMovement(unitId)` (which also clears unit from `animatedPositions` state); restore marker to `step._snapshot.priorPos` |
| `update_incident_status` | ✅ | Restore `step._snapshot.priorStatus` by calling `updateIncidentStatus()` again with the prior value. This will produce a second `incident_status_changed` log entry in Relatório (the rollback event) — this is **intentional and acceptable** since the log is append-only. Requires `updateIncidentStatus()` to be updated per §5 to handle mock incidents. |
| `create_alert` | ✅ | Call `resolveAlert(step._snapshot.alertId)` |
| `close_road` | ❌ | Counter moves back only; polygon stays |
| `send_radio` | ❌ | Counter moves back only; message stays |
| `narrative` | ✅ (no-op) | Counter moves back; nothing to undo |

### Radio messages: live state migration

`send_radio` requires a new `addRadioMessage()` action in `usePociState`. As part of this feature, `radioMessages` moves from static mock import to live state, seeded from `mockData.radioMessages` on first load (same pattern as `opLog`). `RadioPanel` switches to reading `usePociState().radioMessages`.

---

## 2. Script Editor (`/demo` page)

### Layout

```
┌─────────────────────────────────────────────────────┐
│  POCI  [NavBar]                                     │
├──────────────────────┬──────────────────────────────┤
│  Script: Demo POCI   │  + Adicionar Evento           │
│  ─────────────────   │  ┌─────────────────────────┐ │
│  1. Incêndio Serra.. │  │ Tipo: [create_incident▼] │ │
│  2. Atribuir BV-034  │  │ Label: _______________   │ │
│  3. Fechar Estrada   │  │ Params: (dynamic form)   │ │
│  4. Alerta meteo...  │  │                          │ │
│  [↑][↓][🗑] each row │  │        [Guardar]         │ │
│                      │  └─────────────────────────┘ │
│  [Iniciar Demo →]    │                               │
└──────────────────────┴──────────────────────────────┘
```

### Behaviour
- Left panel: ordered step list with ↑/↓ and delete per row.
- Clicking a step opens it in the right panel.
- Dynamic param forms per type:
  - `assign_unit` → unit picker + incident picker
  - `create_incident` → lat/lng inputs + name + status dropdown
  - `close_road` → lat/lng list + name field (incident picker optional)
  - `create_alert` → title, message, level, incident, radius
  - `send_radio` → from text, recipient picker, incident picker, priority, message
  - `update_incident_status` → incident picker + status dropdown
  - `narrative` → single text field
- Script auto-saves to `poci_scenario` on every change. Default when absent: `[]`.
- Session guard: redirect to `/login` if unauthenticated.
- **"Iniciar Demo →"** writes `{ scenarioActive: true, currentStep: 0 }` to `poci_scenario_state`, navigates to `/comando`.

### New files
- `app/app/demo/page.js`
- `app/app/components/ScriptEditor.js`
- `app/app/components/EventForm.js`

---

## 3. Floating Player Panel

Rendered in `PociApp.js`, visible only when `scenarioActive === true` on the Comando route. Positioned at bottom-center of the map with high z-index.

### State in `usePociState`

`poci_scenario_state` is read on mount:
```js
const saved = localStorage.getItem('poci_scenario_state')
const { scenarioActive = false, currentStep = 0 } = saved ? JSON.parse(saved) : {}
```

Exports: `scenarioActive`, `currentStep`, `executeStep(step, { startUnitMovement })`, `revertStep(step, { stopUnitMovement })`.

The `startUnitMovement` / `stopUnitMovement` callbacks are injected by `PociApp` at call time (where both `usePociState` and `useUnitAnimation` are instantiated), avoiding a cross-hook dependency.

`scenarioActive` is distinct from the existing `demoMode` toggle in `UnitsPanel`. They are independent.

### UI

```
┌────────────────────────────────────────────────────────────┐
│  🎬 DEMO  │  Passo 3 / 12  │  Fechar Estrada N2           │
│           │  [← Anterior]  [Próximo →]  [✕ Terminar]      │
└────────────────────────────────────────────────────────────┘
```

Counter: shows last-executed step as `currentStep` / `steps.length` (0 before any step executes, `steps.length/steps.length` when all done). When `currentStep === steps.length`, show "Concluído" instead of Próximo button.

### Behaviour
- **Próximo →**: execute `steps[currentStep]`, then `currentStep++`. Replaced by "Concluído" label (non-clickable) when `currentStep >= steps.length`.
- **← Anterior**: call `revertStep(steps[currentStep - 1])`, then `currentStep--`. Disabled when `currentStep === 0`.
- **✕ Terminar**: write `{ scenarioActive: false, currentStep: 0 }` to `poci_scenario_state`. Panel disappears.

### New files
- `app/app/components/DemoPlayer.js`

---

## 4. Unit Movement

### Ground units (`unit.type !== 'air'`)

1. `executeStep` for `assign_unit` calls `startUnitMovement(unit, incident)`.
2. `startUnitMovement` reads unit position from `allUnits`, incident position from `allIncidents`.
3. OSRM call (one-time per assignment):
   ```
   GET https://router.project-osrm.org/route/v1/driving/{fromLng},{fromLat};{toLng},{toLat}?overview=full&geometries=geojson
   ```
4. On success: use `routes[0].geometry.coordinates` (`[[lng,lat],...]`).
5. **On failure** (network error, non-200): fall back to `[[fromLng,fromLat],[toLng,toLat]]`. Demo continues uninterrupted.
6. Route cached in `routeCacheRef` keyed by `${unitId}:${incidentId}` (handles re-assignment to different incidents).
7. Route stored in `unitRoutesRef`: `{ [unitId]: { waypoints, waypointIndex: 0, subProgress: 0 } }`.
8. Single `setInterval` at 500ms ticks all active routes at 60 km/h.
9. Each tick updates `animatedPositions` React state: `{ [unitId]: [lat, lng] }`.
10. On arrival: status → `onscene`, remove from `unitRoutesRef`.

### Air units (`unit.type === 'air'`)

Skip OSRM. Straight-line interpolation. Speed by `unit.airKind`:
- `'helicopter'` → 150 km/h
- `'plane'` → 300 km/h
- absent → 150 km/h

### MapView integration

`MapView` receives `animatedPositions: { [unitId]: [lat, lng] }` prop. A `useEffect` calls:
```js
Object.entries(animatedPositions).forEach(([unitId, [lat, lng]]) => {
  const marker = unitMarkersRef.current[unitId]
  if (!marker) return  // graceful no-op; custom units not yet in ref
  marker.setLatLng([lat, lng])
})
```

### New files / changes
- `app/app/lib/useUnitAnimation.js` — OSRM fetch, route cache, animation loop, `animatedPositions` state. Exports: `animatedPositions`, `startUnitMovement(unit, incident)`, `stopUnitMovement(unitId)`. `stopUnitMovement` must: remove unit from `unitRoutesRef` AND remove unit from `animatedPositions` state to prevent stale position from re-applying via the MapView `useEffect`.
- `app/app/components/MapView.js` — add `animatedPositions` prop + `useEffect`.
- `app/app/components/PociApp.js` — instantiate `useUnitAnimation`, wire callbacks into `executeStep`/`revertStep`.

---

## 5. State additions to `usePociState`

| New item | Type | Purpose |
|---|---|---|
| `scenarioActive` | `boolean` | Whether player panel is shown |
| `currentStep` | `number` | 0-based index into scenario steps |
| `executeStep(step, callbacks)` | function | Dispatches step by type, writes `_snapshot` |
| `revertStep(step, callbacks)` | function | Undoes step using `_snapshot` |
| `radioMessages` | `array` | Live radio feed (migrated from static import) |
| `addRadioMessage(msg)` | function | Prepends to `radioMessages`, persists |
| `incidentStatusOverrides` | `{ [id]: status }` | Tracks status changes for mock incidents |

`incidentStatusOverrides` is needed because `updateIncidentStatus()` currently only mutates `customIncidents` via `setCustomIncidents`. Mock incidents (INC-034 etc.) are a static import — their status cannot be changed via `setCustomIncidents`.

**Required changes to `updateIncidentStatus(incidentId, newStatus)`:**
1. Check if `incidentId` exists in `customIncidents`. If yes: update via `setCustomIncidents` (existing behavior).
2. If not in `customIncidents` (i.e. a mock incident): write to `incidentStatusOverrides` via `setIncidentStatusOverrides(prev => ({ ...prev, [incidentId]: newStatus }))`.
3. `allIncidents` computation changes to: `mockIncidents.map(i => ({ ...i, status: incidentStatusOverrides[i.id] ?? i.status }))` merged with `customIncidents`.
4. The `appendLog` call inside `updateIncidentStatus` remains unconditional — revert calls also produce a log entry, which is intentional (append-only log).

---

## 6. Integration Points

| Existing system | Change |
|---|---|
| `usePociState.js` | Add items from §5 |
| `appendLog` | Called by event executors — Relatório auto-updates |
| `addAlert` / `resolveAlert` | Called by `create_alert` executor / revert |
| `RadioPanel` | Read from `usePociState().radioMessages` instead of static import |
| `MapView.js` | Add `animatedPositions` prop + `useEffect` |
| `PociApp.js` | Instantiate `useUnitAnimation`, render `DemoPlayer`, pass callbacks |
| `/alertas`, `/radio` | No changes |
| `demoMode` (UnitsPanel toggle) | Unchanged |

---

## Out of scope

- Multiple saved scenarios
- Sharing/exporting scenarios
- Live script editing during a running demo
- Automatic playback / time compression
- Removing log entries from Relatório on revert
- Adding custom unit markers to `unitMarkersRef` (tracked separately)
