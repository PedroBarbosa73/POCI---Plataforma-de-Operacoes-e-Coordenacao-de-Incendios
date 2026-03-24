'use client'

import { useEffect, useRef, useState } from 'react'

const DEFAULT_LAT = 40.38   // Guarda / Serra da Estrela
const DEFAULT_LNG = -7.54

function degToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  return `há ${Math.floor(diff / 3600)}h`
}

export function useWeather(lat, lng) {
  const [weather, setWeather] = useState(null)
  const fetchedAtRef = useRef(null)

  const resolvedLat = (lat != null ? lat : DEFAULT_LAT).toFixed(4)
  const resolvedLng = (lng != null ? lng : DEFAULT_LNG).toFixed(4)

  useEffect(() => {
    async function fetchWeather() {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${resolvedLat}&longitude=${resolvedLng}` +
          `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
          `&wind_speed_unit=kmh&timezone=Europe%2FLisbon`
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error('non-200')
        const data = await res.json()
        const c = data.current
        const now = Date.now()
        fetchedAtRef.current = now
        setWeather({
          windSpeed: Math.round(c.wind_speed_10m),
          gusts: Math.round(c.wind_gusts_10m),
          temperature: Math.round(c.temperature_2m),
          humidity: Math.round(c.relative_humidity_2m),
          direction: degToCompass(c.wind_direction_10m),
          directionDeg: c.wind_direction_10m,
          updated: timeAgo(now),
        })
      } catch {
        // keep previous data on network error
      }
    }

    fetchWeather()
    const id = setInterval(fetchWeather, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [resolvedLat, resolvedLng])

  // Refresh the "updated X min ago" label every minute
  useEffect(() => {
    const id = setInterval(() => {
      if (fetchedAtRef.current) {
        setWeather(prev => prev ? { ...prev, updated: timeAgo(fetchedAtRef.current) } : prev)
      }
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return weather
}
