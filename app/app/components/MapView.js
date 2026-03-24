'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { buildIrregularPerimeter, mapIconHtml, unitIconHtml, unitTypeColor, stationIconHtml } from '../lib/mapUtils';

const MapView = forwardRef(function MapView(
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
    allUnits = [],
    unitAssignments = {},
    animatedPositions = {},
    incidentLat,
    incidentLng,
    allIncidents = [],
    allFireStations = [],
  },
  ref
) {
  const mapRef = useRef(null);
  const mapElRef = useRef(null);
  const fireCanvasRef = useRef(null);
  const redrawRef = useRef(null);
  const requestRedrawRef = useRef(null);
  const showZonesRef = useRef(showZones);
  const selectedIncidentRef = useRef(selectedIncidentId);
  const zonesByIncidentRef = useRef(zonesByIncident);
  const isPublicRef = useRef(isPublic);
  const incidentMarkersRef = useRef({});
  const unitMarkersRef = useRef({});
  const closureLayersRef = useRef({});
  const riskOverlaysRef = useRef({});
  const riskOverlayRef = useRef(null);
  const stationsLayerRef = useRef(null);
  const LRef = useRef(null);
  const drawnZonesLayerRef = useRef(null);
  const drawnClosuresLayerRef = useRef(null);
  const completeDrawingRef = useRef(null);
  const cancelDrawingRef = useRef(null);
  const drawPointsRef = useRef([]);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const incidentLayerRef = useRef(null);
  const customIncidentsRef = useRef(customIncidents);
  const onPlaceIncidentRef = useRef(onPlaceIncident);
  const unitStatusesRef = useRef({})
  const allUnitsRef = useRef([])
  const unitAssignmentsRef = useRef({})
  const unitLayerRef = useRef(null)
  const unitClusterLayerRef = useRef(null)
  const unitPlainLayerRef = useRef(null)
  const unitsVisibleRef = useRef(true)

  const [drawingMode, setDrawingMode] = useState(null);
  const [drawPoints, setDrawPoints] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [clusterEnabled, setClusterEnabled] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [windyOpen, setWindyOpen] = useState(false);

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
    if (unit.type === 'logistics' || unit.type === 'other') return 'L'
    return 'L'
  }

  // Keep refs in sync with props for use inside stale closures
  useEffect(() => {
    showZonesRef.current = showZones;
    if (requestRedrawRef.current) requestRedrawRef.current();
  }, [showZones]);

  useEffect(() => {
    selectedIncidentRef.current = selectedIncidentId;
    if (requestRedrawRef.current) requestRedrawRef.current();
    if (!selectedIncidentId) setToolsOpen(false);
  }, [selectedIncidentId]);

  useEffect(() => {
    zonesByIncidentRef.current = zonesByIncident;
    if (requestRedrawRef.current) requestRedrawRef.current();
  }, [zonesByIncident]);

  useEffect(() => {
    isPublicRef.current = isPublic;
    if (isPublic && mapRef.current) {
      if (unitClusterLayerRef.current) mapRef.current.removeLayer(unitClusterLayerRef.current);
      if (unitPlainLayerRef.current) mapRef.current.removeLayer(unitPlainLayerRef.current);
    }
    if (requestRedrawRef.current) requestRedrawRef.current();
  }, [isPublic]);

  useEffect(() => {
    onDrawCompleteRef.current = onDrawComplete;
  }, [onDrawComplete]);

  useEffect(() => {
    onPlaceIncidentRef.current = onPlaceIncident;
  }, [onPlaceIncident]);

  useEffect(() => {
    customIncidentsRef.current = customIncidents;
  }, [customIncidents]);

  useEffect(() => { unitStatusesRef.current = unitStatuses }, [unitStatuses])
  useEffect(() => { allUnitsRef.current = allUnits || [] }, [allUnits])
  useEffect(() => { unitAssignmentsRef.current = unitAssignments }, [unitAssignments])

  // Reactive: rebuild unit markers when allUnits changes (e.g. after Supabase load)
  useEffect(() => {
    if (!mapReady) return
    const L = LRef.current
    const clusterLayer = unitClusterLayerRef.current
    const plainLayer = unitPlainLayerRef.current
    if (!L || !clusterLayer) return

    // Remove all existing unit markers
    Object.values(unitMarkersRef.current).forEach(m => {
      if (clusterLayer.hasLayer(m)) clusterLayer.removeLayer(m)
      if (plainLayer && plainLayer.hasLayer(m)) plainLayer.removeLayer(m)
    })
    unitMarkersRef.current = {}

    allUnits.forEach(unit => {
      if (unit.lat == null || unit.lng == null) return
      const status = unitStatusesRef.current[unit.id] || unit.status || 'available'
      const statusColor = unitStatusColor(status)
      const typeColor = unitTypeColor(unit.type)
      const glyph = unitGlyph(unit)
      const isLetter = unit.type !== 'air'
      const icon = L.divIcon({
        className: 'map-icon map-unit',
        html: unitIconHtml(unit.name, statusColor, glyph, typeColor, isLetter),
        iconSize: [140, 24],
        iconAnchor: [10, 12],
        popupAnchor: [70, -10],
      })
      const targetLayer = unitPlainLayerRef.current && !clusterEnabled ? unitPlainLayerRef.current : clusterLayer
      const marker = L.marker([unit.lat, unit.lng], { icon })
        .bindPopup(`<b>${unit.name}</b><br>${unit.id}`)
        .addTo(targetLayer)
      unitMarkersRef.current[unit.id] = marker
    })
  }, [allUnits, mapReady]) // eslint-disable-line

  // Reactive: rebuild incident markers + fire perimeters when allIncidents changes
  useEffect(() => {
    if (!mapReady) return
    const L = LRef.current
    const incidentLayer = incidentLayerRef.current
    const riskOverlay = riskOverlayRef.current
    if (!L || !incidentLayer || !riskOverlay) return

    // Remove existing non-custom incident markers
    Object.keys(incidentMarkersRef.current)
      .filter(id => !id.startsWith('CUST-'))
      .forEach(id => {
        const m = incidentMarkersRef.current[id]
        if (m) { incidentLayer.removeLayer(m); delete incidentMarkersRef.current[id] }
      })
    // Clear risk overlays
    Object.values(riskOverlaysRef.current).forEach(o => riskOverlay.removeLayer(o))
    riskOverlaysRef.current = {}

    const incidentColors = { active: '#ff3b3b', controlled: '#ffd166', surveillance: '#4facfe', resolved: '#06d6a0' }
    allIncidents.forEach(incident => {
      if (incident.lat == null || incident.lng == null) return
      const perimeter = buildIrregularPerimeter(incident)
      const overlay = L.polygon(perimeter, {
        color: '#ff3b2f', weight: 2, opacity: 0.8, fillColor: '#ffb04a', fillOpacity: 0.55,
      }).addTo(riskOverlay)
      riskOverlaysRef.current[incident.id] = overlay

      const color = incidentColors[incident.status] || '#ffffff'
      const icon = L.divIcon({
        className: 'map-icon',
        html: mapIconHtml(incident.name, color, '🔥'),
        iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -10],
      })
      const marker = L.marker([incident.lat, incident.lng], { icon })
        .bindPopup(`${incident.name} (${incident.id})`)
        .addTo(incidentLayer)
      incidentMarkersRef.current[incident.id] = marker
    })
  }, [allIncidents, mapReady]) // eslint-disable-line

  // Reactive: rebuild fire station markers when allFireStations changes
  useEffect(() => {
    if (!mapReady) return
    const L = LRef.current
    const stationsLayer = stationsLayerRef.current
    if (!L || !stationsLayer) return

    stationsLayer.clearLayers()
    allFireStations.forEach(station => {
      if (station.lat == null || station.lng == null) return
      const icon = L.divIcon({
        className: 'map-icon map-unit',
        html: stationIconHtml(station.name, station.type),
        iconSize: [160, 22], iconAnchor: [10, 11], popupAnchor: [70, -8],
      })
      L.marker([station.lat, station.lng], { icon })
        .bindPopup(`<b>${station.name}</b><br>${station.type === 'sapadores' ? 'Bombeiros Sapadores' : station.type === 'municipais' ? 'Bombeiros Municipais' : 'Bombeiros Voluntários'}`)
        .addTo(stationsLayer)
    })
  }, [allFireStations, mapReady]) // eslint-disable-line

  // Reactive: update unit marker icon colors when unitStatuses changes
  useEffect(() => {
    if (!mapReady) return
    const L = LRef.current
    if (!L) return
    ;(allUnitsRef.current || []).forEach(unit => {
      const marker = unitMarkersRef.current[unit.id]
      if (!marker) return
      const status = unitStatusesRef.current[unit.id] || unit.status || 'available'
      const statusColor = unitStatusColor(status)
      const typeColor = unitTypeColor(unit.type)
      const glyph = unitGlyph(unit)
      const isLetter = unit.type !== 'air'
      marker.setIcon(L.divIcon({
        className: 'map-icon map-unit',
        html: unitIconHtml(unit.name, statusColor, glyph, typeColor, isLetter),
        iconSize: [140, 24],
        iconAnchor: [10, 12],
        popupAnchor: [70, -10],
      }))
    })
  }, [unitStatuses, mapReady])

  // Reactive: move unit markers to animated positions
  useEffect(() => {
    if (!mapReady) return
    Object.entries(animatedPositions).forEach(([unitId, [lat, lng]]) => {
      const marker = unitMarkersRef.current[unitId]
      if (!marker) return // graceful no-op for units not yet in ref
      marker.setLatLng([lat, lng])
    })
  }, [animatedPositions, mapReady])

  // Expose focus methods to parent via ref
  useImperativeHandle(ref, () => ({
    focusIncident(incidentId) {
      const allIncs = [...allIncidents, ...(customIncidentsRef.current || [])];
      const incident = allIncs.find((i) => i.id === incidentId);
      if (!incident || !mapRef.current) return;
      mapRef.current.setView([incident.lat, incident.lng], 12, { animate: true });
    },
    focusUnit(unitId) {
      const marker = unitMarkersRef.current[unitId]
      if (!marker || !mapRef.current) return
      mapRef.current.setView(marker.getLatLng(), 15, { animate: true })
    },
    focusClosure(closureId) {
      const layer = closureLayersRef.current[closureId];
      if (!layer || !mapRef.current) return;
      mapRef.current.fitBounds(layer.getBounds(), { padding: [80, 80] });
      layer.openPopup();
    },
    startDrawing(mode) {
      setDrawingMode(mode);
    },
  }));

  // Map initialization — runs once
  useEffect(() => {
    let mounted = true;
    let mapInstance = null;
    let rafPending = false;

    async function initMap() {
      if (!mapElRef.current || mapRef.current) return;
      const mod = await import('leaflet');
      if (!mounted) return;
      const L = mod.default ?? mod;
      LRef.current = L;

      mapInstance = L.map(mapElRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([39.6, -8.0], 7);

      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapInstance);

      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri' }
      );

      const dark = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { attribution: '&copy; OpenStreetMap & CARTO' }
      );

      const darkLabels = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        { attribution: '&copy; OpenStreetMap & CARTO' }
      );

      const incidentLayer = L.layerGroup().addTo(mapInstance);
      incidentLayerRef.current = incidentLayer;
      await import('leaflet.markercluster')
      const clusterLayer = L.markerClusterGroup({
        maxClusterRadius: 55,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 14,
      });
      if (!isPublicRef.current) clusterLayer.addTo(mapInstance);
      const plainLayer = L.layerGroup();
      unitClusterLayerRef.current = clusterLayer;
      unitPlainLayerRef.current = plainLayer;
      unitLayerRef.current = clusterLayer;
      const closureLayer = L.layerGroup().addTo(mapInstance);
      const zonesOverlay = L.layerGroup().addTo(mapInstance);
      const riskOverlay = L.layerGroup().addTo(mapInstance);
      riskOverlayRef.current = riskOverlay;

      const drawnZonesLayer = L.layerGroup().addTo(mapInstance);
      drawnZonesLayerRef.current = drawnZonesLayer;
      const drawnClosuresLayer = L.layerGroup().addTo(mapInstance);
      drawnClosuresLayerRef.current = drawnClosuresLayer;

      riskOverlaysRef.current = {};
      allIncidents.forEach((incident) => {
        const perimeter = buildIrregularPerimeter(incident);
        const overlay = L.polygon(perimeter, {
          color: '#ff3b2f',
          weight: 2,
          opacity: 0.8,
          fillColor: '#ffb04a',
          fillOpacity: 0.55,
        }).addTo(riskOverlay);
        riskOverlaysRef.current[incident.id] = overlay;
      });

      const incidentColors = {
        active: '#ff3b3b',
        controlled: '#ffd166',
        surveillance: '#4facfe',
        resolved: '#06d6a0',
      };

      incidentMarkersRef.current = {};
      allIncidents.forEach((incident) => {
        const color = incidentColors[incident.status] || '#ffffff';
        const icon = L.divIcon({
          className: 'map-icon',
          html: mapIconHtml(incident.name, color, '🔥'),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -10],
        });
        const marker = L.marker([incident.lat, incident.lng], { icon })
          .bindPopup(`${incident.name} (${incident.id})`)
          .addTo(incidentLayer);
        incidentMarkersRef.current[incident.id] = marker;
      });

      unitMarkersRef.current = {};
      allUnits.forEach((unit) => {
        const status = unitStatusesRef.current[unit.id] || unit.status || 'available'
        const statusColor = unitStatusColor(status)
        const typeColor = unitTypeColor(unit.type)
        const glyph = unitGlyph(unit)
        const isLetter = unit.type !== 'air'
        const icon = L.divIcon({
          className: 'map-icon map-unit',
          html: unitIconHtml(unit.name, statusColor, glyph, typeColor, isLetter),
          iconSize: [140, 24],
          iconAnchor: [10, 12],
          popupAnchor: [70, -10],
        })
        const marker = L.marker([unit.lat, unit.lng], { icon })
          .bindPopup(`<b>${unit.name}</b><br>${unit.id}`)
          .addTo(clusterLayer)
        unitMarkersRef.current[unit.id] = marker
      });

      closureLayersRef.current = {};
      drawnClosures.forEach((closure) => {
        const line = L.polyline(closure.path ?? closure.points ?? [], {
          color: closure.status === 'active' ? '#ff3b3b' : '#ffd166',
          weight: 3,
          dashArray: '6 6',
        })
          .bindPopup(closure.name)
          .addTo(closureLayer);
        closureLayersRef.current[closure.id] = line;
      });

      // ── Fire stations layer ──────────────────────────────────────────
      const stationsLayer = L.layerGroup(); // OFF by default (not added to map)
      stationsLayerRef.current = stationsLayer;
      allFireStations.forEach((station) => {
        const icon = L.divIcon({
          className: 'map-icon map-unit',
          html: stationIconHtml(station.name, station.type),
          iconSize: [160, 22],
          iconAnchor: [10, 11],
          popupAnchor: [70, -8],
        });
        L.marker([station.lat, station.lng], { icon })
          .bindPopup(`<b>${station.name}</b><br>${station.type === 'sapadores' ? 'Bombeiros Sapadores' : station.type === 'municipais' ? 'Bombeiros Municipais' : 'Bombeiros Voluntários'}`)
          .addTo(stationsLayer);
      });

      L.control.layers(
        { Topográfico: osm, Satélite: satellite, Noturno: dark },
        {
          Incidentes: incidentLayer,
          Unidades: clusterLayer,
          'Quartéis': stationsLayer,
          'Cortes de estrada': closureLayer,
          'Perímetro de fogo (mock)': riskOverlay,
          'Zonas visíveis': zonesOverlay,
          'Zonas desenhadas': drawnZonesLayer,
          'Cortes desenhados': drawnClosuresLayer,
        },
        { position: 'topright' }
      ).addTo(mapInstance);

      darkLabels.addTo(mapInstance);

      mapInstance.on('overlayremove', (e) => {
        if (e.name === 'Unidades') {
          unitsVisibleRef.current = false;
          if (mapInstance.hasLayer(unitPlainLayerRef.current)) mapInstance.removeLayer(unitPlainLayerRef.current);
          if (mapInstance.hasLayer(unitClusterLayerRef.current)) mapInstance.removeLayer(unitClusterLayerRef.current);
        }
      });
      mapInstance.on('overlayadd', (e) => {
        if (e.name === 'Unidades') {
          unitsVisibleRef.current = true;
          const activeLayer = unitLayerRef.current;
          if (activeLayer && !mapInstance.hasLayer(activeLayer)) {
            activeLayer.addTo(mapInstance);
          }
        }
      });

      mapInstance.on('baselayerchange', (e) => {
        if (e.name === 'Noturno') {
          if (!mapInstance.hasLayer(darkLabels)) darkLabels.addTo(mapInstance);
        } else if (mapInstance.hasLayer(darkLabels)) {
          mapInstance.removeLayer(darkLabels);
        }
      });

      L.control.scale({ metric: true }).addTo(mapInstance);

      mapInstance.on('overlayadd', (e) => {
        if (e.layer === zonesOverlay) {
          showZonesRef.current = true;
          if (onShowZonesChange) onShowZonesChange(true);
          if (requestRedrawRef.current) requestRedrawRef.current();
        }
      });

      mapInstance.on('overlayremove', (e) => {
        if (e.layer === zonesOverlay) {
          showZonesRef.current = false;
          if (onShowZonesChange) onShowZonesChange(false);
          if (requestRedrawRef.current) requestRedrawRef.current();
        }
      });

      const canvas = document.createElement('canvas');
      canvas.className = 'fire-brush-canvas';
      const container = mapInstance.getContainer();
      canvas.style.zIndex = '450';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.cursor = 'default';
      container.appendChild(canvas);
      fireCanvasRef.current = canvas;

      const resizeCanvas = () => {
        const size = mapInstance.getSize();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size.x * dpr;
        canvas.height = size.y * dpr;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        requestRedraw();
      };

      const requestRedraw = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          redraw();
        });
      };

      const redraw = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const zoom = mapInstance.getZoom();
        const zoomFactor = Math.max(0.4, Math.min(1, Math.pow(1.12, zoom - 10)));

        const metersPerPixelAt = (lat, lng) => {
          const p1 = mapInstance.latLngToContainerPoint([lat, lng]);
          const p2 = mapInstance.latLngToContainerPoint([lat, lng + 0.01]);
          const meters = mapInstance.distance([lat, lng], [lat, lng + 0.01]);
          const pixels = Math.max(1, Math.abs(p2.x - p1.x));
          return meters / pixels;
        };

        const activeIncident = selectedIncidentRef.current;
        const keys = activeIncident ? [activeIncident] : allIncidents.map((i) => i.id);
        keys.forEach((key) => {
          const incident = allIncidents.find((i) => i.id === key);
          if (!incident) return;
          const metersPerPixel = metersPerPixelAt(incident.lat, incident.lng);
          const center = mapInstance.latLngToContainerPoint([incident.lat, incident.lng]);

          if (showZonesRef.current && !isPublicRef.current) {
            const zones = zonesByIncidentRef.current[key] || [];
            zones.forEach((zone) => {
              if (zone.points) return;
              const zoneColor =
                zone.type === 'exclusao'
                  ? `rgba(255, 90, 90, ${0.18 * zoomFactor})`
                  : zone.type === 'seguranca'
                  ? `rgba(120, 220, 170, ${0.18 * zoomFactor})`
                  : `rgba(255, 200, 80, ${0.20 * zoomFactor})`;
              const zoneMeters = (zone.radiusKm || 6) * 1000;
              const zonePx = (zoneMeters / metersPerPixel) * zoomFactor;
              ctx.fillStyle = zoneColor;
              ctx.beginPath();
              ctx.arc(center.x, center.y, zonePx, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        });
      };

      redrawRef.current = redraw;
      requestRedrawRef.current = requestRedraw;

      mapInstance.on('resize move zoom moveend zoomend', requestRedraw);
      mapInstance.whenReady(() => {
        resizeCanvas();
        requestRedraw();
        // Apply initial visibility now that markers are in the DOM
        if (isPublicRef.current) {
          Object.values(unitMarkersRef.current).forEach((marker) => {
            const el = marker.getElement?.();
            if (el) {
              el.style.opacity = '0';
              el.style.pointerEvents = 'none';
              el.style.display = 'none';
            }
          });
        }
      });
      setTimeout(resizeCanvas, 0);
      mapRef.current = mapInstance;
      setMapReady(true);
    }

    initMap();

    return () => {
      mounted = false;
      if (fireCanvasRef.current) {
        fireCanvasRef.current.replaceWith(fireCanvasRef.current.cloneNode(false));
      }
      if (mapInstance) {
        mapInstance.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Drawing mode useEffect
  useEffect(() => {
    if (!drawingMode) return;
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    drawPointsRef.current = [];
    setDrawPoints([]);

    const tempGroup = L.layerGroup().addTo(map);
    map.getContainer().style.cursor = 'crosshair';

    const lineColor = drawingMode === 'closure' ? '#ff3b3b' : '#4facfe';

    const refreshDisplay = (cursorLatLng) => {
      tempGroup.clearLayers();
      const pts = drawPointsRef.current;
      if (pts.length === 0) return;

      // Preview polyline from existing points + cursor
      const previewPts = cursorLatLng ? [...pts, cursorLatLng] : pts;
      if (previewPts.length >= 2) {
        L.polyline(previewPts, {
          color: lineColor,
          weight: 2,
          dashArray: '5 5',
          opacity: 0.8,
        }).addTo(tempGroup);
      }

      // For zone with 3+ pts, show closing line preview
      if (drawingMode === 'zone' && pts.length >= 3 && cursorLatLng) {
        L.polyline([cursorLatLng, pts[0]], {
          color: lineColor,
          weight: 1,
          dashArray: '4 6',
          opacity: 0.5,
        }).addTo(tempGroup);
      }

      // Draw vertex markers
      pts.forEach((pt, idx) => {
        const isFirst = idx === 0;
        let glowFirst = false;
        if (isFirst && cursorLatLng) {
          const firstPx = map.latLngToContainerPoint(pt);
          const cursorPx = map.latLngToContainerPoint(cursorLatLng);
          const dx = firstPx.x - cursorPx.x;
          const dy = firstPx.y - cursorPx.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          glowFirst = dist < 20;
        }
        L.circleMarker(pt, {
          radius: isFirst ? 7 : 5,
          color: isFirst && glowFirst ? '#00ff88' : lineColor,
          fillColor: isFirst && glowFirst ? '#00ff88' : lineColor,
          fillOpacity: 0.8,
          weight: 2,
        }).addTo(tempGroup);
      });
    };

    const completeDrawing = () => {
      const pts = drawPointsRef.current;
      const minPts = drawingMode === 'zone' ? 3 : 2;
      if (pts.length < minPts) return;
      cleanup();
      setDrawingMode(null);
      setDrawPoints([]);
      onDrawCompleteRef.current?.({ mode: drawingMode, points: pts });
    };

    const cancelDrawing = () => {
      cleanup();
      setDrawingMode(null);
      setDrawPoints([]);
    };

    completeDrawingRef.current = completeDrawing;
    cancelDrawingRef.current = cancelDrawing;

    const onClick = (e) => {
      const pts = drawPointsRef.current;
      // For zone with 3+ points, check if near first point to close
      if (drawingMode === 'zone' && pts.length >= 3) {
        const firstPx = map.latLngToContainerPoint(pts[0]);
        const cursorPx = map.latLngToContainerPoint(e.latlng);
        const dx = firstPx.x - cursorPx.x;
        const dy = firstPx.y - cursorPx.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20) {
          completeDrawing();
          return;
        }
      }
      const newPts = [...pts, e.latlng];
      drawPointsRef.current = newPts;
      setDrawPoints([...newPts]);
      refreshDisplay(e.latlng);
    };

    const onMouseMove = (e) => {
      if (drawPointsRef.current.length > 0) {
        refreshDisplay(e.latlng);
      }
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);

    function cleanup() {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.getContainer().style.cursor = '';
      tempGroup.clearLayers();
      map.removeLayer(tempGroup);
      completeDrawingRef.current = null;
      cancelDrawingRef.current = null;
    }

    return () => {
      cleanup();
    };
  }, [drawingMode]);

  // Drawn zones useEffect
  useEffect(() => {
    const L = LRef.current;
    const layer = drawnZonesLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    const zoneStyles = {
      exclusao: { color: '#ff5a5a', fillColor: '#ff3b2f', fillOpacity: 0.18, weight: 2 },
      ataque: { color: '#ffb04a', fillColor: '#ff8c00', fillOpacity: 0.15, weight: 2 },
      seguranca: { color: '#78dcaa', fillColor: '#06d6a0', fillOpacity: 0.15, weight: 2 },
      apoio: { color: '#4facfe', fillColor: '#4facfe', fillOpacity: 0.12, weight: 2 },
    };

    Object.entries(zonesByIncident).forEach(([incidentId, zones]) => {
      if (selectedIncidentId && incidentId !== selectedIncidentId) return;
      (zones || []).forEach((zone) => {
        if (!zone.points) return;
        const style = zoneStyles[zone.type] || zoneStyles.apoio;
        L.polygon(zone.points, style).bindPopup(zone.name).addTo(layer);
      });
    });
  }, [zonesByIncident, selectedIncidentId]);

  // Drawn closures useEffect
  useEffect(() => {
    const L = LRef.current;
    const layer = drawnClosuresLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    (drawnClosures || []).forEach((closure) => {
      if (selectedIncidentId && (closure.incident_id ?? closure.incident) !== selectedIncidentId) return;
      L.polyline(closure.path ?? closure.points ?? [], {
        color: closure.status === 'active' ? '#ff3b3b' : '#ffd166',
        weight: 3,
        dashArray: '6 6',
      })
        .bindPopup(closure.name)
        .addTo(layer);
    });
  }, [drawnClosures, selectedIncidentId]);

  // Placement mode useEffect
  useEffect(() => {
    if (!placingIncident) return;
    const map = mapRef.current;
    if (!map) return;

    map.getContainer().style.cursor = 'crosshair';

    const onClick = (e) => {
      map.getContainer().style.cursor = '';
      map.off('click', onClick);
      onPlaceIncidentRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    };

    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      if (map.getContainer()) map.getContainer().style.cursor = '';
    };
  }, [placingIncident]);

  // Custom incidents markers useEffect
  useEffect(() => {
    const L = LRef.current;
    const layer = incidentLayerRef.current;
    if (!L || !layer) return;

    // Remove previous custom markers
    const prevIds = Object.keys(incidentMarkersRef.current).filter((id) => id.startsWith('CUST-'));
    prevIds.forEach((id) => {
      const m = incidentMarkersRef.current[id];
      if (m) { layer.removeLayer(m); delete incidentMarkersRef.current[id]; }
    });

    const incidentColors = {
      active: '#ff3b3b',
      controlled: '#ffd166',
      surveillance: '#4facfe',
    };
    (customIncidents || []).filter(inc => inc.lat != null && inc.lng != null).forEach((inc) => {
      const color = incidentColors[inc.status] || '#ff3b3b';
      const icon = L.divIcon({
        className: 'map-icon',
        html: mapIconHtml(inc.name, color, '🔥'),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -10],
      });
      const marker = L.marker([inc.lat, inc.lng], { icon })
        .bindPopup(`${inc.name} (${inc.id})`)
        .addTo(layer);
      incidentMarkersRef.current[inc.id] = marker;
    });
  }, [customIncidents, mapReady]);

  // Incident marker visibility
  useEffect(() => {
    Object.entries(incidentMarkersRef.current).forEach(([id, marker]) => {
      if (!marker || id === '__fire') return;
      const hide = Boolean(selectedIncidentId && id !== selectedIncidentId);
      // setOpacity persists across zoom/pan redraws; getElement() may be null if off-screen
      marker.setOpacity(hide ? 0 : 1);
      const el = marker.getElement?.();
      if (el) el.style.pointerEvents = hide ? 'none' : 'auto';
      if (hide && marker.isPopupOpen?.()) marker.closePopup();
    });
  }, [selectedIncidentId]);

  // Toggle clustering: swap markers between cluster and plain layer
  useEffect(() => {
    if (!mapReady) return;
    const clusterLayer = unitClusterLayerRef.current;
    const plainLayer = unitPlainLayerRef.current;
    const map = mapRef.current;
    if (!clusterLayer || !plainLayer || !map) return;

    const markers = Object.values(unitMarkersRef.current);
    if (clusterEnabled) {
      const wasVisible = map.hasLayer(plainLayer);
      markers.forEach(m => { if (plainLayer.hasLayer(m)) plainLayer.removeLayer(m); });
      markers.forEach(m => { if (!clusterLayer.hasLayer(m)) clusterLayer.addLayer(m); });
      if (map.hasLayer(plainLayer)) map.removeLayer(plainLayer);
      if ((wasVisible || (!map.hasLayer(clusterLayer) && unitsVisibleRef.current)) && !isPublicRef.current) clusterLayer.addTo(map);
      unitLayerRef.current = clusterLayer;
    } else {
      const wasVisible = map.hasLayer(clusterLayer);
      markers.forEach(m => { if (clusterLayer.hasLayer(m)) clusterLayer.removeLayer(m); });
      markers.forEach(m => { if (!plainLayer.hasLayer(m)) plainLayer.addLayer(m); });
      if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
      if ((wasVisible || (!map.hasLayer(plainLayer) && unitsVisibleRef.current)) && !isPublicRef.current) plainLayer.addTo(map);
      unitLayerRef.current = plainLayer;
    }
  }, [clusterEnabled, mapReady]);

  // Unit marker visibility — add/remove from active layer (setOpacity doesn't work in clusters)
  useEffect(() => {
    const layer = unitLayerRef.current;
    if (!layer) return;

    Object.entries(unitMarkersRef.current).forEach(([id, marker]) => {
      if (!marker) return;

      if (isPublic) {
        if (layer.hasLayer(marker)) layer.removeLayer(marker);
        return;
      }

      const unit = allUnits.find((u) => u.id === id);
      const assignment = unitAssignmentsRef.current[id];
      // Fall back to unit.incident when assignment not yet in state (stale localStorage)
      const effectiveIncident = assignment !== undefined ? assignment : unit?.incident;
      const belongsToSelected = !selectedIncidentId || effectiveIncident === selectedIncidentId;

      if (belongsToSelected) {
        if (!layer.hasLayer(marker)) layer.addLayer(marker);
      } else {
        if (layer.hasLayer(marker)) layer.removeLayer(marker);
        if (marker.isPopupOpen?.()) marker.closePopup();
      }
    });
  }, [selectedIncidentId, selectedUnitId, isPublic, clusterEnabled, unitAssignments]);

  // Selected unit highlight
  useEffect(() => {
    if (!mapReady) return
    Object.entries(unitMarkersRef.current).forEach(([id, marker]) => {
      const el = marker?.getElement?.()
      if (!el) return
      const badge = el.querySelector('.map-unit-badge')
      if (!badge) return
      if (id === selectedUnitId) badge.classList.add('unit-selected')
      else badge.classList.remove('unit-selected')
    })
  }, [selectedUnitId])

  // Risk overlay visibility
  useEffect(() => {
    Object.entries(riskOverlaysRef.current).forEach(([id, overlay]) => {
      if (!overlay?.setStyle) return;
      const hide = selectedIncidentId && id !== selectedIncidentId;
      overlay.setStyle({ opacity: hide ? 0 : 0.8, fillOpacity: hide ? 0 : 0.55 });
    });
  }, [selectedIncidentId]);

  // Closure layer visibility
  useEffect(() => {
    Object.entries(closureLayersRef.current).forEach(([id, layer]) => {
      const closure = drawnClosures.find((c) => c.id === id);
      const hide = selectedIncidentId && closure && (closure.incident_id ?? closure.incident) !== selectedIncidentId;
      if (layer?.setStyle) layer.setStyle({ opacity: hide ? 0 : 1 });
    });
  }, [selectedIncidentId]);

  return (
    <div className="map-container">
      <div ref={mapElRef} className="map-leaflet" />

      {/* High-z controls — sit above Leaflet's own controls */}
      {isCommandView && (
        <div className="map-controls-topright">
          <button
            className={`map-ctrl-btn ${clusterEnabled ? '' : 'map-ctrl-btn-active'}`}
            onClick={() => setClusterEnabled(v => !v)}
            title="Ativar/desativar agrupamento de unidades"
          >
            {clusterEnabled ? '⊕ Clustering' : '⊕ Clustering Off'}
          </button>

          <button
            className={`map-ctrl-btn ${windyOpen ? 'map-ctrl-btn-active' : ''}`}
            onClick={() => setWindyOpen(v => !v)}
            title="Mapa meteorológico Windy"
          >
            🌬 Meteorologia
          </button>

          {selectedIncidentId && (
            <div className="map-tools-wrap">
              <button
                className={`map-ctrl-btn ${drawingMode ? 'map-ctrl-btn-active' : ''}`}
                onClick={() => setToolsOpen(v => !v)}
                title="Ferramentas de edição"
              >
                ✏ Editar
              </button>
              {toolsOpen && !drawingMode && (
                <div className="map-tools-dropdown">
                  <button className="map-tools-item" onClick={() => { setDrawingMode('zone'); setToolsOpen(false); }}>
                    Desenhar zona
                  </button>
                  <button className="map-tools-item" onClick={() => { setDrawingMode('closure'); setToolsOpen(false); }}>
                    Cortar estrada
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Entity legend */}
      {isCommandView && (
        <div className="map-legend">
          <div className="map-legend-title">Legenda</div>
          {[
            { color: '#ef4444', glyph: 'A', label: 'ANEPC' },
            { color: '#f97316', glyph: 'B', label: 'Bombeiros' },
            { color: '#3b82f6', glyph: 'G', label: 'GNR' },
            { color: '#a855f7', glyph: 'M', label: 'Municipal' },
            { color: '#06b6d4', glyph: '✈', label: 'Aéreo' },
            { color: '#22c55e', glyph: 'L', label: 'Logística' },
          ].map(({ color, glyph, label }) => (
            <div key={label} className="map-legend-item">
              <div className="map-legend-dot" style={{ background: color, border: 'none' }}>
                <span className="map-legend-glyph" style={{ color: '#fff', fontSize: glyph.length > 1 ? 10 : 11 }}>{glyph}</span>
              </div>
              <span className="map-legend-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="map-overlay">
        <div className="map-toolbar">
          {isCommandView && (placingIncident || drawingMode) ? (
            <div className="toolbar-card drawing-active">
              <div className="drawing-mode-label">
                {placingIncident ? 'Nova ocorrência' : drawingMode === 'zone' ? 'Desenhar zona' : 'Cortar estrada'}
              </div>
              <div className="drawing-hint">
                {placingIncident
                  ? 'Clique no mapa para localizar o incidente'
                  : drawingMode === 'zone'
                  ? drawPoints.length < 3 ? 'Clique para adicionar pontos' : 'Clique perto do início para fechar'
                  : drawPoints.length < 2 ? 'Clique para iniciar o corte' : 'Adicione pontos ou termine'}
              </div>
              {!placingIncident && (
                <div className="brush-row">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => completeDrawingRef.current?.()}
                    disabled={drawPoints.length < (drawingMode === 'zone' ? 3 : 2)}
                  >
                    {drawingMode === 'zone' ? 'Fechar polígono' : 'Terminar linha'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => cancelDrawingRef.current?.()}>
                    Cancelar
                  </button>
                </div>
              )}
              {!placingIncident && <div className="drawing-point-count">{drawPoints.length} pontos</div>}
            </div>
          ) : null}
        </div>

        {windyOpen && (() => {
          const lat = (incidentLat ?? 40.38).toFixed(2)
          const lng = (incidentLng ?? -7.54).toFixed(2)
          const src = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lng}&detailLat=${lat}&detailLon=${lng}&zoom=8&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`
          return (
            <div className="map-windy-panel">
              <div className="map-windy-header">
                <span>🌬 Meteorologia — Windy</span>
                <button className="map-windy-close" onClick={() => setWindyOpen(false)}>✕</button>
              </div>
              <iframe
                src={src}
                className="map-windy-iframe"
                allowFullScreen
                title="Windy meteorologia"
              />
            </div>
          )
        })()}

        <div className="map-legend">
          <div className="legend-row">
            <span className="legend-dot" style={{ background: 'var(--status-active)' }}></span>
            Incêndio ativo
          </div>
          <div className="legend-row">
            <span className="legend-dot" style={{ background: 'var(--status-controlled)' }}></span>
            Controlado
          </div>
          <div className="legend-row">
            <span className="legend-dot" style={{ background: 'var(--status-surveillance)' }}></span>
            Vigilância
          </div>
          <div className="legend-row">
            <span className="legend-dot" style={{ background: 'var(--accent-blue)' }}></span>
            Unidades
          </div>
        </div>
      </div>
    </div>
  );
});

export default MapView;
