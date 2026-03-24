'use client';

import Panel from './Panel';
import { useWeather } from '../../lib/useWeather';

export default function WeatherPanel({ lat, lng }) {
  const weather = useWeather(lat, lng);

  if (!weather) return (
    <Panel title="Meteorologia" icon="M" badge="a carregar…" badgeClass="green">
      <div className="wx-strip" style={{ color: 'var(--text-muted)' }}>A obter dados meteorológicos…</div>
    </Panel>
  );

  const humidityColor =
    weather.humidity < 20
      ? 'var(--accent-red)'
      : weather.humidity < 30
      ? 'var(--accent-orange)'
      : 'var(--text-secondary)';

  return (
    <Panel title="Meteorologia" icon="M" badge={weather.updated} badgeClass="green">
      <div className="wx-strip">
        <span className="wx-strip-item">
          <span className="wx-strip-arrow" style={{ transform: `rotate(${weather.directionDeg}deg)` }}>↑</span>
          {weather.direction}
        </span>
        <span className="wx-strip-sep">·</span>
        <span className="wx-strip-item">
          <span className="wx-strip-val">{weather.windSpeed}</span> km/h
        </span>
        <span className="wx-strip-sep">·</span>
        <span className="wx-strip-item">
          Raj <span className="wx-strip-val" style={{ color: 'var(--accent-orange)' }}>{weather.gusts}</span>
        </span>
        <span className="wx-strip-sep">·</span>
        <span className="wx-strip-item">
          <span className="wx-strip-val">{weather.temperature}°C</span>
        </span>
        <span className="wx-strip-sep">·</span>
        <span className="wx-strip-item" style={{ color: humidityColor }}>
          <span className="wx-strip-val" style={{ color: humidityColor }}>{weather.humidity}%</span>
          {weather.humidity < 30 && <span> ⚠</span>}
        </span>
      </div>
    </Panel>
  );
}
