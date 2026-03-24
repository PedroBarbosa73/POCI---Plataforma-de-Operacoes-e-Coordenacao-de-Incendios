export function mulberry32(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

export function buildIrregularPerimeter(incident) {
  const baseKm = (incident.fireRadiusKm ?? incident.brushRadiusKm ?? 18) * 0.55;
  const points = 72;
  const seed = seedFromId(incident.id);
  const rand = mulberry32(seed);

  // Unique phase offsets per incident
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;
  const p4 = rand() * Math.PI * 2;

  // Wind elongation in prevailing NE direction
  const windDeg = incident.windDeg ?? 45;
  const windRad = (windDeg * Math.PI) / 180;

  const coords = [];
  for (let i = 0; i < points; i += 1) {
    const angle = (Math.PI * 2 * i) / points;

    // Layered sine waves — smooth organic boundary
    const noise =
      1.0
      + 0.18 * Math.sin(2 * angle + p1)
      + 0.12 * Math.sin(3 * angle + p2)
      + 0.07 * Math.sin(5 * angle + p3)
      + 0.04 * Math.sin(9 * angle + p4);

    // ~20% elongation in wind direction
    const windBias = 1 + 0.22 * Math.cos(angle - windRad);

    const rKm = baseKm * noise * windBias;
    const dLat = rKm / 111;
    const dLng = rKm / (111 * Math.cos((incident.lat * Math.PI) / 180));
    coords.push([incident.lat + Math.sin(angle) * dLat, incident.lng + Math.cos(angle) * dLng]);
  }
  return coords;
}

// Type-specific border color for unit badges
export function unitTypeColor(type) {
  const map = {
    bombeiros: '#f97316',
    gnr:       '#3b82f6',
    anepc:     '#ef4444',
    municipal: '#a855f7',
    air:       '#06b6d4',
    logistics: '#22c55e',
    other:     '#22c55e',
  };
  return map[type] || '#6b7280';
}

// Incident badge (circle with glyph)
export function mapIconHtml(label, fill, glyph) {
  return `
    <div class="map-icon-badge" style="background:${fill}" title="${label}">
      <span class="map-icon-glyph">${glyph}</span>
    </div>
  `;
}

// Haversine straight-line distance in km
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Estimated road travel time (straight-line × road factor ÷ speed)
export function estimatedMinutes(straightKm, speedKmh = 70) {
  const roadFactor = 1.35
  return Math.round((straightKm * roadFactor / speedKmh) * 60)
}

// Fire station map marker
export function stationIconHtml(name, type) {
  const colors = { voluntarios: '#1d4ed8', sapadores: '#dc2626', municipais: '#7c3aed' }
  const c = colors[type] || '#1d4ed8'
  return `
    <div class="map-station-badge" style="border-color:${c}">
      <div class="map-station-dot" style="background:${c}">Q</div>
      <span class="map-station-text">${name}</span>
    </div>`
}

// Unit label badge — full pill in type color, status shown as border
export function unitIconHtml(name, statusColor, glyph, typeColor, isLetter = false) {
  const glyphSize = isLetter ? 'font-size:11px;font-weight:800' : 'font-size:12px';
  return `
    <div class="map-unit-badge" style="background:${typeColor};border-color:${statusColor}">
      <span class="map-unit-glyph" style="${glyphSize}">${glyph}</span>
      <span class="map-unit-text">${name}</span>
    </div>
  `;
}
