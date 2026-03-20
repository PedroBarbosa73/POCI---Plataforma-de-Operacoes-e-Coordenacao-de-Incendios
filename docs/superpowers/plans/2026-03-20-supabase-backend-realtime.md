# Supabase Backend & Real-time Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage/mock-data with Supabase — persistent data, real-time multi-user sync, email+password auth, deployed to Vercel.

**Architecture:** Supabase provides PostgreSQL + Auth + Realtime in one service. `usePociState` is rewritten to fetch from Supabase on mount and subscribe to row-level change events. All mutations write to Supabase directly; Realtime propagates changes to every connected client automatically.

**Tech Stack:** Next.js 14 (App Router), `@supabase/supabase-js`, `@supabase/ssr`, Supabase (free tier, EU region), Vercel

**Spec:** `docs/superpowers/specs/2026-03-20-supabase-backend-realtime.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/app/lib/supabase.js` | Browser Supabase client singleton |
| Create | `app/app/lib/useSupabaseUser.js` | Auth hook replacing `useSession` |
| Create | `app/supabase/schema.sql` | Full DDL — tables, triggers, RLS |
| Create | `app/scripts/seed.mjs` | One-time migration of mockData into Supabase |
| Rewrite | `app/middleware.js` | Supabase session check for protected routes |
| Rewrite | `app/app/login/page.js` | Email+password form |
| Rewrite | `app/app/providers.js` | Remove NextAuth SessionProvider |
| Modify | `app/app/layout.js` | Remove SessionProvider import |
| Delete | `app/app/api/auth/` | NextAuth route — no longer needed |
| Rewrite | `app/app/lib/usePociState.js` | All state from Supabase + Realtime subscriptions |
| Modify | `app/app/components/NavBar.js` | Replace `useSession`/`signOut` |
| Modify | `app/app/alertas/page.js` | Replace `useSession` guard |
| Modify | `app/app/radio/page.js` | Replace `useSession` guard + remove mockData import |
| Modify | `app/app/demo/page.js` | Replace `useSession` guard |
| Modify | `app/app/components/IncidentDetail.js` | Format `updated_at` timestamp |
| Modify | `app/app/components/PociApp.js` | Fix closure filter, remove `initialZones` merge, pass `allIncidents` to MapView |
| Modify | `app/app/components/MapView.js` | Accept `allIncidents`/`allFireStations` as props, remove mockData imports |
| Modify | `app/package.json` | Add `@supabase/supabase-js` `@supabase/ssr`, remove `next-auth` |

---

## Chunk 1: Supabase Project, Schema & Client

### Task 1: Install packages

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install Supabase packages and remove next-auth**

```bash
cd app
npm install @supabase/supabase-js @supabase/ssr
npm uninstall next-auth
```

Expected: `node_modules/@supabase/supabase-js` and `node_modules/@supabase/ssr` exist. `next-auth` removed from `node_modules`.

- [ ] **Step 2: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "deps: add @supabase/supabase-js @supabase/ssr, remove next-auth"
```

---

### Task 2: Write the SQL schema

**Files:**
- Create: `app/supabase/schema.sql`

- [ ] **Step 1: Create the schema file**

Create `app/supabase/schema.sql` with this content:

```sql
-- ── Shared updated_at trigger ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── incidents ─────────────────────────────────────────────────────────────
create table incidents (
  id             text primary key,
  name           text not null,
  status         text not null default 'active',
  lat            float8 not null,
  lng            float8 not null,
  area           text,
  type           text,
  brush_radius_km float8,
  wind_deg       int,
  updated_at     timestamptz default now()
);
create trigger incidents_updated_at before update on incidents
  for each row execute function update_updated_at();

-- ── incident_communications ───────────────────────────────────────────────
create table incident_communications (
  id          text primary key,
  incident_id text references incidents(id) on delete cascade,
  name        text not null,
  role        text not null
);

-- ── fire_stations ─────────────────────────────────────────────────────────
create table fire_stations (
  id   text primary key,
  name text not null,
  type text not null,
  lat  float8 not null,
  lng  float8 not null
);

-- ── units ─────────────────────────────────────────────────────────────────
create table units (
  id         text primary key,
  name       text not null,
  type       text not null,
  air_kind   text,
  base_lat   float8,
  base_lng   float8,
  station_id text references fire_stations(id)
);

-- ── unit_states ───────────────────────────────────────────────────────────
create table unit_states (
  unit_id     text primary key references units(id) on delete cascade,
  incident_id text references incidents(id),
  status      text not null default 'available',
  lat         float8,
  lng         float8,
  updated_at  timestamptz default now()
);
create trigger unit_states_updated_at before update on unit_states
  for each row execute function update_updated_at();

-- ── zones ─────────────────────────────────────────────────────────────────
create table zones (
  id          uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id) on delete cascade,
  name        text not null,
  type        text not null,
  radius_km   float8,
  points      jsonb,
  created_at  timestamptz default now()
);

-- ── closures ──────────────────────────────────────────────────────────────
create table closures (
  id          uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id),
  name        text not null,
  status      text not null default 'active',
  points      jsonb not null,
  created_at  timestamptz default now()
);

-- ── alerts ────────────────────────────────────────────────────────────────
create table alerts (
  id          uuid primary key default gen_random_uuid(),
  incident_id text references incidents(id),
  title       text not null,
  level       text not null,
  message     text,
  radius      int,
  channels    jsonb default '[]',
  status      text not null default 'active',
  created_at  timestamptz default now()
);

-- ── op_log ────────────────────────────────────────────────────────────────
create table op_log (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  payload     jsonb not null default '{}',
  incident_id text references incidents(id),
  unit_id     text references units(id),
  created_at  timestamptz default now()
);

-- ── Realtime ──────────────────────────────────────────────────────────────
alter table incidents          replica identity full;
alter table incident_communications replica identity full;
alter table fire_stations      replica identity full;
alter table units              replica identity full;
alter table unit_states        replica identity full;
alter table zones              replica identity full;
alter table closures           replica identity full;
alter table alerts             replica identity full;
alter table op_log             replica identity full;

alter publication supabase_realtime add table incidents;
alter publication supabase_realtime add table incident_communications;
alter publication supabase_realtime add table fire_stations;
alter publication supabase_realtime add table units;
alter publication supabase_realtime add table unit_states;
alter publication supabase_realtime add table zones;
alter publication supabase_realtime add table closures;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table op_log;

-- ── Row Level Security ────────────────────────────────────────────────────
alter table incidents              enable row level security;
alter table incident_communications enable row level security;
alter table fire_stations          enable row level security;
alter table units                  enable row level security;
alter table unit_states            enable row level security;
alter table zones                  enable row level security;
alter table closures               enable row level security;
alter table alerts                 enable row level security;
alter table op_log                 enable row level security;

-- Authenticated: full access to all tables
do $$
declare t text;
begin
  foreach t in array array[
    'incidents','incident_communications','fire_stations',
    'units','unit_states','zones','closures','alerts','op_log'
  ] loop
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- Anon: read-only on public-facing tables (used by /publico page)
create policy "anon_read" on incidents for select to anon using (true);
create policy "anon_read" on alerts    for select to anon using (true);
create policy "anon_read" on closures  for select to anon using (true);
```

- [ ] **Step 2: Apply schema in Supabase**

1. Go to [supabase.com](https://supabase.com) → create a new project (EU region, free tier)
2. Once created, go to **SQL Editor**
3. Paste the entire contents of `app/supabase/schema.sql` and click **Run**
4. Verify in **Table Editor** that all 9 tables exist

- [ ] **Step 3: Commit**

```bash
git add app/supabase/schema.sql
git commit -m "feat: Supabase schema — tables, realtime, RLS"
```

---

### Task 3: Supabase client singleton

**Files:**
- Create: `app/app/lib/supabase.js`

- [ ] **Step 1: Create the client file**

Create `app/app/lib/supabase.js`:

```js
import { createBrowserClient } from '@supabase/ssr'

let _client = null

export function getSupabase() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  }
  return _client
}
```

- [ ] **Step 2: Create `.env.local` for local dev**

Create `app/.env.local` (this file is gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Find these values in Supabase dashboard → **Project Settings → API**.

- [ ] **Step 3: Add .env.local to .gitignore if not already present**

```bash
cd app
grep -q '.env.local' .gitignore || echo '.env.local' >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add app/app/lib/supabase.js app/.gitignore
git commit -m "feat: Supabase browser client singleton"
```

---

## Chunk 2: Seed Migration

### Task 4: Write and run the seed script

**Files:**
- Create: `app/scripts/seed.mjs`

- [ ] **Step 1: Create the seed script**

Create `app/scripts/seed.mjs`:

```js
// One-time seed: reads mockData.js and inserts everything into Supabase
// Run: node app/scripts/seed.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load env from .env.local
const envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── Import mock data ──────────────────────────────────────────────────────────
// mockData.js uses browser-style ES modules — we need dynamic import
const mockDataPath = join(dirname(fileURLToPath(import.meta.url)), '../app/data/mockData.js')
const { incidents, units, alerts, radioMessages, fireStations, closures, initialZones } =
  await import(mockDataPath)

async function run() {
  console.log('Seeding Supabase...')

  // ── Fire stations ───────────────────────────────────────────────────────────
  const stationRows = fireStations.map(s => ({
    id: s.id, name: s.name, type: s.type, lat: s.lat, lng: s.lng,
  }))
  await upsert('fire_stations', stationRows)

  // ── Incidents + communications ──────────────────────────────────────────────
  const incidentRows = incidents.map(i => ({
    id: i.id,
    name: i.name,
    status: i.status,
    lat: i.lat,
    lng: i.lng,
    area: i.area ?? null,
    type: i.type ?? null,
    brush_radius_km: i.brushRadiusKm ?? null,
    wind_deg: i.windDeg ?? null,
  }))
  await upsert('incidents', incidentRows)

  const commRows = incidents.flatMap(i =>
    (i.communications ?? []).map(c => ({
      id: c.id, incident_id: i.id, name: c.name, role: c.role,
    }))
  )
  if (commRows.length) await upsert('incident_communications', commRows)

  // ── Units ───────────────────────────────────────────────────────────────────
  const unitRows = units.map(u => ({
    id: u.id,
    name: u.name,
    type: u.type,
    air_kind: u.airKind ?? null,
    base_lat: u.lat ?? null,
    base_lng: u.lng ?? null,
    station_id: u.stationId ?? null,
  }))
  await upsert('units', unitRows)

  // ── Unit states ─────────────────────────────────────────────────────────────
  const unitStateRows = units.map(u => ({
    unit_id: u.id,
    incident_id: u.incident ?? null,
    status: u.status ?? 'available',
    lat: u.lat ?? null,
    lng: u.lng ?? null,
  }))
  await upsert('unit_states', unitStateRows)

  // ── Zones ───────────────────────────────────────────────────────────────────
  if (initialZones) {
    const zoneRows = Object.entries(initialZones).flatMap(([incidentId, zones]) =>
      (zones ?? []).map(z => ({
        id: z.id ?? undefined,
        incident_id: incidentId,
        name: z.name,
        type: z.type,
        radius_km: z.radiusKm ?? null,
        points: z.points ?? null,
      }))
    )
    if (zoneRows.length) await upsert('zones', zoneRows)
  }

  // ── Closures ─────────────────────────────────────────────────────────────────
  if (closures?.length) {
    const closureRows = closures.map(c => ({
      incident_id: c.incidentId ?? null,
      name: c.name,
      status: c.status ?? 'active',
      points: c.path ?? c.points ?? [],  // mockData uses `path`, schema uses `points`
    }))
    await upsert('closures', closureRows)
  }

  // ── Alerts ───────────────────────────────────────────────────────────────────
  const alertRows = alerts.map(a => ({
    incident_id: a.incidentId ?? null,
    title: a.title,
    level: a.level,
    message: a.message ?? null,
    radius: a.radius ?? null,
    channels: a.channels ?? [],
    status: a.status ?? 'active',
  }))
  await upsert('alerts', alertRows)

  // ── Op log (radio messages + history) ─────────────────────────────────────
  const now = Date.now()
  const logRows = []

  // Radio messages
  radioMessages.forEach((m, i) => {
    logRows.push({
      type: 'radio_message',
      payload: { from: m.from, message: m.msg, incident_id: m.incidentId ?? null },
      incident_id: m.incidentId ?? null,
      created_at: new Date(now - (4 * 3600 * 1000) + i * 28 * 60 * 1000).toISOString(),
    })
  })

  // Unit assignment history
  const assigned = units.filter(u => u.status !== 'available' && u.incident)
  assigned.forEach((u, i) => {
    const baseTs = now - (6 * 3600 * 1000) + Math.floor((i / assigned.length) * 5.5 * 3600 * 1000)
    logRows.push({
      type: 'unit_assigned',
      payload: { unit_id: u.id, incident_id: u.incident, unit_name: u.name },
      incident_id: u.incident,
      unit_id: u.id,
      created_at: new Date(baseTs).toISOString(),
    })
    if (u.status === 'enroute' || u.status === 'onscene') {
      logRows.push({
        type: 'status_changed',
        payload: { unit_id: u.id, from: 'assigned', to: u.status },
        unit_id: u.id,
        incident_id: u.incident,
        created_at: new Date(baseTs + 5 * 60 * 1000).toISOString(),
      })
    }
  })

  if (logRows.length) {
    const { error } = await supabase.from('op_log').insert(logRows)
    if (error) console.error('op_log error:', error.message)
    else console.log(`  op_log: inserted ${logRows.length} rows`)
  }

  console.log('Seed complete.')
}

async function upsert(table, rows) {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
  if (error) console.error(`${table} error:`, error.message)
  else console.log(`  ${table}: upserted ${rows.length} rows`)
}

run().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Run the seed script**

```bash
cd app
node scripts/seed.mjs
```

Expected output:
```
Seeding Supabase...
  fire_stations: upserted N rows
  incidents: upserted 4 rows
  incident_communications: upserted N rows
  units: upserted ~120 rows
  unit_states: upserted ~120 rows
  zones: upserted N rows
  alerts: upserted N rows
  op_log: inserted N rows
Seed complete.
```

If any table errors appear, check the error message and fix the row shape.

- [ ] **Step 3: Verify in Supabase Table Editor**

Open Supabase dashboard → Table Editor → check that `incidents` has 4 rows, `units` has rows, etc.

- [ ] **Step 4: Commit**

```bash
git add app/scripts/seed.mjs
git commit -m "feat: seed migration script for Supabase"
```

---

## Chunk 3: Auth Migration

### Task 5: Rewrite middleware

**Files:**
- Rewrite: `app/middleware.js`

- [ ] **Step 1: Replace middleware**

Overwrite `app/middleware.js`:

```js
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

const PROTECTED = ['/comando', '/meios', '/radio', '/alertas', '/relatorio', '/demo']

export async function middleware(request) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|api).*)'],
}
```

- [ ] **Step 2: Verify dev server starts without error**

```bash
cd app && npm run dev
```

Expected: no import errors, server starts on port 3000. Visiting `/comando` should redirect to `/login`.

- [ ] **Step 3: Commit**

```bash
git add app/middleware.js
git commit -m "feat: replace NextAuth middleware with Supabase session check"
```

---

### Task 6: Rewrite login page

**Files:**
- Rewrite: `app/app/login/page.js`

- [ ] **Step 1: Overwrite the login page**

The current page has a Microsoft Azure AD button. Replace it entirely with an email+password form that preserves all the existing left-panel branding CSS:

```jsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/comando')
    router.refresh()
  }

  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-container">

        {/* Left panel — branding (unchanged) */}
        <div className="login-brand">
          <div className="login-brand-logo">
            <div className="login-logo-icon">PO</div>
            <div>
              <div className="login-logo-text">POCI</div>
              <div className="login-logo-sub">Plataforma de Coordenação de Incêndios</div>
            </div>
          </div>
          <div className="login-brand-body">
            <div className="login-brand-headline">
              Quadro comum de situação para o combate a incêndios rurais
            </div>
            <div className="login-brand-desc">
              A POCI centraliza a informação operacional — incidentes, unidades,
              zonas táticas e meteorologia — numa plataforma única acessível a
              todas as entidades de comando.
            </div>
            <div className="login-feature-list">
              <div className="login-feature"><span className="login-feature-dot dot-red" />Mapa operacional em tempo real</div>
              <div className="login-feature"><span className="login-feature-dot dot-orange" />GPS de unidades e meios aéreos</div>
              <div className="login-feature"><span className="login-feature-dot dot-blue" />Alertas e comunicação à população</div>
              <div className="login-feature"><span className="login-feature-dot dot-green" />Meteorologia associada a cada ocorrência</div>
            </div>
          </div>
          <div className="login-brand-footer">
            Projeto independente em fase de demonstração · Não utilizado em operações reais
          </div>
        </div>

        {/* Right panel — email/password form */}
        <div className="login-auth">
          <div className="login-auth-card">
            <div className="login-auth-title">Acesso restrito</div>
            <div className="login-auth-sub">
              Esta plataforma é reservada a equipas de comando, entidades de
              Proteção Civil e parceiros autorizados.
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                className="form-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                className="form-input"
                type="password"
                placeholder="Palavra-passe"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              {error && (
                <div style={{ color: 'var(--accent-red)', fontSize: '13px' }}>{error}</div>
              )}
              <button className="login-entra-btn" type="submit" disabled={loading}>
                {loading ? 'A entrar...' : 'Entrar'}
              </button>
            </form>

            <div className="login-auth-divider"><span>ou</span></div>
            <Link href="/publico" className="login-public-btn">Ver vista pública</Link>
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create a user in Supabase dashboard**

Go to Supabase → **Authentication → Users → Add user**:
- Email: `admin@poci.pt`
- Password: choose a secure password
- Check "Auto Confirm User"

- [ ] **Step 3: Test login locally**

Open `http://localhost:3000/login`, enter the credentials, verify redirect to `/comando`.

- [ ] **Step 4: Commit**

```bash
git add app/app/login/page.js
git commit -m "feat: replace Azure AD login with Supabase email/password form"
```

---

### Task 7: Remove NextAuth providers

**Files:**
- Rewrite: `app/app/providers.js`
- Modify: `app/app/layout.js`
- Delete: `app/app/api/auth/`

- [ ] **Step 1: Simplify providers.js**

Replace `app/app/providers.js` with:

```jsx
'use client'
export default function Providers({ children }) {
  return <>{children}</>
}
```

- [ ] **Step 2: Remove SessionProvider from layout.js**

In `app/app/layout.js`, the file already wraps children with `<Providers>` — no import change needed since `Providers` is now a passthrough. Verify the file has no remaining `next-auth` imports:

```bash
grep -n "next-auth" app/app/layout.js
```

Expected: no output.

- [ ] **Step 3: Delete the NextAuth API route**

```bash
rm -rf app/app/api/auth
```

- [ ] **Step 4: Verify dev server still starts**

```bash
cd app && npm run dev
```

No errors expected.

- [ ] **Step 5: Commit**

```bash
git add app/app/providers.js app/app/layout.js
git rm -r app/app/api/auth
git commit -m "feat: remove NextAuth — providers, API route, SessionProvider"
```

---

### Task 8: useSupabaseUser hook + component sweep

**Files:**
- Create: `app/app/lib/useSupabaseUser.js`
- Modify: `app/app/components/NavBar.js`
- Modify: `app/app/alertas/page.js`
- Modify: `app/app/radio/page.js`
- Modify: `app/app/demo/page.js`

- [ ] **Step 1: Create useSupabaseUser hook**

Create `app/app/lib/useSupabaseUser.js`:

```js
'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from './supabase'

export function useSupabaseUser() {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading: user === undefined }
}
```

- [ ] **Step 2: Update NavBar.js**

Replace the `next-auth/react` import and usage in `app/app/components/NavBar.js`:

Find and replace the import:
```js
// REMOVE:
import { signOut, useSession } from 'next-auth/react'

// ADD:
import { useSupabaseUser } from '../lib/useSupabaseUser'
import { getSupabase } from '../lib/supabase'
```

Replace `UserChip`:
```jsx
function UserChip() {
  const { user } = useSupabaseUser()
  if (!user) return null
  const name = user.email ?? 'Utilizador'
  const initials = name.split('@')[0].slice(0, 2).toUpperCase()
  return (
    <div className="navbar-user">
      <div className="navbar-avatar">{initials}</div>
      <span className="navbar-username">{name.split('@')[0]}</span>
    </div>
  )
}
```

Replace `signOut()` call:
```jsx
// REMOVE:
<button className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sair</button>

// ADD:
<button className="btn btn-ghost btn-sm" onClick={() => getSupabase().auth.signOut().then(() => window.location.href = '/login')}>Sair</button>
```

- [ ] **Step 3: Update alertas/page.js auth guard**

In `app/app/alertas/page.js`, replace:
```js
// REMOVE at top of AlertasPageInner (or the wrapper component):
import { useSession } from 'next-auth/react'
// ...
const { status } = useSession()
if (status === 'loading') return null
if (status === 'unauthenticated') redirect('/login')
```

With — add this import at the top of the file:
```js
import { useSupabaseUser } from '../lib/useSupabaseUser'
```

Replace the wrapper:
```jsx
// REMOVE:
export default function AlertasPage() {
  const { status } = useSession()
  if (status === 'loading') return null
  if (status === 'unauthenticated') redirect('/login')
  return <AlertasPageInner />
}

// ADD:
export default function AlertasPage() {
  const { user, loading } = useSupabaseUser()
  if (loading) return null
  if (!user) { redirect('/login'); return null }
  return <AlertasPageInner />
}
```

- [ ] **Step 4: Update radio/page.js — auth guard + remove mockData import**

In `app/app/radio/page.js`:

1. Remove the mockData import and the local `allIncidents` merge:
```js
// REMOVE these two lines:
import { incidents as mockIncidents } from '../data/mockData'
// and inside RadioPageInner:
const allIncidents = useMemo(() => [...mockIncidents, ...customIncidents], [customIncidents])
```

2. Update the `usePociState` destructure to use `allIncidents` directly:
```js
// CHANGE:
const { opLog, appendLog, customIncidents } = usePociState()
// TO:
const { opLog, appendLog, allIncidents } = usePociState()
```

3. Replace the auth wrapper at the bottom:
```jsx
import { useSupabaseUser } from '../lib/useSupabaseUser'

export default function RadioPage() {
  const { user, loading } = useSupabaseUser()
  if (loading) return null
  if (!user) { redirect('/login'); return null }
  return <RadioPageInner />
}
```

- [ ] **Step 5: Update demo/page.js auth guard**

Same pattern in `app/app/demo/page.js`.

- [ ] **Step 6: Verify all pages load**

Start dev server, visit `/alertas`, `/radio`, `/demo` — should all require login and redirect if unauthenticated.

- [ ] **Step 7: Commit**

```bash
git add app/app/lib/useSupabaseUser.js app/app/components/NavBar.js \
  app/app/alertas/page.js app/app/radio/page.js app/app/demo/page.js
git commit -m "feat: replace next-auth useSession with useSupabaseUser across all pages"
```

---

## Chunk 4: Data Layer Rewrite

### Task 9: Rewrite usePociState

**Files:**
- Rewrite: `app/app/lib/usePociState.js`

This is the most critical task. The new hook fetches all data from Supabase on mount, subscribes to realtime changes, and exposes the same write API as before — but backed by Supabase instead of localStorage.

- [ ] **Step 1: Write the new usePociState**

Overwrite `app/app/lib/usePociState.js` with:

```js
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
      ] = await Promise.all([
        supabase.from('incidents').select('*'),
        supabase.from('units').select('*'),
        supabase.from('unit_states').select('*'),
        supabase.from('zones').select('*'),
        supabase.from('closures').select('*'),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }),
        supabase.from('op_log').select('*').order('created_at', { ascending: false }).limit(500),
      ])
      if (inc)  setIncidents(inc)
      if (u)    setUnits(u)
      if (us)   setUnitStates(us)
      if (z)    setZones(z)
      if (cl)   setClosures(cl)
      if (al)   setAlerts(al)
      if (log)  setOpLog(log)

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
      return {
        ...u,
        airKind: u.air_kind,
        stationId: u.station_id,
        lat: us?.lat ?? u.base_lat,
        lng: us?.lng ?? u.base_lng,
        status: us?.status ?? 'available',
        incident: us?.incident_id ?? null,
      }
    }),
    [units, unitStates]
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
    await appendLog({ type: 'status_changed', unitId, incidentId: us?.incident_id ?? null, payload: { to: status } })
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

    // Mutations
    assignUnit,
    unassignUnit,
    setUnitStatus,
    appendLog,
    addAlert,
    resolveAlert,
    deleteZone,
    deleteClosure,

    // Scenario
    demoMode, setDemoMode,
    scenarioActive, currentStep,
    terminateScenario,
    executeStep, revertStep,

    hydrated,
  }
}
```

- [ ] **Step 2: Start dev server and open /comando**

```bash
cd app && npm run dev
```

Open `http://localhost:3000/comando`. The map should load with incidents from Supabase. Check the browser console for any errors.

- [ ] **Step 3: Verify unit assignment works**

Go to `/meios`, assign a unit to an incident. Open a second browser tab at the same URL. The unit's status should update in both tabs within ~1 second.

- [ ] **Step 4: Commit**

```bash
git add app/app/lib/usePociState.js
git commit -m "feat: rewrite usePociState — Supabase queries, realtime subscriptions, same write API"
```

---

### Task 10: Fix IncidentDetail updated_at display

**Files:**
- Modify: `app/app/components/IncidentDetail.js`

- [ ] **Step 1: Format updated_at timestamp**

In `app/app/components/IncidentDetail.js`, find the line:
```jsx
<div className="inc-detail-updated">Atualizado {incident.updated}</div>
```

Replace with:
```jsx
<div className="inc-detail-updated">
  Atualizado {incident.updated_at
    ? new Date(incident.updated_at).toLocaleString('pt-PT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
    : incident.updated ?? '—'}
</div>
```

- [ ] **Step 2: Verify in browser**

Open an incident detail panel — the "Atualizado" line should show a real timestamp like "20 mar, 14:32".

- [ ] **Step 3: Commit**

```bash
git add app/app/components/IncidentDetail.js
git commit -m "fix: format updated_at timestamp in IncidentDetail"
```

---

---

### Task 11: Fix PociApp.js — closure filter and initialZones merge

**Files:**
- Modify: `app/app/components/PociApp.js`

After migration all incidents and zones come from Supabase. Two spots in PociApp.js still rely on mock-data assumptions.

- [ ] **Step 1: Remove the initialZones merge**

Find the `zonesByIncident` useMemo in `app/app/components/PociApp.js` (around line 75):

```js
// CURRENT (merges hard-coded mockData initialZones — will double-count after migration):
const zonesByIncident = useMemo(() => {
  const merged = { ...initialZones };
  Object.entries(drawnZonesByIncident).forEach(([id, zones]) => {
    merged[id] = [...(merged[id] || []), ...zones];
  });
  return merged;
}, [drawnZonesByIncident]);
```

Replace with:

```js
// After migration drawnZonesByIncident already contains all zones from Supabase
const zonesByIncident = drawnZonesByIncident;
```

Also remove the `initialZones` import from the top of the file:
```js
// REMOVE from import:
import { incidents, closures, initialZones } from '../data/mockData';
// KEEP only what is still needed (nothing from mockData after this task):
// The incidents and closures imports are handled in MapView — PociApp no longer needs them
```

Remove the entire `import { incidents, closures, initialZones } from '../data/mockData'` line from PociApp.js.

- [ ] **Step 2: Fix the closure filter**

Find the `visibleClosures` useMemo in `app/app/components/PociApp.js` (around line 112):

```js
// CURRENT (uses c.incident — mockData field name):
const visibleClosures = useMemo(() => {
  const allClosures = [...closures, ...drawnClosures];
  if (!selectedIncidentId) return allClosures;
  return allClosures.filter((c) => c.incident === selectedIncidentId);
}, [selectedIncidentId, drawnClosures]);
```

Replace with:

```js
// After migration drawnClosures contains all closures; field is incidentId (normalised in usePociState)
const visibleClosures = useMemo(() => {
  if (!selectedIncidentId) return drawnClosures;
  return drawnClosures.filter((c) => c.incidentId === selectedIncidentId || c.incident_id === selectedIncidentId);
}, [selectedIncidentId, drawnClosures]);
```

- [ ] **Step 3: Pass allIncidents to MapView**

In the MapView JSX in PociApp.js, add the `allIncidents` prop:

```jsx
<MapView
  {/* ...existing props... */}
  allIncidents={allIncidents}
  allFireStations={[]}  {/* fireStations will be fetched by MapView via usePociState in Task 12 */}
/>
```

- [ ] **Step 4: Verify no remaining mockData imports in PociApp.js**

```bash
grep "mockData" app/app/components/PociApp.js
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/app/components/PociApp.js
git commit -m "fix: PociApp — remove initialZones merge, fix closure filter, remove mockData imports"
```

---

### Task 12: Fix MapView.js — remove mockData imports, use props

**Files:**
- Modify: `app/app/components/MapView.js`

MapView imports `incidents`, `units`, `closures`, `fireStations` directly from mockData. After migration these must come from props (already passed from PociApp).

- [ ] **Step 1: Add allIncidents and allFireStations to MapView props**

In `app/app/components/MapView.js`, update the props destructuring (around line 8):

```js
// ADD to props:
const MapView = forwardRef(function MapView(
  {
    // ...existing props...
    allIncidents = [],       // replaces imported incidents
    allFireStations = [],    // replaces imported fireStations
    // allUnits already exists as a prop
    // drawnClosures already exists as a prop
  },
  ref
) {
```

- [ ] **Step 2: Remove the mockData import line**

Delete line 4:
```js
// DELETE:
import { incidents, units, closures, fireStations } from '../data/mockData';
```

- [ ] **Step 3: Replace all usages of imported variables**

Search for all usages of the four imported names and replace with prop equivalents:

```bash
grep -n "\bincidents\b\|\bunits\b\|\bclosures\b\|\bfireStations\b" app/app/components/MapView.js
```

For each match:
- `incidents` → `allIncidents`
- `units` → `allUnits` (already a prop)
- `closures` → `drawnClosures` (already a prop; mockData closures use `.path`, Supabase closures use `.points` — in the Leaflet polyline call update `closure.path` to `closure.path ?? closure.points`)
- `fireStations` → `allFireStations`

Key spots to update:
- Line 160: `const allIncs = [...incidents, ...]` → `const allIncs = allIncidents`
- Line 242: `incidents.forEach(...)` → `allIncidents.forEach(...)`
- Line 262: `incidents.forEach(...)` → `allIncidents.forEach(...)`
- Line 278: `units.forEach(...)` → `allUnits.forEach(...)`
- Line 298: `closures.forEach(...)` → `drawnClosures.forEach(...)`
- Line 299: `closure.path` → `closure.path ?? closure.points ?? []`
- Line 311: `fireStations.forEach(...)` → `allFireStations.forEach(...)`
- Line 432: `incidents.map(...)` → `allIncidents.map(...)`
- Line 434: `incidents.find(...)` → `allIncidents.find(...)`
- Line 777: `units.find(...)` → `allUnits.find(...)`
- Line 817: `closures.find(...)` → `drawnClosures.find(...)`
- Line 818: `closure.incident` → `closure.incident_id ?? closure.incident`

- [ ] **Step 4: Add allFireStations to usePociState and PociApp**

`usePociState` needs to expose `fireStations`:

In `app/app/lib/usePociState.js`, add to the initial load:
```js
const [fireStations, setFireStations] = useState([])
// in load():
const { data: fs } = await supabase.from('fire_stations').select('*')
if (fs) setFireStations(fs)
// add realtime subscription for fire_stations
// in return:
fireStations,
```

In `app/app/components/PociApp.js`, destructure `fireStations` from `usePociState()` and pass to MapView:
```jsx
allFireStations={fireStations}
```

- [ ] **Step 5: Verify map renders correctly**

Open `http://localhost:3000/comando`. The map should show incident perimeters, unit markers, and closure lines from Supabase data (not mock data).

- [ ] **Step 6: Commit**

```bash
git add app/app/components/MapView.js app/app/lib/usePociState.js app/app/components/PociApp.js
git commit -m "fix: MapView — replace mockData imports with props, use allIncidents/allFireStations"
```

---

## Chunk 5: Deployment

### Task 11: Deploy to Vercel

**Files:**
- `app/.env.local` (local only, not committed)

- [ ] **Step 1: Build locally to catch any errors**

```bash
cd app && npm run build
```

Fix any TypeScript/ESLint errors before deploying.

- [ ] **Step 2: Deploy to Vercel**

```bash
cd app && npx vercel --prod --yes
```

When prompted for project settings:
- Framework: Next.js (auto-detected)
- Root directory: `./` (you are already in `app/`)

- [ ] **Step 3: Set environment variables in Vercel**

Go to Vercel dashboard → your project → **Settings → Environment Variables**. Add:
- `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
- `SUPABASE_SERVICE_ROLE_KEY` = your service role key (mark as **Server** only)

- [ ] **Step 4: Redeploy after setting env vars**

```bash
npx vercel --prod --yes
```

- [ ] **Step 5: Verify deployment**

Open the Vercel URL in two different browsers (or incognito). Log in with `admin@poci.pt` credentials. Assign a unit in one window — verify it updates in the other within 1 second.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: Supabase backend + realtime — production deployment"
```

---

## Verification Checklist

- [ ] Login works with Supabase email/password
- [ ] `/publico` accessible without login
- [ ] All protected routes (`/comando`, `/meios`, `/radio`, `/alertas`, `/relatorio`, `/demo`) redirect to `/login` when unauthenticated
- [ ] Map loads with real incidents from Supabase
- [ ] Units appear on map with correct positions and status colours
- [ ] Assigning a unit in tab A updates tab B within ~1 second
- [ ] Adding an alert in tab A appears in tab B
- [ ] Radio log entries appear in both tabs
- [ ] Drawing a zone persists after page refresh
- [ ] Demo/scenario player still works
- [ ] Signing out redirects to `/login`
