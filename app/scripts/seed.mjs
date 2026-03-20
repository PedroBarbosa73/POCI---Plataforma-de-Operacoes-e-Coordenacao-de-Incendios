// One-time seed: reads mockData.js and inserts everything into Supabase
// Run: node app/scripts/seed.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load env from .env.local
const envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── Import mock data ──────────────────────────────────────────────────────────
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
      incident_id: c.incident ?? c.incidentId ?? null,  // mockData uses `incident`, not `incidentId`
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
