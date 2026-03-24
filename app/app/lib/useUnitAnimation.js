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

// Module-level route cache — persists across demo runs for the same coordinates
const globalRouteCache = new Map()

export function useUnitAnimation({ onUnitArrived } = {}) {
  const [animatedPositions, setAnimatedPositions] = useState({})
  // { [unitId]: { waypoints: [[lng,lat],...], waypointIndex, subProgress, speedKmh } }
  const unitRoutesRef = useRef({})
  // Use module-level cache so routes survive across demo runs
  const routeCacheRef = useRef(globalRouteCache)
  const arrivedRef = useRef(new Set())
  const onUnitArrivedRef = useRef(onUnitArrived)
  useEffect(() => { onUnitArrivedRef.current = onUnitArrived }, [onUnitArrived])

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
          if (!arrivedRef.current.has(unitId)) {
            arrivedRef.current.add(unitId)
            onUnitArrivedRef.current?.(unitId)
          }
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

  // fromPos: optional [lat, lng] override for the start position (e.g. a fire station)
  async function startUnitMovement(unit, incident, fromPos = null) {
    const startLat = fromPos ? fromPos[0] : unit.lat
    const startLng = fromPos ? fromPos[1] : unit.lng
    // Key by coordinates only — routes reuse across demo runs to the same destination
    const cacheKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}:${incident.lat.toFixed(4)},${incident.lng.toFixed(4)}`

    // Snap marker to start position immediately
    setAnimatedPositions(prev => ({ ...prev, [unit.id]: [startLat, startLng] }))

    // Start with straight-line so movement begins instantly
    const straightLine = [[startLng, startLat], [incident.lng, incident.lat]]
    unitRoutesRef.current[unit.id] = {
      waypoints: straightLine,
      waypointIndex: 0,
      subProgress: 0,
      speedKmh: getSpeedKmh(unit),
    }

    // Skip OSRM for air units
    if (unit.type === 'air') {
      routeCacheRef.current.set(cacheKey, straightLine)
      return
    }

    // Check cache first
    const cached = routeCacheRef.current.get(cacheKey)
    if (cached) {
      unitRoutesRef.current[unit.id] = { ...unitRoutesRef.current[unit.id], waypoints: cached }
      return
    }

    // Fetch real route in background — upgrade when ready
    fetchRoute(startLng, startLat, incident.lng, incident.lat).then(waypoints => {
      routeCacheRef.current.set(cacheKey, waypoints)
      // Only upgrade if unit is still moving toward this incident
      if (unitRoutesRef.current[unit.id]) {
        unitRoutesRef.current[unit.id] = {
          ...unitRoutesRef.current[unit.id],
          waypoints,
          waypointIndex: 0,
          subProgress: 0,
        }
      }
    })
  }

  // restorePos: optional [lat, lng] to move the marker back to on stop
  function stopUnitMovement(unitId, restorePos = null) {
    delete unitRoutesRef.current[unitId]
    arrivedRef.current.delete(unitId)
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
    setAnimatedPositions({})
  }

  return { animatedPositions, startUnitMovement, stopUnitMovement, clearAllMovement }
}
