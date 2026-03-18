# POCI — Multi-Page Architecture + Unit Assignment
**Date:** 2026-03-18
**Status:** Approved

## Overview

POCI is a real fire operations coordination tool currently in MVP/demo phase. The goal is to build toward a complete fire operations simulation — real features first, simulation engine later (Operations First sequence).

This spec covers the first major architectural step: introducing a multi-page structure and building the `/meios` (unit management + assignment) page as the first new page.

---

## Context & Motivation

The current app is a single-page coordination view (`/comando`). As the tool grows toward real use, different operators in a command center will work different screens simultaneously — one operator manages unit assignments on a dedicated monitor, another watches the map, a radio operator handles communications. Having all of this in one page becomes unusable at scale (real fires can involve 1000+ units).

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

### State extraction

All shared state is extracted from `PociApp.js` into a `usePociState` hook at `app/app/lib/usePociState.js`. All pages import this hook. `PociApp.js` becomes a thin wrapper.

**Existing localStorage keys (unchanged):**
- `poci_drawnZones`
- `poci_drawnClosures`
- `poci_customIncidents`

**New localStorage keys:**
- `poci_unitAssignments` — `{ [unitId]: incidentId | null }` — which incident each unit is assigned to
- `poci_unitStatuses` — `{ [unitId]: 'available' | 'assigned' | 'enroute' | 'onscene' }` — current operational status

**Initial values:** Seeded from `mockData.js` units on first load (units already have `incident` and `status` fields).

### BroadcastChannel sync

When `usePociState` writes to localStorage, it also broadcasts a `poci-state-changed` message on a `BroadcastChannel('poci')`. All other open tabs receive the message and re-read from localStorage. This enables real-time cross-monitor sync with zero backend.

```js
// on write
channel.postMessage({ type: 'poci-state-changed', key })

// on receive
channel.onmessage = () => { /* re-read from localStorage */ }
```

### Derived values

- `allUnits` — mock units from `mockData.js` merged with any custom units added via `/meios`
- `unitsByIncident(incidentId)` — derived from `unitAssignments`, replaces the static `inc.units` count
- `availableUnits` — units with no current assignment

---

## Section 2 — Navigation & Shared Layout

### NavBar component

A new `NavBar` component (`app/app/components/NavBar.js`) is rendered in the root `app/app/layout.js`. It sits above all pages.

```
[PO] POCI  |  Situação   Meios   Rádio   Alertas   Relatório  |  [Sair]  [Exportar]  [Nova Ocorrência]
```

- Logo + app name on the left
- Page links in the centre (Next.js `<Link>`, active page highlighted)
- Auth + action buttons on the right (moved from `AppHeader.js`)
- Slim bar — does not intrude on page content

### Page inventory

| Route | Component | Status |
|---|---|---|
| `/comando` | `PociApp.js` (existing) | Existing — minor updates |
| `/meios` | `MeiosPage.js` (new) | Built in this spec |
| `/radio` | placeholder | "Em construção" |
| `/alertas` | placeholder | "Em construção" |
| `/relatorio` | placeholder | "Em construção" |

### `/comando` layout change

`AppHeader.js` is simplified — status pills and map-specific toolbar buttons stay. Nav links and auth buttons move to `NavBar`. The overall map + sidebar layout is unchanged.

---

## Section 3 — `/meios` Page

### Layout

Full-width page, no map. Two areas:

**Top bar — filters + search:**
```
[ Todos | Bombeiros | GNR | Aéreo | Municipal | Outro ]   (type filter)
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

### Interactions

**Atribuir ▾** (available unit) → inline dropdown listing all active incidents → select one → unit `status` becomes `assigned`, `unitAssignments[unitId]` set to `incidentId`

**Mover ▾** (already assigned unit) → same dropdown, pre-selected on current incident → select new incident → assignment updates, status stays `assigned`

**✕** (unassign) → `unitAssignments[unitId]` set to `null`, status becomes `available`

**Row click** → unit detail panel slides in from right:
- Name, type, ID
- Current status badge
- Assigned incident (with link to `/comando` focused on that incident)
- (Future: assignment history)

**+ Nova Unidade** → modal with fields: name, type (select), optional lat/lng → adds to `customUnits` localStorage key

### File: `app/app/meios/page.js`

Uses `usePociState` hook. Renders `MeiosPage` component. No map import.

---

## Section 4 — `/comando` Updates

Minimal changes — the map and drawing tools are untouched.

**State:** `PociApp.js` switches to `usePociState` hook instead of inline `useState` calls for `customIncidents`, `drawnZonesByIncident`, `drawnClosures`. New `unitAssignments` and `unitStatuses` come from the same hook.

**UnitsPanel:** Already reads from `visibleUnits`. Now unit status and assignment come from `unitStatuses` / `unitAssignments` instead of static mockData fields. Real-time updates via BroadcastChannel.

**Map markers:** Unit marker color reflects `unitStatuses[unit.id]`:
- `available` → grey
- `assigned` → yellow
- `enroute` → orange
- `onscene` → red (existing)

**IncidentDetail:** Unit count derived from `unitsByIncident(selectedIncidentId).length` instead of static `inc.units`. Adds a small **"Gerir meios →"** link that opens `/meios?incident=INC-034` (pre-filtered).

---

## Data Model

```js
// poci_unitAssignments (localStorage)
{
  "BVP-12": "INC-034",
  "BVP-01": "INC-034",
  "PCM-03": "INC-031",
  "LOG-08": null          // unassigned
}

// poci_unitStatuses (localStorage)
{
  "BVP-12": "onscene",
  "BVP-01": "onscene",
  "BVP-04": "enroute",
  "PCM-03": "available"
}

// poci_customUnits (localStorage) — new
[
  { id: "CUST-U-1234", name: "B.V. Pombal", type: "bombeiros", lat: 39.9, lng: -8.6 }
]
```

---

## Files Changed / Created

| File | Change |
|---|---|
| `app/app/layout.js` | Add `NavBar` render |
| `app/app/components/NavBar.js` | New — page navigation bar |
| `app/app/lib/usePociState.js` | New — shared state hook with BroadcastChannel |
| `app/app/components/PociApp.js` | Refactor to use `usePociState` |
| `app/app/components/AppHeader.js` | Remove nav/auth buttons (moved to NavBar) |
| `app/app/components/panels/UnitsPanel.js` | Read status/assignment from hook |
| `app/app/components/IncidentDetail.js` | Dynamic unit count + "Gerir meios" link |
| `app/app/components/MapView.js` | Unit marker colors from unitStatuses |
| `app/app/meios/page.js` | New — `/meios` route |
| `app/app/components/MeiosPage.js` | New — unit table, filters, assignment UI |
| `app/app/radio/page.js` | New — placeholder |
| `app/app/alertas/page.js` | New — placeholder |
| `app/app/relatorio/page.js` | New — placeholder |

---

## Out of Scope (this spec)

- Unit movement animation on map (simulation engine)
- Assignment history log (next spec)
- Status editing for incidents (next spec)
- Backend persistence — localStorage + BroadcastChannel is sufficient for now
- Drone / aerial page
