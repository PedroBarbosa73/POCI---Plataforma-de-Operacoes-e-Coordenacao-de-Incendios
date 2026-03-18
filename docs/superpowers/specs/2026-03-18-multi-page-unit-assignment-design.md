# POCI — Multi-Page Architecture + Unit Assignment
**Date:** 2026-03-18
**Status:** Approved

## Overview

POCI is a real fire operations coordination tool currently in MVP/demo phase. The goal is to build toward a complete fire operations simulation — real features first, simulation engine later (Operations First sequence).

This spec covers the first major architectural step: introducing a multi-page structure and building the `/meios` (unit management + assignment) page as the first new page.

---

## Context & Motivation

The current app is a single-page coordination view (`/comando`). As the tool grows toward real use, different operators in a command center will work different screens simultaneously — one manages unit assignments, another watches the map, a radio operator handles communications. Real fires involve 1000+ units — a sidebar panel is unusable at that scale.

Next.js App Router makes adding new routes trivial. Each page becomes an independent screen that can be opened on a dedicated monitor.

---

## Build Sequence (Operations First)

1. **Multi-page architecture + `/meios` + unit assignment** ← this spec
2. Incident & unit status editing + activity log
3. Simulation engine (scripted scenario, timeline, play/pause/speed)
4. Radio page with scripted incoming calls
5. Population alerts page
6. Edit drawn zones & closures
7. Situation report / export
8. Backend persistence (Supabase)
9. `/aereo` — drone feeds + thermal overlay (future)

---

## Section 1 — Shared State & Cross-Tab Sync

### localStorage key inventory

**Existing keys (unchanged):**
- `poci_drawnZones`
- `poci_drawnClosures`
- `poci_customIncidents`

**New keys (this spec):**
- `poci_unitAssignments` — `{ [unitId]: incidentId | null }` — which incident each unit is assigned to
- `poci_unitStatuses` — `{ [unitId]: 'available' | 'assigned' | 'enroute' | 'onscene' }` — operational status per unit
- `poci_customUnits` — `Array<{ id, name, type, lat?, lng? }>` — units added via "+ Nova Unidade" modal

### Seeding on first load

On first load, check `!localStorage.getItem('poci_unitAssignments')` (handles both `null` for missing key and `''` for corrupt value). Wrap all `localStorage.getItem` + `JSON.parse` calls in `try/catch` consistent with existing `PociApp.js` pattern. If absent or unparseable, seed from `mockData.js` units:

```js
// seed poci_unitAssignments
const assignments = {}
units.forEach(u => { assignments[u.id] = u.incident || null })

// seed poci_unitStatuses
const statuses = {}
units.forEach(u => { statuses[u.id] = u.status || 'available' })
```

**Note on mock data inconsistency:** `mockData.js` has PCM-03 with `status: 'available'` but `incident: 'INC-031'`. When seeding, if `status === 'available'`, force `assignment = null` regardless of the `incident` field. Available units are never assigned.

### `usePociState` hook

File: `app/app/lib/usePociState.js`
Directive: `'use client'`

**Return shape:**

```js
return {
  // existing state (migrated from PociApp.js)
  customIncidents, setCustomIncidents,
  drawnZonesByIncident, setDrawnZonesByIncident,
  drawnClosures, setDrawnClosures,

  // new state
  unitAssignments,   // { [unitId]: incidentId | null }
  unitStatuses,      // { [unitId]: status }
  customUnits,       // Array<unit>

  // actions
  assignUnit,        // (unitId, incidentId) => void
  unassignUnit,      // (unitId) => void
  setUnitStatus,     // (unitId, status) => void
  addCustomUnit,     // (unit) => void

  // derived
  allUnits,          // [...mockUnits, ...customUnits]
  unitsByIncident,   // (incidentId) => Unit[]
  availableUnits,    // Unit[]
}
```

### BroadcastChannel sync

`BroadcastChannel` is browser-only and must be instantiated inside `useEffect`, not at module level (to avoid SSR crash):

```js
useEffect(() => {
  const channel = new BroadcastChannel('poci')
  channel.onmessage = () => {
    // re-read all poci_* keys from localStorage and call their setters
    setUnitAssignments(JSON.parse(localStorage.getItem('poci_unitAssignments') || '{}'))
    setUnitStatuses(JSON.parse(localStorage.getItem('poci_unitStatuses') || '{}'))
    // ... same for other keys
  }
  channelRef.current = channel
  return () => channel.close() // cleanup on unmount
}, [])
```

When any action (assignUnit, unassignUnit, etc.) writes to localStorage, it also calls:

```js
channelRef.current?.postMessage({ type: 'poci-state-changed' })
```

**Notes:**
- BroadcastChannel does NOT fire in the tab that sent the message — no guard needed for self-messages.
- Payload does not need to carry the new value — all tabs re-read from localStorage on receipt (simple and consistent).
- `channelRef` is a `useRef` initialised to `null`, set inside the effect.

### `demoMode` state

`demoMode` (currently in `PociApp.js`, displayed as a toggle in `UnitsPanel`) moves into `usePociState` — it is returned from the hook and passed down as before. It is not persisted to localStorage (stays ephemeral in React state).

---

## Section 2 — Navigation & Shared Layout

### `layout.js` structure

The root `app/app/layout.js` currently wraps children in `<Providers>`. `NavBar` must render **inside** `<Providers>` so it has access to the session (for the "Sair" button via `useSession`):

```jsx
// app/app/layout.js
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
```

### `NavBar` component

File: `app/app/components/NavBar.js`
Directive: `'use client'` (required for `usePathname()` active-link highlighting and `useSession()`)

```
[PO] POCI  |  Situação   Meios   Rádio   Alertas   Relatório  |  [Sair]  [Exportar]  [Nova Ocorrência]
```

- Logo + app name (left)
- Page links using Next.js `<Link>` with active styling via `usePathname()` (centre)
- Auth + action buttons (right) — moved from `AppHeader.js`
- Slim fixed bar, does not scroll with content

### `/publico` exclusion

`/publico` is a public-facing page that must NOT show the command `NavBar`. Since `NavBar` is in the root layout, it must conditionally hide on `/publico`:

```jsx
// NavBar.js
const pathname = usePathname()
if (pathname?.startsWith('/publico')) return null
```

### `AppHeader.js` changes

Remove: nav/page links, "Sair" button (moved to NavBar).
Keep: incident status pills (active/controlled/surveillance counts), unit count pill, "Exportar" button stays or moves — TBD but keep in AppHeader for now since it's map-context-specific.

### Page inventory

| Route | Component | Map | Status |
|---|---|---|---|
| `/comando` | `PociApp.js` (existing) | Yes | Existing — minor updates |
| `/meios` | `MeiosPage.js` (new) | No | Built in this spec |
| `/radio` | placeholder | No | "Em construção" |
| `/alertas` | placeholder | No | "Em construção" |
| `/relatorio` | placeholder | No | "Em construção" |
| `/publico` | existing | Yes | Unchanged |

---

## Section 3 — `/meios` Page

### File structure

Following the existing pattern (`app/app/comando/page.js` is a thin wrapper around `PociApp.js`), the `/meios` route is implemented in a single file:

- **`app/app/meios/page.js`** — contains all the page logic directly (no separate `MeiosPage.js` component). Uses `usePociState` hook. Directive: `'use client'`. No Leaflet import. Full-width layout.

`UnitDetailPanel` is the only sub-component extracted to its own file (it is reused on both `/meios` and will be used on `/comando` in the future).

### Layout

**Top bar — filters + search:**
```
[ Todos | Bombeiros | GNR | ANEPC | Aéreo | Municipal | Outro ]   (type filter)
[ Todos | Disponível | Atribuído | Em Deslocação | Em Ocorrência ]   (status filter)
[ 🔍 Pesquisar unidades...                        ]   [ + Nova Unidade ]
```

**Summary strip:** `X disponíveis · Y em deslocação · Z em ocorrência · W no total`

**Unit table:**

| Unidade | Tipo | Estado | Ocorrência | Ações |
|---|---|---|---|---|
| 🚒 B.V. Guarda | Bombeiros | EM OCORRÊNCIA | INC-034 Serra da Estrela | [Mover ▾] [✕] |
| 🚒 B.V. Pombal | Bombeiros | DISPONÍVEL | — | [Atribuir ▾] |
| 🚁 Kamov Faro | Aéreo | DISPONÍVEL | — | [Atribuir ▾] |

### Type label mapping

| `unit.type` | Display label | Filter tab |
|---|---|---|
| `bombeiros` | Bombeiros | Bombeiros |
| `gnr` | GNR | GNR |
| `anepc` | ANEPC | ANEPC |
| `air` | Aéreo | Aéreo |
| `municipal` | Municipal | Municipal |
| `other` | Outro | Outro |

### Interactions

**Atribuir ▾** (available unit) → inline dropdown listing all active/controlled/surveillance incidents → select one → calls `assignUnit(unitId, incidentId)` → unit status becomes `assigned`

**Mover ▾** (already assigned unit) → same dropdown, pre-highlighted on current incident → select new incident → `assignUnit(unitId, newIncidentId)`. If previous status was `onscene` or `enroute`, status is reset to `assigned` (explicit downgrade — the commander is re-routing the unit).

**✕** (unassign) → calls `unassignUnit(unitId)` → `unitAssignments[unitId] = null`, `unitStatuses[unitId] = 'available'`

**Row click** → `UnitDetailPanel` slides in from right (see below). Table row remains visible.

**+ Nova Unidade** → modal with fields: name (text), type (select from type list above), lat (optional), lng (optional) → calls `addCustomUnit({ id: 'CUST-U-{timestamp}', name, type, lat, lng })` → new unit is added to `poci_customUnits`, initialized with `unitStatuses[id] = 'available'` and `unitAssignments[id] = null` at creation time.

### Query param: pre-filtering

`/meios?incident=INC-034` — `MeiosPage` reads this param via `useSearchParams()` and pre-sets the status filter to "Todos" and adds an incident filter chip "Mostrando: INC-034" that filters the table to units assigned to that incident. User can clear the chip to see all units.

### Pagination

Out of scope for this spec. Table renders all units (26 mock + custom). Virtualization/pagination is deferred to a future spec when unit counts justify it.

### `UnitDetailPanel` component

File: `app/app/components/UnitDetailPanel.js`

Slides in from right side of `/meios` page. Shows:
- Unit name, ID, type badge
- Current status badge
- Assigned incident name (with link to `/comando?focus=INC-034`)
- Assign / Unassign action buttons (same as table row)

Closed by clicking ✕ or clicking outside. State is local to `MeiosPage` (`selectedUnitId`).

---

## Section 4 — `/comando` Updates

### State refactor

`PociApp.js` replaces its inline `useState` calls for `customIncidents`, `drawnZonesByIncident`, `drawnClosures` with calls to `usePociState`. It also receives `unitAssignments`, `unitStatuses`, `allUnits`, `unitsByIncident`, `assignUnit`, `unassignUnit`, `setUnitStatus`, and `demoMode` from the hook.

### `visibleUnits` memo

Currently: `return units.filter(...)` (static import from mockData).
After: `return allUnits.filter(...)` (from hook — includes custom units).

### `IncidentDetail` prop changes

`IncidentDetail` currently receives a `units` prop (array of unit objects filtered by incident, with static status fields).

After refactor, `PociApp.js` passes:
```js
<IncidentDetail
  units={unitsByIncident(selectedIncidentId)}   // derived from unitAssignments
  unitStatuses={unitStatuses}                    // { [unitId]: status }
  // ... other existing props
/>
```

Inside `IncidentDetail`, the two filter lines that compute `onscene`/`enroute` counts must change:

```js
// Before:
units.filter(u => u.status === 'onscene')
units.filter(u => u.status === 'enroute')

// After:
units.filter(u => (unitStatuses[u.id] || u.status) === 'onscene')
units.filter(u => (unitStatuses[u.id] || u.status) === 'enroute')
```

The `|| u.status` fallback ensures static mock units that haven't been seeded yet still render correctly.

### `UnitsPanel` prop changes

`UnitsPanel` currently reads `unit.status` directly from unit objects. After refactor, `unitStatuses` must be passed as a new prop:

```js
// PociApp.js passes:
<UnitsPanel
  unitStatuses={unitStatuses}   // new prop
  // ... existing props
/>

// UnitsPanel reads:
const status = unitStatuses[unit.id] || unit.status  // fallback to static field
```

### `AppHeader` prop changes

`AppHeader` currently receives `unitCount` (visible units) and shows total. After refactor:
- `unitCount` stays — passed from `PociApp.js` as `visibleUnits.length`
- `totalUnitCount` becomes `allUnits.length` (from hook)
- Nav/auth buttons are removed from `AppHeader` (moved to `NavBar`)

### Map unit marker colors

`MapView.js` uses the stale closure pattern — `unitStatuses` is passed as a prop and synced to a ref in `MapView.js`, exactly like `selectedIncidentRef` and other existing refs.

**In `PociApp.js`:**
```js
<MapView
  unitStatuses={unitStatuses}   // new prop
  // ... existing props
/>
```

**In `MapView.js`:**
```js
// 1. Add ref (alongside existing refs)
const unitStatusesRef = useRef({})

// 2. Add sync effect (alongside existing ref sync effects)
useEffect(() => { unitStatusesRef.current = unitStatuses }, [unitStatuses])

// 3. Add reactive effect to update marker icon colors when statuses change
useEffect(() => {
  if (!mapReady) return
  allUnitsRef.current.forEach(unit => {
    const marker = unitMarkersRef.current[unit.id]
    if (!marker) return
    const status = unitStatusesRef.current[unit.id] || 'available'
    const color = unitStatusColor(status)
    marker.setIcon(L.divIcon({ html: mapIconHtml(unit.name, color, unitEmoji(unit.type)) }))
  })
}, [unitStatuses, mapReady])
```

This is a **new reactive `useEffect`** separate from the one-time `initMap`. It iterates `unitMarkersRef.current` (a map of `unitId → Leaflet marker`, which must be populated during `initMap` — see below) and updates each marker's icon HTML.

**`unitMarkersRef`:** A new `useRef({})` in `MapView.js`. During `initMap`, when each unit marker is created, store it: `unitMarkersRef.current[unit.id] = marker`. This ref is also needed for `focusUnit` (see below).

**`allUnitsRef`:** A new `useRef([])` synced to the `allUnits` prop (passed from `PociApp.js` same as other refs), so the reactive effect can iterate all units including custom ones.

Unit marker color mapping:
- `available` → grey (`#9ca3af`)
- `assigned` → yellow (`#eab308`)
- `enroute` → orange (`#f97316`)
- `onscene` → red (`#ef4444`) ← existing behavior

Helper functions added to `MapView.js` (or `mapUtils.js`):
```js
function unitStatusColor(status) {
  const map = { available: '#9ca3af', assigned: '#eab308', enroute: '#f97316', onscene: '#ef4444' }
  return map[status] || '#9ca3af'
}
function unitEmoji(type) {
  const map = { bombeiros: '🚒', gnr: '🚔', anepc: '🏛', air: '🚁', municipal: '🏛', other: '🔧' }
  return map[type] || '🚒'
}

### `focusUnit` with custom units

`MapView.js` currently calls `units.find(u => u.id === unitId)` (static import) inside `focusUnit`. After refactor, `focusUnit` must look up from `unitMarkersRef.current[unitId]` directly — the marker is already stored there, so no unit array lookup is needed:

```js
// Before:
focusUnit(id) {
  const unit = units.find(u => u.id === id)
  if (unit) map.setView([unit.lat, unit.lng], 10)
}

// After:
focusUnit(id) {
  const marker = unitMarkersRef.current[id]
  if (marker) map.setView(marker.getLatLng(), 10)
}
```

This automatically works for both mock units and custom units since all markers go into `unitMarkersRef`.

### IncidentDetail "Gerir meios" link

Small link below unit count:
```jsx
<Link href={`/meios?incident=${incident.id}`}>Gerir meios →</Link>
```

---

## Data Model

```js
// poci_unitAssignments (localStorage) — seeded from mockData
{
  "BVP-12": "INC-034",
  "BVP-01": "INC-034",
  "PCM-03": null,         // available, even though mockData shows INC-031
  "LOG-08": "INC-029"
}

// poci_unitStatuses (localStorage) — seeded from mockData
{
  "BVP-12": "onscene",
  "BVP-01": "onscene",
  "BVP-04": "enroute",
  "PCM-03": "available"
}

// poci_customUnits (localStorage) — starts empty
[
  {
    id: "CUST-U-1234",
    name: "B.V. Pombal",
    type: "bombeiros",
    lat: 39.9,    // optional
    lng: -8.6     // optional
  }
]
// On creation: unitStatuses["CUST-U-1234"] = "available", unitAssignments["CUST-U-1234"] = null
```

---

## Status Transition Table

| Action | Previous status | New status | Assignment |
|---|---|---|---|
| Atribuir | `available` | `assigned` | set to incidentId |
| Mover | `assigned` / `enroute` / `onscene` | `assigned` | set to new incidentId |
| Unassign (✕) | any | `available` | null |
| (future) Confirm enroute | `assigned` | `enroute` | unchanged |
| (future) Confirm onscene | `enroute` | `onscene` | unchanged |

---

## Files Changed / Created

| File | Change |
|---|---|
| `app/app/layout.js` | Render `<NavBar />` inside `<Providers>` |
| `app/app/components/NavBar.js` | New — `'use client'`, page nav bar, hides on `/publico` |
| `app/app/lib/usePociState.js` | New — `'use client'`, shared state hook, BroadcastChannel |
| `app/app/components/PociApp.js` | Use `usePociState`; update `visibleUnits` memo; pass new props |
| `app/app/components/AppHeader.js` | Remove nav/auth buttons; accept updated props |
| `app/app/components/IncidentDetail.js` | Accept `unitStatuses` prop; dynamic count; "Gerir meios" link |
| `app/app/components/panels/UnitsPanel.js` | Accept new `unitStatuses` prop; read status from `unitStatuses[unit.id]` |
| `app/app/components/MapView.js` | Add `unitStatusesRef`, `unitMarkersRef`, `allUnitsRef`; populate `unitMarkersRef` in `initMap`; reactive effect for marker colors; fix `focusUnit` to use `unitMarkersRef` |
| `app/app/components/UnitDetailPanel.js` | New — unit detail slide-in panel |
| `app/app/meios/page.js` | New — `/meios` route + full page logic, `'use client'` |
| `app/app/radio/page.js` | New — placeholder "Em construção" |
| `app/app/alertas/page.js` | New — placeholder "Em construção" |
| `app/app/relatorio/page.js` | New — placeholder "Em construção" |

---

## Out of Scope (this spec)

- Unit movement animation on map (simulation engine — spec 3)
- Assignment history / activity log (spec 2)
- Incident status editing (spec 2)
- Pagination / virtualization of unit table (deferred)
- Backend persistence — localStorage + BroadcastChannel is sufficient for now
- Drone / aerial page
- Status editing from `/meios` (onscene, enroute transitions — manual status control is spec 2)
