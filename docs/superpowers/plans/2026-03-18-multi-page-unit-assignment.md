# Multi-Page Architecture + Unit Assignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce multi-page navigation and a `/meios` unit management page with full assign/unassign capability, backed by shared localStorage state synced across tabs via BroadcastChannel.

**Architecture:** Extract shared state into `usePociState` hook; add `NavBar` to root layout; update `/comando` components to consume the hook; build `/meios` as a standalone full-page unit management interface.

**Tech Stack:** Next.js 16 App Router, React 19, plain JavaScript, localStorage, BroadcastChannel, Leaflet (MapView only)

**Spec:** `docs/superpowers/specs/2026-03-18-multi-page-unit-assignment-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/app/lib/usePociState.js` | **Create** | Shared state hook: seed, read/write localStorage, BroadcastChannel sync, actions, derived values |
| `app/app/components/NavBar.js` | **Create** | Fixed navigation bar with page links; hides on `/publico` |
| `app/app/layout.js` | **Modify** | Add `<NavBar />` inside `<Providers>` |
| `app/app/radio/page.js` | **Create** | Placeholder "Em construção" |
| `app/app/alertas/page.js` | **Create** | Placeholder "Em construção" |
| `app/app/relatorio/page.js` | **Create** | Placeholder "Em construção" |
| `app/app/components/PociApp.js` | **Modify** | Replace inline state with `usePociState`; update `visibleUnits` memo; pass new props |
| `app/app/components/AppHeader.js` | **Modify** | Remove "Sair" button (moved to NavBar); accept updated `totalUnitCount` |
| `app/app/components/IncidentDetail.js` | **Modify** | Accept `unitStatuses` prop; dynamic onscene/enroute counts; "Gerir meios" link |
| `app/app/components/panels/UnitsPanel.js` | **Modify** | Accept `unitStatuses` prop; read status from `unitStatuses[unit.id]` with fallback |
| `app/app/components/MapView.js` | **Modify** | Add `unitStatuses` prop + ref; add `allUnitsRef`; reactive color effect; fix `focusUnit` |
| `app/app/components/UnitDetailPanel.js` | **Create** | Slide-in panel: unit info + assign/unassign actions |
| `app/app/meios/page.js` | **Create** | `/meios` route: full-page unit table with filters, assignment actions, Nova Unidade modal |

---

## Chunk 1: usePociState Hook

### Task 1: Create `usePociState.js`

**Files:**
- Create: `app/app/lib/usePociState.js`

This hook centralises all unit state (assignments, statuses, custom units) plus migrates the three existing localStorage keys from `PociApp.js`. It seeds on first load, persists every change, and broadcasts to other tabs.

- [ ] **Step 1: Create the file**

```js
// app/app/lib/usePociState.js
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  }, [])

  // ── Persist migrated state on change (existing pattern) ──────────────────
  useEffect(() => {
    try { localStorage.setItem('poci_drawnZones', JSON.stringify(drawnZonesByIncident)) } catch {}
  }, [drawnZonesByIncident])

  useEffect(() => {
    try { localStorage.setItem('poci_drawnClosures', JSON.stringify(drawnClosures)) } catch {}
  }, [drawnClosures])

  useEffect(() => {
    try { localStorage.setItem('poci_customIncidents', JSON.stringify(customIncidents)) } catch {}
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
    const newAssignments = { ...unitAssignments, [unitId]: incidentId }
    const newStatuses = { ...unitStatuses, [unitId]: 'assigned' }
    try { localStorage.setItem('poci_unitAssignments', JSON.stringify(newAssignments)) } catch {}
    try { localStorage.setItem('poci_unitStatuses', JSON.stringify(newStatuses)) } catch {}
    setUnitAssignments(newAssignments)
    setUnitStatuses(newStatuses)
    broadcast()
  }

  function unassignUnit(unitId) {
    const newAssignments = { ...unitAssignments, [unitId]: null }
    const newStatuses = { ...unitStatuses, [unitId]: 'available' }
    try { localStorage.setItem('poci_unitAssignments', JSON.stringify(newAssignments)) } catch {}
    try { localStorage.setItem('poci_unitStatuses', JSON.stringify(newStatuses)) } catch {}
    setUnitAssignments(newAssignments)
    setUnitStatuses(newStatuses)
    broadcast()
  }

  function setUnitStatus(unitId, status) {
    const newStatuses = { ...unitStatuses, [unitId]: status }
    try { localStorage.setItem('poci_unitStatuses', JSON.stringify(newStatuses)) } catch {}
    setUnitStatuses(newStatuses)
    broadcast()
  }

  function addCustomUnit(unit) {
    const newUnits = [...customUnits, unit]
    const newAssignments = { ...unitAssignments, [unit.id]: null }
    const newStatuses = { ...unitStatuses, [unit.id]: 'available' }
    try { localStorage.setItem('poci_customUnits', JSON.stringify(newUnits)) } catch {}
    try { localStorage.setItem('poci_unitAssignments', JSON.stringify(newAssignments)) } catch {}
    try { localStorage.setItem('poci_unitStatuses', JSON.stringify(newStatuses)) } catch {}
    setCustomUnits(newUnits)
    setUnitAssignments(newAssignments)
    setUnitStatuses(newStatuses)
    broadcast()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const allUnits = useMemo(() => [...mockUnits, ...customUnits], [customUnits])

  function unitsByIncident(incidentId) {
    return allUnits.filter(u => unitAssignments[u.id] === incidentId)
  }

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
```

- [ ] **Step 2: Verify the file parses (no build errors)**

```bash
cd app && npm run build 2>&1 | head -30
```

Expected: no errors referencing `usePociState.js` (the hook isn't used yet — this just confirms the module is valid).

- [ ] **Step 3: Commit**

```bash
git add app/app/lib/usePociState.js
git commit -m "feat: add usePociState hook with unit assignment state and BroadcastChannel sync"
```

---

## Chunk 2: NavBar + Layout + Placeholder Pages

### Task 2: Create `NavBar.js`

**Files:**
- Create: `app/app/components/NavBar.js`

- [ ] **Step 1: Create NavBar**

```js
// app/app/components/NavBar.js
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV_LINKS = [
  { href: '/comando', label: 'Situação' },
  { href: '/meios',   label: 'Meios' },
  { href: '/radio',   label: 'Rádio' },
  { href: '/alertas', label: 'Alertas' },
  { href: '/relatorio', label: 'Relatório' },
]

export default function NavBar() {
  const pathname = usePathname()

  // Hide on public-facing page
  if (pathname?.startsWith('/publico')) return null

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo">
          <div className="logo-icon">PO</div>
          <span className="navbar-appname">POCI</span>
        </div>
      </div>

      <div className="navbar-center">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`navbar-link ${pathname?.startsWith(href) ? 'navbar-link-active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="navbar-right">
        <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
          Sair
        </button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Add NavBar styles to `globals.css`**

Open `app/app/globals.css` and add at the end:

```css
/* ── NavBar ──────────────────────────────────────────────────── */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1100;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}

.navbar-left { display: flex; align-items: center; gap: 8px; }
.navbar-logo { display: flex; align-items: center; gap: 8px; }
.navbar-appname { font-weight: 700; font-size: 14px; color: var(--text-primary); }

.navbar-center {
  display: flex;
  align-items: center;
  gap: 4px;
}

.navbar-link {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}

.navbar-link:hover { color: var(--text-primary); background: var(--bg-card-hover); }
.navbar-link-active { color: var(--text-primary) !important; background: var(--bg-card-hover) !important; }

.navbar-right { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 3: Check what CSS variables are available**

Scan `app/app/globals.css` for variable names like `--bg-panel`, `--bg-hover`, `--bg-selected`, `--border`, `--text-primary`, `--text-secondary`. If any are missing, substitute with the closest existing variable names. Do not invent new ones.

- [ ] **Step 4: Commit**

```bash
git add app/app/components/NavBar.js app/app/globals.css
git commit -m "feat: add NavBar component with page navigation"
```

---

### Task 3: Update `layout.js`

**Files:**
- Modify: `app/app/layout.js`

- [ ] **Step 1: Import and render NavBar inside Providers**

```js
// app/app/layout.js
import './globals.css';
import Providers from './providers';
import NavBar from './components/NavBar';

export const metadata = {
  title: 'POCI – Plataforma de Coordenação de Incêndios',
  description:
    'Solução tecnológica nacional para comando, comunicação e informação pública em incêndios rurais.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
        />
      </head>
      <body>
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Adjust main content top padding for NavBar height**

Search `app/app/globals.css` for `.app-wrapper` (the main content container used by PociApp). Add `padding-top: 44px` (the NavBar height) so content doesn't sit under the fixed bar. If the class is named differently, find the selector that wraps the map area and add the padding there instead.

- [ ] **Step 3: Commit**

```bash
git add app/app/layout.js app/app/globals.css
git commit -m "feat: add NavBar to root layout inside Providers"
```

---

### Task 4: Create placeholder pages

**Files:**
- Create: `app/app/radio/page.js`
- Create: `app/app/alertas/page.js`
- Create: `app/app/relatorio/page.js`

- [ ] **Step 1: Create all three placeholders**

Use the same template for each:

```js
// app/app/radio/page.js
export default function RadioPage() {
  return (
    <div style={{ padding: '80px 32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Rádio</h2>
      <p>Em construção.</p>
    </div>
  )
}
```

```js
// app/app/alertas/page.js
export default function AlertasPage() {
  return (
    <div style={{ padding: '80px 32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Alertas</h2>
      <p>Em construção.</p>
    </div>
  )
}
```

```js
// app/app/relatorio/page.js
export default function RelatorioPage() {
  return (
    <div style={{ padding: '80px 32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Relatório</h2>
      <p>Em construção.</p>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Start dev server (`npm run dev` in the `app/` directory). Navigate to:
- `http://localhost:3000/radio` → expect "Rádio / Em construção."
- `http://localhost:3000/alertas` → expect "Alertas / Em construção."
- `http://localhost:3000/relatorio` → expect "Relatório / Em construção."
- `http://localhost:3000/publico` → expect NavBar is **not** visible
- `http://localhost:3000/comando` → expect NavBar is visible with all 5 links

- [ ] **Step 3: Commit**

```bash
git add app/app/radio/page.js app/app/alertas/page.js app/app/relatorio/page.js
git commit -m "feat: add placeholder pages for radio, alertas, relatorio"
```

---

## Chunk 3: /comando Updates

### Task 5: Update `PociApp.js`

**Files:**
- Modify: `app/app/components/PociApp.js`

Replace inline state management with `usePociState`. The component keeps its local UI state (selected IDs, panel visibility, draw state, etc.) — only the shared/persisted state moves to the hook.

- [ ] **Step 1: Add import and replace state**

At the top of `PociApp.js`, add:
```js
import { usePociState } from '../lib/usePociState';
```

Replace these lines (lines 23–65, which set up `demoMode`, `drawnZonesByIncident`, `drawnClosures`, `customIncidents`, and their persistence effects):

```js
// REMOVE — these are now in usePociState:
const [demoMode, setDemoMode] = useState(true);
const [drawnZonesByIncident, setDrawnZonesByIncident] = useState({});
const [drawnClosures, setDrawnClosures] = useState([]);
const [customIncidents, setCustomIncidents] = useState([]);
// ...and the three load effects + three persist effects (lines 39–65)
```

Replace with:

```js
const {
  customIncidents, setCustomIncidents,
  drawnZonesByIncident, setDrawnZonesByIncident,
  drawnClosures, setDrawnClosures,
  demoMode, setDemoMode,
  unitAssignments, unitStatuses,
  assignUnit, unassignUnit,
  allUnits, unitsByIncident,
} = usePociState()
```

- [ ] **Step 2: Fix `visibleUnits` memo**

Find the `visibleUnits` useMemo (currently line 100–103):

```js
// Before:
const visibleUnits = useMemo(() => {
  if (!selectedIncidentId) return units;
  return units.filter((unit) => unit.incident === selectedIncidentId);
}, [selectedIncidentId]);
```

Replace with:

```js
// After:
const visibleUnits = useMemo(() => {
  if (!selectedIncidentId) return allUnits;
  return unitsByIncident(selectedIncidentId);
}, [selectedIncidentId, allUnits, unitAssignments]);
```

- [ ] **Step 3: Fix `handleSelectUnit`**

Find `handleSelectUnit` (currently line 132–137):

```js
// Before:
function handleSelectUnit(id) {
  const unit = units.find((u) => u.id === id);
  setSelectedUnitId(id);
  if (unit?.incident) setSelectedIncidentId(unit.incident);
  mapRef.current?.focusUnit(id);
}
```

Replace with:

```js
// After:
function handleSelectUnit(id) {
  setSelectedUnitId(id);
  const incidentId = unitAssignments[id]
  if (incidentId) setSelectedIncidentId(incidentId)
  mapRef.current?.focusUnit(id);
}
```

- [ ] **Step 4: Update `AppHeader` call**

Find the `<AppHeader .../>` JSX (line 210). Update `totalUnitCount`:

```jsx
// Before:
<AppHeader ... unitCount={visibleUnits.length} totalUnitCount={units.length} ... />

// After:
<AppHeader ... unitCount={visibleUnits.length} totalUnitCount={allUnits.length} ... />
```

- [ ] **Step 5: Update `IncidentDetail` call**

Find the `<IncidentDetail .../>` JSX (line 232–244). Add `unitStatuses` prop:

```jsx
// Before:
<IncidentDetail
  incident={selectedIncident}
  units={visibleUnits}
  ...
/>

// After:
<IncidentDetail
  incident={selectedIncident}
  units={visibleUnits}
  unitStatuses={unitStatuses}
  ...
/>
```

- [ ] **Step 6: Update `UnitsPanel` call**

Find the `<UnitsPanel .../>` JSX (lines 279–289). Add `unitStatuses` prop and update `allUnits`:

```jsx
// Before:
<UnitsPanel
  units={visibleUnits}
  allUnits={units}
  ...
/>

// After:
<UnitsPanel
  units={visibleUnits}
  allUnits={allUnits}
  unitStatuses={unitStatuses}
  ...
/>
```

- [ ] **Step 7: Update `MapView` call**

Find the `<MapView .../>` JSX. Add two new props:

```jsx
<MapView
  ref={mapRef}
  unitStatuses={unitStatuses}
  allUnits={allUnits}
  {/* ...all existing props unchanged... */}
/>
```

- [ ] **Step 8: Remove unused `units` import**

The static `units` import from `mockData` is no longer used directly in PociApp. Remove it from the import line:

```js
// Before:
import { incidents, units, closures, alerts, weather, initialZones } from '../data/mockData';

// After:
import { incidents, closures, alerts, weather, initialZones } from '../data/mockData';
```

- [ ] **Step 9: Verify in browser**

Navigate to `http://localhost:3000/comando`. The page should load exactly as before. Check:
- Incident list renders
- Unit panel shows units with correct statuses
- Clicking a unit focuses the map
- Drawing tools still work

- [ ] **Step 10: Commit**

```bash
git add app/app/components/PociApp.js
git commit -m "refactor: migrate PociApp state to usePociState hook"
```

---

### Task 6: Update `AppHeader.js`

**Files:**
- Modify: `app/app/components/AppHeader.js`

Remove the "Sair" button (moved to NavBar). Keep "Exportar" and "Nova Ocorrência" (map-specific actions).

- [ ] **Step 1: Remove "Sair" button**

In `AppHeader.js`, find the `header-right` section (lines 67–81):

```jsx
// Before (header-right content for non-public):
<button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
  Sair
</button>
<button className="btn btn-secondary btn-sm">Exportar</button>
<button className="btn btn-primary btn-sm" onClick={onNovaOcorrencia}>Nova Ocorrência</button>
```

Replace with:

```jsx
// After:
<button className="btn btn-secondary btn-sm">Exportar</button>
<button className="btn btn-primary btn-sm" onClick={onNovaOcorrencia}>Nova Ocorrência</button>
```

- [ ] **Step 2: Remove unused `signOut` import if no longer needed**

Check if `signOut` is referenced anywhere else in `AppHeader.js`. If not, remove:
```js
import { signOut } from 'next-auth/react';
```

- [ ] **Step 3: Commit**

```bash
git add app/app/components/AppHeader.js
git commit -m "refactor: move Sair button from AppHeader to NavBar"
```

---

### Task 7: Update `IncidentDetail.js`

**Files:**
- Modify: `app/app/components/IncidentDetail.js`

- [ ] **Step 1: Add `unitStatuses` to props**

Change the function signature (line 33):

```js
// Before:
export default function IncidentDetail({ incident, units, closures, zones, weather, onClose, visiblePanels = {}, onDeleteZone, onDeleteClosure, drawnClosureIds = new Set() }) {

// After:
export default function IncidentDetail({ incident, units, unitStatuses = {}, closures, zones, weather, onClose, visiblePanels = {}, onDeleteZone, onDeleteClosure, drawnClosureIds = new Set() }) {
```

- [ ] **Step 2: Fix onscene/enroute count lines**

Find lines 34–35:

```js
// Before:
const onscene = units.filter((u) => u.status === 'onscene').length;
const enroute = units.filter((u) => u.status === 'enroute').length;
```

Replace with:

```js
// After:
const onscene = units.filter((u) => (unitStatuses[u.id] || u.status) === 'onscene').length;
const enroute = units.filter((u) => (unitStatuses[u.id] || u.status) === 'enroute').length;
```

- [ ] **Step 3: Add "Gerir meios" link**

Add the `Link` import at the top of the file:

```js
import Link from 'next/link'
```

Find the `StatBox` for units (line 57):

```jsx
<StatBox label="Unidades" value={units.length} sub={`${onscene} em ocorrência`} />
```

Replace with:

```jsx
<StatBox label="Unidades" value={units.length} sub={`${onscene} em ocorrência`} />
```

And after the `inc-stats-row` div, add the link:

```jsx
{/* After </div> closing inc-stats-row */}
<div className="inc-gerir-link">
  <Link href={`/meios?incident=${incident.id}`} className="link-subtle">
    Gerir meios →
  </Link>
</div>
```

Add a minimal style for `.inc-gerir-link` and `.link-subtle` in `globals.css`:

```css
.inc-gerir-link { padding: 4px 0 8px; }
.link-subtle { font-size: 12px; color: var(--text-secondary); text-decoration: none; }
.link-subtle:hover { color: var(--text-primary); }
```

- [ ] **Step 4: Verify in browser**

Open `/comando`, click an incident, open IncidentDetail. Verify unit counts show correctly and "Gerir meios →" link appears.

- [ ] **Step 5: Commit**

```bash
git add app/app/components/IncidentDetail.js app/app/globals.css
git commit -m "feat: IncidentDetail reads unitStatuses dynamically, adds Gerir meios link"
```

---

### Task 8: Update `UnitsPanel.js`

**Files:**
- Modify: `app/app/components/panels/UnitsPanel.js`

- [ ] **Step 1: Add `unitStatuses` to props and use it**

Change the function signature (line 7):

```js
// Before:
export default function UnitsPanel({ units, allUnits, allCount, totalCount, selectedUnitId, demoMode, onToggleDemoMode, onSelectUnit }) {

// After:
export default function UnitsPanel({ units, allUnits, unitStatuses = {}, allCount, totalCount, selectedUnitId, demoMode, onToggleDemoMode, onSelectUnit }) {
```

Find the badge in the unit row (line 60):

```jsx
// Before:
<span className={unitBadge(unit.status)}>{unitStatusLabel(unit.status)}</span>

// After:
<span className={unitBadge(unitStatuses[unit.id] || unit.status)}>{unitStatusLabel(unitStatuses[unit.id] || unit.status)}</span>
```

Find the incident display in the card meta (line 64):

```jsx
// Before:
<span>{unit.incident || 'Livre'}</span>

// After: show incidentId from assignments if available, fallback to static field
<span>{unit.incident || 'Livre'}</span>
```

(No change needed here — `unit.incident` is the static mock field. The dynamic assignment is reflected via the `units` prop already filtered by `unitsByIncident` in `PociApp`. Leave this line as-is.)

- [ ] **Step 2: Commit**

```bash
git add app/app/components/panels/UnitsPanel.js
git commit -m "feat: UnitsPanel reads unit status from unitStatuses prop"
```

---

### Task 9: Update `MapView.js`

**Files:**
- Modify: `app/app/components/MapView.js`

`unitMarkersRef` already exists (line 34) and is already populated during `initMap` (lines 200–228). We need to:
1. Add `unitStatuses` and `allUnits` props
2. Add `unitStatusesRef` and `allUnitsRef`
3. Add sync effects for both refs
4. Change initial marker colors to status-based
5. Add reactive effect to update marker colors when statuses change
6. Fix `focusUnit` to use `unitMarkersRef` directly

- [ ] **Step 1: Add props to the component signature**

Find the prop destructuring at the top of the `forwardRef` function (lines 8–22). Add `unitStatuses` and `allUnits`:

```js
// Before:
{
  selectedIncidentId,
  selectedUnitId,
  isPublic,
  zonesByIncident,
  showZones,
  isCommandView,
  onDrawComplete,
  onShowZonesChange,
  drawnClosures,
  placingIncident,
  onPlaceIncident,
  customIncidents,
},

// After:
{
  selectedIncidentId,
  selectedUnitId,
  isPublic,
  zonesByIncident,
  showZones,
  isCommandView,
  onDrawComplete,
  onShowZonesChange,
  drawnClosures,
  placingIncident,
  onPlaceIncident,
  customIncidents,
  unitStatuses = {},
  allUnits,
},
```

- [ ] **Step 2: Add new refs (after line 45, with the other refs)**

```js
// Add after customIncidentsRef:
const unitStatusesRef = useRef({})
const allUnitsRef = useRef([])
```

- [ ] **Step 3: Add sync effects for the new refs**

Add after the existing `customIncidents` sync effect (after line 83):

```js
useEffect(() => { unitStatusesRef.current = unitStatuses }, [unitStatuses])
useEffect(() => { allUnitsRef.current = allUnits || [] }, [allUnits])
```

- [ ] **Step 4: Fix `focusUnit` in `useImperativeHandle`**

Find `focusUnit` (lines 93–97):

```js
// Before:
focusUnit(unitId) {
  const unit = units.find((u) => u.id === unitId);
  if (!unit || !mapRef.current) return;
  mapRef.current.setView([unit.lat, unit.lng], 10, { animate: true });
},

// After:
focusUnit(unitId) {
  const marker = unitMarkersRef.current[unitId]
  if (!marker || !mapRef.current) return
  mapRef.current.setView(marker.getLatLng(), 10, { animate: true })
},
```

- [ ] **Step 5: Add helper functions before `initMap`**

Add these two pure helpers near the top of the `MapView` component body (after the refs, before `initMap`):

```js
function unitStatusColor(status) {
  const map = { available: '#9ca3af', assigned: '#eab308', enroute: '#f97316', onscene: '#ef4444' }
  return map[status] || '#9ca3af'
}

function unitGlyph(unit) {
  if (unit.type === 'air') return unit.airKind === 'plane' ? '✈' : '🚁'
  if (unit.type === 'gnr') return 'G'
  if (unit.type === 'bombeiros') return 'B'
  if (unit.type === 'anepc') return 'A'
  if (unit.type === 'municipal') return 'M'
  return 'R'
}
```

- [ ] **Step 6: Update `initMap` to color markers by status**

Find the unit marker creation block in `initMap` (lines 200–229). Change the color source from type-based to status-based:

```js
// Before (lines 200–228):
unitMarkersRef.current = {};
units.forEach((unit) => {
  const color = unitColors[unit.type] || '#ffffff';
  const glyph =
    unit.type === 'air'
      ? unit.airKind === 'plane' ? '✈' : '🚁'
      : unit.type === 'gnr' ? 'G'
      : unit.type === 'bombeiros' ? 'B'
      : unit.type === 'anepc' ? 'A'
      : unit.type === 'municipal' ? 'M'
      : 'R';
  const isLetter = unit.type !== 'air';
  const icon = L.divIcon({
    className: `map-icon map-icon-${unit.type}`,
    html: mapIconHtml(unit.name, color, glyph, isLetter),
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -10],
  });
  const marker = L.marker([unit.lat, unit.lng], { icon })
    .bindPopup(`${unit.name} (${unit.id})`)
    .addTo(unitLayer);
  unitMarkersRef.current[unit.id] = marker;
});
```

Replace with:

```js
// After:
unitMarkersRef.current = {};
units.forEach((unit) => {
  const status = unitStatusesRef.current[unit.id] || unit.status || 'available'
  const color = unitStatusColor(status)
  const glyph = unitGlyph(unit)
  const isLetter = unit.type !== 'air'
  const icon = L.divIcon({
    className: `map-icon map-icon-${unit.type}`,
    html: mapIconHtml(unit.name, color, glyph, isLetter),
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -10],
  })
  const marker = L.marker([unit.lat, unit.lng], { icon })
    .bindPopup(`${unit.name} (${unit.id})`)
    .addTo(unitLayer)
  unitMarkersRef.current[unit.id] = marker
})
```

Note: `unitStatusesRef.current` may be empty on first render if the hook's mount effect hasn't run yet — the `|| unit.status` fallback handles this.

- [ ] **Step 7: Add reactive effect to update marker colors**

Add this effect **after** the existing ref-sync effects (after the `customIncidents` effect, around line 84). It must run after `mapReady` becomes true:

```js
// Reactive: update unit marker icon colors when unitStatuses changes
useEffect(() => {
  if (!mapReady) return
  const L = LRef.current
  if (!L) return
  ;(allUnitsRef.current || []).forEach(unit => {
    const marker = unitMarkersRef.current[unit.id]
    if (!marker) return  // custom units without map coordinates have no marker
    const status = unitStatusesRef.current[unit.id] || unit.status || 'available'
    const color = unitStatusColor(status)
    const glyph = unitGlyph(unit)
    const isLetter = unit.type !== 'air'
    marker.setIcon(L.divIcon({
      className: `map-icon map-icon-${unit.type}`,
      html: mapIconHtml(unit.name, color, glyph, isLetter),
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -10],
    }))
  })
}, [unitStatuses, mapReady])
```

- [ ] **Step 8: Verify in browser**

Open `/comando`. Check:
- Unit markers on map appear colored by status (red for onscene, orange for enroute, grey for available)
- Clicking a unit in the sidebar focuses it on the map correctly
- No console errors

- [ ] **Step 9: Commit**

```bash
git add app/app/components/MapView.js
git commit -m "feat: MapView colors unit markers by status, fixes focusUnit for all units"
```

---

## Chunk 4: /meios Page

### Task 10: Create `UnitDetailPanel.js`

**Files:**
- Create: `app/app/components/UnitDetailPanel.js`

Slide-in panel showing unit details. Used on `/meios`. Props: `unit`, `unitStatuses`, `unitAssignments`, `allIncidents`, `assignUnit`, `unassignUnit`, `onClose`.

- [ ] **Step 1: Create the component**

```js
// app/app/components/UnitDetailPanel.js
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
```

- [ ] **Step 2: Add styles to `globals.css`**

```css
/* ── UnitDetailPanel ─────────────────────────────────────────── */
.unit-detail-panel {
  position: fixed;
  top: 44px; /* below NavBar */
  right: 0;
  width: 300px;
  height: calc(100vh - 44px);
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  z-index: 900;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.unit-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.unit-detail-title { font-weight: 600; font-size: 15px; }

.unit-detail-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.unit-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.unit-detail-label { color: var(--text-secondary); }
.unit-detail-value { color: var(--text-primary); }

.unit-detail-actions { padding: 16px; border-top: 1px solid var(--border); margin-top: auto; }

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
}
.icon-btn:hover { color: var(--text-primary); background: var(--bg-card-hover); }
```

- [ ] **Step 3: Commit**

```bash
git add app/app/components/UnitDetailPanel.js app/app/globals.css
git commit -m "feat: add UnitDetailPanel component"
```

---

### Task 11: Create `meios/page.js`

**Files:**
- Create: `app/app/meios/page.js`

Full-page unit management: type + status filters, search, summary strip, unit table with assign/unassign, Nova Unidade modal, query param pre-filtering, UnitDetailPanel slide-in.

- [ ] **Step 1: Create the file**

```js
// app/app/meios/page.js
'use client'

import { useMemo, useState } from 'react'
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

export default function MeiosPage() {
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
              <select className="form-input" value={novaType} onChange={e => setNovaType(e.target.value)}>
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
```

- [ ] **Step 2: Add styles to `globals.css`**

```css
/* ── /meios page ─────────────────────────────────────────────── */
.meios-page {
  padding: 56px 24px 24px; /* 44px navbar + 12px breathing room */
  min-height: 100vh;
  background: var(--bg-primary);
}

.meios-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.meios-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tab-btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}
.tab-btn:hover { background: var(--bg-card-hover); color: var(--text-primary); }
.tab-btn.active { background: var(--accent-blue); color: #fff; border-color: var(--accent-blue); }

.meios-search-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.meios-chip-row { margin-bottom: 8px; }

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: var(--bg-card-hover);
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-primary);
}

.chip-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 0 2px;
}

.meios-summary {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.meios-table-wrap { overflow-x: auto; }

.meios-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.meios-table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
  font-weight: 500;
}

.meios-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.meios-row { cursor: pointer; }
.meios-row:hover { background: var(--bg-card-hover); }
.meios-row.selected { background: var(--bg-card-hover); outline: 1px solid var(--accent-blue); }

.meios-unit-name { font-weight: 500; color: var(--text-primary); }

/* .meios-actions is a div inside <td> — using div avoids display:flex on <td> */
.meios-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.meios-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 32px;
}

/* Dropdown */
.dropdown-wrap { position: relative; display: inline-block; }

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 200;
  min-width: 220px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
}
.dropdown-item:hover { background: var(--bg-card-hover); }
.dropdown-item.current { color: var(--accent-blue); }

.dropdown-id { color: var(--text-secondary); font-size: 11px; }
.dropdown-empty { padding: 8px 12px; color: var(--text-secondary); font-size: 13px; }

/* NOTE: The following classes already exist in globals.css — DO NOT re-add them:
   .modal-overlay, .modal-box, .modal-header, .modal-body, .modal-footer,
   .form-label, .form-input, .form-input:focus, .btn-danger, .btn-danger:hover
   Adding duplicates would break existing z-index (modal-overlay uses 9000) and
   change global button styles. Only add the NEW classes below. */

/* modal-footer is needed if missing — check first, only add if absent */
```

**Important:** Before adding these styles, scan `globals.css` for any existing `.modal-overlay`, `.modal-box`, `.modal-header`, `.modal-body`, `.modal-footer`, `.form-label`, `.form-input` definitions. If any exist, skip those specific rules to avoid duplication. Only add what's missing.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/meios`. Check:
- All units from mockData appear in the table
- Type and status filter tabs filter correctly
- "Atribuir ▾" dropdown shows active incidents
- Selecting an incident assigns the unit (badge changes, status updates)
- "✕" unassigns the unit (status reverts to Disponível)
- Clicking a row opens `UnitDetailPanel` on the right
- "Gerir meios →" link on IncidentDetail in `/comando` navigates to `/meios?incident=INC-034` and pre-filters
- Open `/comando` in a second tab: assignment changes in `/meios` reflect in `/comando` within ~1 second (BroadcastChannel sync)
- "+ Nova Unidade" modal creates a unit that appears in the table
- NavBar active link highlights "Meios" when on this page

- [ ] **Step 4: Commit**

```bash
git add app/app/meios/page.js app/app/globals.css
git commit -m "feat: add /meios page with unit table, assignment actions, Nova Unidade modal"
```

---

## Final Verification

- [ ] **Check all routes work:**
  - `/comando` — map + panels, no regressions
  - `/meios` — unit table with full assignment flow
  - `/radio` — placeholder
  - `/alertas` — placeholder
  - `/relatorio` — placeholder
  - `/publico` — no NavBar

- [ ] **Check cross-tab sync:**
  Open `/meios` and `/comando` side-by-side. Assign a unit in `/meios`. Within 1 second, the unit status in `/comando` sidebar and map marker color should update.

- [ ] **Final commit if any loose ends remain**

```bash
git add -A
git commit -m "chore: tidy up multi-page architecture + unit assignment implementation"
```
